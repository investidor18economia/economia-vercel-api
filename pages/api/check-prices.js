import { createClient } from "@supabase/supabase-js";
import { fetchSerpPrices } from "../../lib/prices";
import { sendPriceDropEmail } from "../../lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { data: wishes, error } = await supabase
      .from("wishes")
      .select("*");

    if (error) throw error;

    if (!wishes || wishes.length === 0) {
      return res.status(200).json({ success: true, message: "Sem produtos" });
    }

    const results = [];

    for (const wish of wishes) {
      const query = wish.product_name || wish.query;

      // 🔥 usar preço simulado (sem API externa)
const products = [
  {
    product_name: query,
    price: Math.random() * 3000 + 1000,
    link: "https://example.com"
  }
];

      if (!products.length) {
        results.push({ id: wish.id, status: "not_found" });
        continue;
      }

      const best = products[0];

      const oldPrice = parseFloat(wish.last_price || wish.price || 0);
      const newPrice = parseFloat(best.price || 0);

      await supabase
        .from("wishes")
        .update({
          last_price: newPrice,
          price: newPrice,
        })
        .eq("id", wish.id);

      if (oldPrice && newPrice && newPrice < oldPrice) {
        const { data: user } = await supabase
          .from("users")
          .select("email")
          .eq("id", wish.user_id)
          .single();

        if (user?.email) {
          await sendPriceDropEmail(
            user.email,
            best.product_name,
            oldPrice,
            newPrice,
            best.link
          );
        }

        results.push({ id: wish.id, status: "price_drop" });
      } else {
        results.push({ id: wish.id, status: "no_change" });
      }
    }

    return res.status(200).json({
      success: true,
      results,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
