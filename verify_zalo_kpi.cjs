const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [key, ...val] = line.split('=');
    env[key.trim()] = val.join('=').trim();
  }
});

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const STAFF_UID = '337594525259740835'; // Xuyên (Nhân viên)
const CUST_UID = 'customer_123';
const CUST_NAME = 'Khách Hàng Test';
const STAFF_NAME = 'Nhân Viên Test';
const GROUP_ID = 'group_456';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function insertMessage(uidFrom, name, isGroup, threadId, content, targetUid = null, tsOffset = 0) {
  const ts = Date.now() + tsOffset;
  const rawData = {
    type: isGroup ? '1' : '0',
    data: {
      uidFrom: uidFrom,
      dName: name,
      msgType: 'text',
      idTo: isGroup ? threadId : (uidFrom === STAFF_UID ? CUST_UID : STAFF_UID),
      ts: ts,
      content: { title: content }
    }
  };
  
  if (isGroup) {
    rawData.threadId = threadId;
  }
  
  if (targetUid) {
    rawData.data.quote = { ownerId: targetUid };
  }

  const { data, error } = await db.from('zalo_messages').insert({
    raw_data: rawData
  }).select().single();
  
  if (error) throw error;
  return data;
}

async function checkConversation(threadId, customerUid) {
  const { data, error } = await db.from('zalo_conversations')
    .select('id, is_responded, message_count, content_summary, response_content, customer_uid')
    .eq('thread_id', threadId)
    .eq('customer_uid', customerUid)
    .order('last_message_ts', { ascending: false })
    .limit(1)
    .single();
    
  return data;
}

async function runTests() {
  console.log("=== BẮT ĐẦU TEST 4 TRƯỜNG HỢP (PHASE 3) ===");
  
  // (a) Khách hỏi trước -> NV trả lời (có quote trong nhóm)
  console.log("\nCASE A: Khách hỏi trước -> NV trả lời (Nhóm, có quote)");
  await insertMessage(CUST_UID, CUST_NAME, true, GROUP_ID, 'Case A Hỏi', null, 0);
  await wait(500); // Đợi DB trigger xử lý
  let cA1 = await checkConversation(GROUP_ID, CUST_UID);
  console.log("-> Sau khi khách hỏi:", cA1 ? (cA1.is_responded ? "FAIL (Đã xử lý)" : "PASS (Chờ xử lý)") : "FAIL (Không thấy hội thoại)");
  
  await insertMessage(STAFF_UID, STAFF_NAME, true, GROUP_ID, 'Case A Trả lời', CUST_UID, 1000);
  await wait(500);
  let cA2 = await checkConversation(GROUP_ID, CUST_UID);
  console.log("-> Sau khi NV trả lời:", cA2 && cA2.is_responded ? "PASS (Đã xử lý xong)" : "FAIL");

  // (b) NV nhắn trước -> khách trả lời sau (Nhóm, không quote -> Chat nội bộ; hoặc có quote -> Khách cũ)
  // Trong yêu cầu: NV nhắn trước -> khách trả lời sau. 
  // VD 1-1 chat:
  console.log("\nCASE B & C: Chat 1-1, NV nhắn trước -> Khách nhắn sau (Không Quote)");
  const THREAD_1_1 = CUST_UID; // Trong 1-1 threadId = customerUid
  
  // NV nhắn trước
  await insertMessage(STAFF_UID, STAFF_NAME, false, THREAD_1_1, 'Case B NV chủ động', null, 2000);
  await wait(500);
  let cB1 = await checkConversation(THREAD_1_1, CUST_UID);
  console.log("-> Sau khi NV chủ động nhắn:", cB1 && cB1.is_responded && cB1.message_count === 0 ? "PASS (Tạo Buffer Đã Xử Lý)" : "FAIL");
  
  // Khách nhắn sau
  await insertMessage(CUST_UID, CUST_NAME, false, THREAD_1_1, 'Case B Khách trả lời', null, 3000);
  await wait(500);
  let cB2 = await checkConversation(THREAD_1_1, CUST_UID);
  console.log("-> Sau khi khách nhắn lại:", cB2 && cB2.message_count === 1 ? "PASS (Ghép ngược thành công)" : "FAIL");

  // NV nhắn trả lời tiếp (Chat 1-1 không quote) (Case C)
  await insertMessage(STAFF_UID, STAFF_NAME, false, THREAD_1_1, 'Case C NV trả lời tiếp', null, 4000);
  await wait(500);
  let cC = await checkConversation(THREAD_1_1, CUST_UID);
  console.log("-> Chat 1-1 không Quote NV trả lời:", cC && cC.is_responded && cC.response_content.includes('Case C') ? "PASS (Đã gán trả lời 1-1)" : "FAIL");

  // (d) Webhook NV về trước webhook khách (Race condition trong nhóm)
  console.log("\nCASE D: Race Condition Webhook (Nhóm)");
  const THREAD_RACE = 'group_race';
  const CUST_RACE = 'cust_race';
  // NV về trước (có quote giả định target là CUST_RACE)
  await insertMessage(STAFF_UID, STAFF_NAME, true, THREAD_RACE, 'Case D NV Trả lời (Đến sớm)', CUST_RACE, 6000);
  await wait(500);
  let cD1 = await checkConversation(THREAD_RACE, CUST_RACE);
  console.log("-> Webhook NV đến sớm:", cD1 && cD1.is_responded && cD1.message_count === 0 ? "PASS (Tạo Buffer Đã Xử Lý)" : "FAIL");

  // Khách về sau nhưng ts sớm hơn
  await insertMessage(CUST_RACE, CUST_NAME, true, THREAD_RACE, 'Case D Khách Hỏi (Đến trễ)', null, 5000);
  await wait(500);
  let cD2 = await checkConversation(THREAD_RACE, CUST_RACE);
  console.log("-> Webhook khách đến sau:", cD2 && cD2.is_responded && cD2.message_count === 1 ? "PASS (Ghép ngược, vẫn giữ trạng thái Đã Xử Lý)" : "FAIL");
  
  console.log("\n=== KẾT THÚC TEST ===");
}

runTests().catch(console.error);
