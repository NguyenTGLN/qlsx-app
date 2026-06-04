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
  const { data: convs } = await db.from('zalo_conversations')
    .select('id, customer_uid, customer_name, content_summary')
    .order('last_message_ts', { ascending: false })
    .limit(5);
    
  console.log("Recent Zalo conversations:");
  console.log(JSON.stringify(convs, null, 2));
}

check();
