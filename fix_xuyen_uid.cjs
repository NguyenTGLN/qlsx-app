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

async function fix() {
  // Update Xuyen's uid_from
  const { data, error } = await db.from('nhan_vien')
    .update({ uid_from: '337594525259740835' })
    .ilike('name', '%Xuyên%');
    
  console.log("Updated nhan_vien:", error ? error : "Success");

  // Fix the old messages to is_staff = true
  const { error: err2 } = await db.from('zalo_messages')
    .update({ is_staff: true })
    .eq('uid_from', '337594525259740835');
  console.log("Updated zalo_messages:", err2 ? err2 : "Success");
}

fix();
