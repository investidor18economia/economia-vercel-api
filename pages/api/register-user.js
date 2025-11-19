import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  // allow internal auth check (optional)
  const clientKey = req.headers["x-api-key"] || "";
  if (process.env.API_SHARED_KEY && clientKey !== process.env.API_SHARED_KEY) {
    // allow register from public clients as well; do not force unless you want to.
    // If you want to require API key, uncomment the next line:
    // return res.status(403).json({ success: false, error: "invalid_api_key" });
  }

  try {
    const { email, name, external_id } = req.body || {};
    if (!email && !external_id) {
      return res.status(400).json({ success: false, error: "Missing parameter: email or external_id required" });
    }

    // try find by external_id first
    if (external_id) {
      const { data: byExt, error: errExt } = await supabase.from("users").select("*").eq("external_id", external_id).limit(1);
      if (errExt) {
        console.error("register-user lookup ext error:", errExt);
        return res.status(500).json({ success: false, error: String(errExt) });
      }
      if (byExt && byExt.length) return res.status(200).json({ success: true, user: byExt[0], note: "found_by_external_id" });
    }

    // find by email
    if (email) {
      const { data: byEmail, error: errEmail } = await supabase.from("users").select("*").eq("email", email).limit(1);
      if (errEmail) {
        console.error("register-user lookup email error:", errEmail);
        return res.status(500).json({ success: false, error: String(errEmail) });
      }
      if (byEmail && byEmail.length) return res.status(200).json({ success: true, user: byEmail[0], note: "found_by_email" });
    }

    // insert new user
    const payload = { email: email || null, name: name || null, external_id: external_id || null, created_at: new Date().toISOString() };
    const { data, error } = await supabase.from("users").insert([payload]).select().limit(1);
    if (error) {
      console.error("register-user insert error:", error);
      return res.status(500).json({ success: false, error: String(error) });
    }
    return res.status(201).json({ success: true, user: data?.[0] || null });
  } catch (err) {
    console.error("ERROR /api/register-user:", err);
    return res.status(500).json({ success: false, error: String(err) });
  }
}
