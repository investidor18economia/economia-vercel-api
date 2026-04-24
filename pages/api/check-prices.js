import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false }
  }
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from("wishes")
      .select("*");

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data
    });

  } catch (err) {
    console.error("🔥 ERRO REAL:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
      full: err
    });
  }
}
