import { createClient } from "@supabase/supabase-js";
import axios from "axios";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const API_SHARED_KEY = process.env.API_SHARED_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const BATCH_SIZE = parseInt(process.env.CHECK_PRICES_BATCH_SIZE || "15", 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// 🔥 SERPAPI COM AXIOS
async function fetchFromSerpApi(query) {
  try {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google_shopping",
        q: query,
        gl: "br",
        hl: "pt",
        api_key: SERPAPI_KEY,
      },
      timeout: 10000,
    });

    return response.data;
  } catch (err) {
    console.error("❌ ERRO AXIOS SERPAPI:", err?.message || err);
    return null;
  }
}

export default async function handler(req, res) {
  return res.status(200).json({
    success: true,
    message: "API funcionando sem fetch"
  });
}

  // 🔥 permitir teste via navegador
  if (req.query.test !== "1") {
    const auth = req.headers.authorization || "";

    if (!auth || auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized (cron)" });
    }

    if (process.env.API_SHARED_KEY && req.headers["x-api-key"] !== API_SHARED_KEY) {
      return res.status(401).json({ error: "invalid_api_key" });
    }
  }

  try {
    const { data: wishes, error: fetchErr } = await supabase
      .from("wishes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    if (!wishes || wishes.length === 0) {
      return res.status(200).json({ success: true, message: "No wishes to check" });
    }

    let sendPriceDropEmail = null;
    try {
      const mod = await import("../../lib/email.js").catch(() => null);
      if (mod && mod.sendPriceDropEmail) {
        sendPriceDropEmail = mod.sendPriceDropEmail;
      }
    } catch (_) {}

    const results = [];
    const now = new Date().toISOString();

    for (const wish of wishes) {
      const identifier = wish.product_name || wish.query || wish.product_url || "";

      try {
        let json = {
  shopping_results: [
    {
      title: identifier,
      extracted_price: 2500,
      link: "https://example.com",
      source: "mock",
    },
  ],
};

        // fallback se API falhar
        if (!json) {
          json = {
            shopping_results: [
              {
                title: identifier,
                extracted_price: Math.random() * 3000 + 500,
                link: "https://example.com",
                source: "fallback",
              },
            ],
          };
        }

        const items = json.shopping_results || [];
        let best = null;

        for (const it of items) {
          const raw = it.price || it.extracted_price || null;

          let priceNum = null;
          if (raw != null) {
            const s = String(raw).replace(/[^\d,.\-]/g, "").replace(",", ".");
            priceNum = parseFloat(s);
          }

          if (priceNum != null) {
            if (!best || priceNum < best.price) {
              best = {
                price: priceNum,
                title: it.title || "",
                link: it.link || "",
                source: it.source || "google_shopping",
              };
            }
          }
        }

        if (!best) {
          results.push({ id: wish.id, status: "not_found" });
          continue;
        }

        const oldPrice = wish.last_price != null ? parseFloat(wish.last_price) : null;
        const newPrice = best.price;

        await supabase
          .from("wishes")
          .update({
            last_price: newPrice,
            price: newPrice,
            last_checked: now,
          })
          .eq("id", wish.id);

        if (oldPrice != null && newPrice < oldPrice) {
          if (sendPriceDropEmail) {
            try {
              const { data: u } = await supabase
                .from("users")
                .select("email")
                .eq("id", wish.user_id)
                .limit(1);

              const email = u?.[0]?.email;

              if (email) {
                await sendPriceDropEmail(
                  email,
                  best.title,
                  oldPrice,
                  newPrice,
                  best.link
                );
              }
            } catch (e) {
              console.warn("Erro ao enviar email:", e);
            }
          }

          results.push({
            id: wish.id,
            status: "price_drop",
            oldPrice,
            newPrice,
          });
        } else {
          results.push({
            id: wish.id,
            status: "no_change",
            price: newPrice,
          });
        }

      } catch (err) {
        console.error("Erro no loop:", err);
        results.push({
          id: wish.id,
          status: "error",
          error: err?.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      checked: wishes.length,
      results,
    });

  } catch (err) {
    console.error("CRITICAL ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err?.message || JSON.stringify(err),
    });
  }
}
