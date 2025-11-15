import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { user_id, product_name, product_url, price } = req.body;

    if (!user_id || !product_name) {
      return res.status(400).json({ error: "Dados incompletos." });
    }

    const { data, error } = await supabase
      .from("wishes")
      .insert([
        {
          user_id,
          product_name,
          product_url,
          price,
          created_at: new Date(),
        },
      ]);

    if (error) throw error;

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
