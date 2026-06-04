const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [key, ...val] = line.split('=');
    env[key.trim()] = val.join('=').trim();
  }
});

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function check() {
  console.log("--- BẢNG NHÂN VIÊN ---");
  const { data: nv } = await db.from('nhan_vien').select('*').ilike('name', '%Xuyên%');
  console.log(nv);

  console.log("\n--- CONVERSATIONS GẦN ĐÂY ---");
  const { data: convs } = await db.from('zalo_conversations')
    .select('id, customer_name, customer_uid, thread_id, content_summary, is_responded')
    .order('last_message_ts', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(convs, null, 2));

  console.log("\n--- MESSAGES CỦA THREAD PHẠM VĂN LONG ---");
  // Find Long's thread_id
  const longConv = convs.find(c => c.customer_name && c.customer_name.includes('Long'));
  if (longConv) {
    const { data: msgs } = await db.from('zalo_messages')
      .select('uid_from, sender_name, content, is_staff, ts')
      .eq('thread_id', longConv.thread_id)
      .order('ts', { ascending: false })
      .limit(10);
    console.log(JSON.stringify(msgs, null, 2));
  }
}

check();
