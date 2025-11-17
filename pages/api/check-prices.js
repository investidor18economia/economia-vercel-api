// pages/api/check-prices.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const API_SHARED_KEY = process.env.API_SHARED_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Quantos wishes serão processados por execução
const BATCH_SIZE = parseInt(process.env.CHECK_PRICES_BATCH_SIZE || "15", 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// -----------------------------
// FUNÇÃO PARA CONSULTAR SERPAPI
// -----------------------------
async function fetchFromSerpApi(query) {
  const base = "https://serpapi.com/search.json";
  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    gl: "br",
    hl: "pt",
    api_key: SERPAPI_KEY,
  });

  const url = `${base}?${params.toString()}`;
  const r = await fetch(url);

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`SerpApi error ${r.status} ${txt}`);
  }

  return r.json();
}

// -----------------------------
// HANDLER PRINCIPAL
// -----------------------------
export default async function handler(req, res) {
  // Liberamos apenas POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Autorização do cron (header Authorization: Bearer XXXXX)
  if (
    !req.headers.authorization ||
    req.headers.authorization !== `Bearer ${CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized (cron)" });
  }

  // Autorização interna da API
  if (req.headers["x-api-key"] !== API_SHARED_KEY) {
    return res.status(401).json({ success: false, error: "invalid_api_key" });
  }

  try {
    // Buscar lista de wishes a serem processados
    const { data: wishes, error: fetchErr } = await supabase
      .from("wishes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    if (!wishes || wishes.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No wishes to check",
      });
    }

    // Tentar carregar módulo de e-mail (opcional)
    let sendPriceDropEmail = null;
    try {
      const mod = await import("../../lib/email.js").catch(() => null);
      if (mod && mod.sendPriceDropEmail) sendPriceDropEmail = mod.sendPriceDropEmail;
    } catch (_) {}

    const results = [];
    const now = new Date().toISOString();

    // PROCESSAMENTO
    for (const wish of wishes) {
      const identifier =
        wish.product_name || wish.query || wish.product_url || "";

      try {
        const q = wish.product_url ? wish.product_url : identifier;

        const json = await fetchFromSerpApi(q);

        const items = json.shopping_results || json.organic_results || [];
        let best = null;

        for (const it of items) {
          const raw = it.price || it.extracted_price || it.price_string || null;

          let priceNum = null;
          if (raw != null) {
            const s = String(raw).replace(/[^\d,.\-]/g, "").replace(",", ".");
            priceNum = parseFloat(s);
            if (Number.isNaN(priceNum)) priceNum = null;
          }

          if (priceNum != null) {
            if (!best || priceNum < best.price) {
              best = {
                price: priceNum,
                title: it.title || it.product_title || it.name || "",
                link:
                  it.product_link ||
                  it.serpapi_product_link ||
                  it.link ||
                  "",
                source: it.source || it.store || "",
              };
            }
          }
        }

        if (!best) {
          await supabase
            .from("wishes")
            .update({ last_checked: now })
            .eq("id", wish.id);

          results.push({ id: wish.id, status: "not_found" });
          continue;
        }

        const oldPrice = wish.last_price || wish.price || null;
        const newPrice = best.price;

        // Histórico
        await supabase.from("price_history").insert([
          {
            wish_id: wish.id,
            price: newPrice,
            source: best.source || "google_shopping",
            product_url: best.link,
          },
        ]);

        // Atualizar wish
        const updatePayload = {
          last_price: newPrice,
          price: newPrice,
          last_checked: now,
          product_name: wish.product_name || best.title,
          product_url: best.link,
        };

        await supabase.from("wishes").update(updatePayload).eq("id", wish.id);

        // Detecção de queda de preço
        if (oldPrice != null && newPrice < parseFloat(oldPrice)) {
          if (sendPriceDropEmail) {
            try {
              const { data: ud } = await supabase
                .from("users")
                .select("email")
                .eq("id", wish.user_id)
                .limit(1);

              if (ud && ud[0] && ud[0].email) {
                await sendPriceDropEmail(
                  ud[0].email,
                  {
                    product_name: updatePayload.product_name,
                    product_url: updatePayload.product_url,
                  },
                  oldPrice,
                  newPrice
                );
              }
            } catch (err) {
              console.warn("Failed to send email", err);
            }
          }

          results.push({
            id: wish.id,
            status: "price_drop",
            oldPrice,
            newPrice,
            link: updatePayload.product_url,
          });
        } else {
          results.push({
            id: wish.id,
            status: "no_change",
            price: newPrice,
            link: updatePayload.product_url,
          });
        }
      } catch (err) {
        console.error("Error checking wish", wish.id, err);
        results.push({
          id: wish.id,
          status: "error",
          error: String(err),
        });
      }
    }

    return res.status(200).json({
      success: true,
      checked: wishes.length,
      results,
    });
  } catch (err) {
    console.error("CRITICAL ERROR /api/check-prices:", err);
    return res.status(500).json({
      success: false,
      error: String(err),
    });
  }
}
