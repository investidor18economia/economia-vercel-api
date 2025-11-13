import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

export default async function handler(req, res) {
  const u = req.query.u || '';
  const p = req.query.p || '';
  if (!u) return res.status(400).send('Missing url');
  try {
    await supabase.from('clicks').insert([{ product: p, target_url: u, created_at: new Date().toISOString() }]);
  } catch (e) {
    console.warn('click log failed', String(e));
  }
  return res.redirect(302, decodeURIComponent(u));
}
