// pages/api/register-user.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Only POST allowed" });

  // valida API_SHARED_KEY
  const clientKey = req.headers["x-api-key"] || "";
  if (process.env.API_SHARED_KEY && clientKey !== process.env.API_SHARED_KEY) {
    return res.status(403).json({ success: false, error: "invalid_api_key" });
  }

  try {
    const body = req.body || {};
    const { email, name, external_id } = body;

    if (!email && !external_id) {
      return res.status(400).json({
        success: false,
        error: "Missing parameter: email or external_id is required"
      });
    }

    // Se houver external_id, tenta achar por ele (prefere external_id)
    let { data: existingByExternal, error: err1 } = external_id
      ? await supabase.from("users").select("*").eq("external_id", external_id).limit(1)
      : { data: [], error: null };

    if (err1) {
      console.error("Supabase lookup error (external_id):", err1);
      return res.status(500).json({ success: false, error: String(err1) });
    }
    if (existingByExternal && existingByExternal.length > 0) {
      return res.status(200).json({ success: true, user: existingByExternal[0], note: "found_by_external_id" });
    }

    // Se não achou por external_id, tenta achar por email
    let { data: existingByEmail, error: err2 } = await supabase
      .from("users")
      .select("*")
      .eq("email", email || "")
      .limit(1);

    if (err2) {
      console.error("Supabase lookup error (email):", err2);
      return res.status(500).json({ success: false, error: String(err2) });
    }
    if (existingByEmail && existingByEmail.length > 0) {
      return res.status(200).json({ success: true, user: existingByEmail[0], note: "found_by_email" });
    }

    // Insere novo usuário
    const payload = {
      email: email || null,
      name: name || null,
      external_id: external_id || null,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("users")
      .insert([payload])
      .select()
      .limit(1);

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ success: false, error: String(error) });
    }

    return res.status(201).json({ success: true, user: data[0] });
  } catch (err) {
    console.error("ERROR /api/register-user:", err);
    return res.status(500).json({ success: false, error: String(err) });
  }
}
