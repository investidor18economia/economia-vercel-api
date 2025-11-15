// pages/api/delete-wish.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_SHARED_KEY = process.env.API_SHARED_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
  try {
    // proteção simples: verificar x-api-key
    const clientKey = (req.headers["x-api-key"] || "").toString();
    if (API_SHARED_KEY && clientKey !== API_SHARED_KEY) {
      return res.status(403).json({ error: "invalid_api_key" });
    }

    // DELETE ?id=uuid   -> padrão
    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Missing id (uuid) in query" });

      // delete item by id
      const { error } = await supabase.from("wishes").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ success: true, deleted_id: id });
    }

    // POST { id }  OR { user_id, product_name }
    if (req.method === "POST") {
      const body = req.body || {};
      const { id, user_id, product_name } = body;

      if (!id && !(user_id && product_name)) {
        return res.status(400).json({ error: "Provide id OR user_id and product_name in body" });
      }

      if (id) {
        const { error } = await supabase.from("wishes").delete().eq("id", id);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true, deleted_id: id });
      } else {
        // delete by user_id + product_name
        const { error } = await supabase
          .from("wishes")
          .delete()
          .eq("user_id", user_id)
          .eq("product_name", product_name);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true, deleted_by: { user_id, product_name } });
      }
    }

    // métodos não permitidos
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("delete-wish error:", err);
    return res.status(500).json({ error: "internal_error", details: String(err) });
  }
}
