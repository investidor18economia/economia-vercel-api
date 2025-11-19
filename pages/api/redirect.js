import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

export default async function handler(req, res) {
  const u = req.query.u || "";
  const p = req.query.p || "";

  if (!u) return res.status(400).send("Missing url");

  try {
    // simple log; don't block redirect on failure
    try {
      await supabase.from("clicks").insert([{ product: p || null, target_url: u, created_at: new Date().toISOString() }]);
    } catch (e) {
      console.warn("click log failed", e);
    }

    // safe redirect
    const decoded = decodeURIComponent(u);
    // ensure it's a valid http(s) url
    if (!/^https?:\/\//i.test(decoded)) {
      return res.status(400).send("Invalid redirect url");
    }
    return res.redirect(302, decoded);
  } catch (err) {
    console.error("ERROR /api/redirect:", err);
    return res.status(500).send("Internal error");
  }
}
