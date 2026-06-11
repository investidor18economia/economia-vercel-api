import { createClient } from "@supabase/supabase-js";
import { sendPriceDropEmail } from "../../lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  try {
    const { data: wishes } = await supabase
      .from("wishes")
      .select("*");

    const results = [];

    for (const wish of wishes) {
      const oldPrice = wish.last_price;
      const newPrice = wish.price;

      if (oldPrice && newPrice && newPrice < oldPrice) {

        const { data: user } = await supabase
          .from("users")
          .select("email")
          .eq("id", wish.user_id)
          .single();

        if (user?.email) {
          await sendPriceDropEmail(
            user.email,
            wish.product_name,
            oldPrice,
            newPrice,
            "https://example.com"
          );
        }

        results.push({ id: wish.id, status: "price_drop" });

      } else {
        results.push({ id: wish.id, status: "no_change" });
      }
    }

    return res.status(200).json({
      success: true,
      results
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
