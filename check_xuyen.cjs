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
  const { data: msgs } = await db.from('zalo_messages')
    .select('id, uid_from, content, thread_id, ts')
    .ilike('content', '%báo cáo%')
    .order('ts', {ascending: false})
    .limit(5);
  console.log(msgs);
}

check();
