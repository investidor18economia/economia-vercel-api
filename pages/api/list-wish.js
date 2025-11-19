import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const user_id = req.query.user_id || req.headers["x-user-id"];
    if (!user_id) return res.status(400).json({ error: "user_id is required" });

    // busca desejos do usuário
    const { data, error } = await supabase
      .from("wishes")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("list-wish select error:", error);
      return res.status(500).json({ error: "db_error", details: error.message || error });
    }

    return res.status(200).json({ success: true, wishes: data || [] });
  } catch (err) {
    console.error("ERROR /api/list-wish:", err);
    return res.status(500).json({ error: String(err) });
  }
}
