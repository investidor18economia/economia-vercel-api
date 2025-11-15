// pages/api/delete-wish.js
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

  // proteção interna: verifica a shared key (opcional mas recomendada)
  const clientKey = req.headers["x-api-key"] || "";
  if (process.env.API_SHARED_KEY && clientKey !== process.env.API_SHARED_KEY) {
    return res.status(403).json({ success: false, error: "invalid_api_key" });
  }

  try {
    const body = req.body || {};
    const { id, user_id } = body;

    if (!id) return res.status(400).json({ success: false, error: "Missing parameter: id" });

    // Faz a deleção e retorna as linhas deletadas para confirmação
    const { data, error } = await supabase
      .from("wishes")
      .delete()
      .eq("id", id)
      .eq("user_id", user_id || null)
      .select();

    if (error) {
      console.error("Supabase DELETE error:", error);
      return res.status(500).json({ success: false, error: error.message || String(error) });
    }

    if (!data || data.length === 0) {
      // nenhuma linha deletada
      return res.status(404).json({ success: false, message: "Nenhuma linha deletada (id não encontrado ou user_id mismatch)" });
    }

    // sucesso real — registro deletado
    return res.status(200).json({ success: true, deleted_id: id, deleted_rows: data.length });
  } catch (err) {
    console.error("ERROR /api/delete-wish:", err);
    return res.status(500).json({ success: false, error: String(err) });
  }
}

