// pages/api/check-prices.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // Método permitido
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Autorização do cron
  if (
    !req.headers.authorization ||
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized (cron)" });
  }

  if (req.headers["x-api-key"] !== process.env.API_SHARED_KEY) {
    return res.status(401).json({ success: false, error: "invalid_api_key" });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ... (resto do código permanece igual)
}
// pages/api/check-prices.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const API_SHARED_KEY = process.env.API_SHARED_KEY;

// configuração: quantos wishes processar por execução
const BATCH_SIZE = parseInt(process.env.CHECK_PRICES_BATCH_SIZE || "15", 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

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

export default async function handler(req, res) {
  // proteção simples por header
  const clientKey = (req.headers["x-api-key"] || "").toString();
  if (API_SHARED_KEY && clientKey !== API_SHARED_KEY) {
    return res.status(403).json({ success: false, error: "invalid_api_key" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Only POST allowed" });
  }

  try {
    // buscar wishes ativos (você pode adicionar coluna active boolean)
    const { data: wishes, error: fetchWishesErr } = await supabase
      .from("wishes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(BATCH_SIZE);

    if (fetchWishesErr) throw fetchWishesErr;
    if (!wishes || wishes.length === 0) {
      return res.status(200).json({ success: true, message: "No wishes to check" });
    }

    // tentar importar sendPriceDropEmail se existir
    let sendPriceDropEmail = null;
    try {
      const mod = await import("../../lib/email.js").catch(() => null);
      if (mod && mod.sendPriceDropEmail) sendPriceDropEmail = mod.sendPriceDropEmail;
    } catch (e) {
      // ignore
    }

    const results = [];
    for (const wish of wishes) {
      const identifier = wish.product_name || wish.query || wish.product_url || "";
      try {
        // se existir product_url preferimos query por título (SerpApi lida com ambos)
        const q = wish.product_url ? wish.product_url : identifier;
        const json = await fetchFromSerpApi(q);

        // serpapi: shopping_results ou organic_results
        const items = json.shopping_results || json.organic_results || [];
        // pegar o melhor item (menor preço) que contenha price
        let best = null;
        for (const it of items) {
          const priceRaw = it.price || it.extracted_price || it.price_string || null;
          // normalizar price para número (remover símbolos)
          let priceNum = null;
          if (priceRaw != null) {
            const s = String(priceRaw).replace(/[^\d,.\-]/g, "").replace(",", ".");
            priceNum = parseFloat(s);
            if (Number.isNaN(priceNum)) priceNum = null;
          }
          if (priceNum != null) {
            if (!best || priceNum < best.price) {
              best = {
                price: priceNum,
                title: it.title || it.product_title || it.name || "",
                link: it.product_link || it.serpapi_product_link || it.link || "",
                source: it.source || it.store || "",
              };
            }
          }
        }

        const now = new Date().toISOString();

        if (!best) {
          // nada encontrado: atualiza apenas last_checked
          await supabase.from("wishes").update({ last_checked: now }).eq("id", wish.id);
          results.push({ id: wish.id, status: "not_found" });
          continue;
        }

        const oldPrice = wish.last_price || wish.price || null;
        const newPrice = best.price;

        // inserir histórico
        await supabase.from("price_history").insert([{
          wish_id: wish.id,
          price: newPrice,
          source: best.source || "google_shopping",
          product_url: best.link || wish.product_url || null,
        }]);

        // atualizar wish
        const updatePayload = {
          last_price: newPrice,
          price: newPrice,
          last_checked: now,
          product_name: wish.product_name || best.title || wish.query || null,
          product_url: best.link || wish.product_url || null,
        };
        await supabase.from("wishes").update(updatePayload).eq("id", wish.id);

        // se teve queda e oldPrice != null
        if (oldPrice != null && newPrice < parseFloat(oldPrice)) {
          // tentar enviar email (se função disponível)
          if (sendPriceDropEmail) {
            try {
              // buscar email do user
              const { data: users, error: uerr } = await supabase
                .from("users")
                .select("email")
                .eq("id", wish.user_id)
                .limit(1);
              const userEmail = users && users[0] ? users[0].email : null;
              if (userEmail) {
                await sendPriceDropEmail(userEmail, {
                  product_name: updatePayload.product_name,
                  product_url: updatePayload.product_url
                }, oldPrice, newPrice);
              }
            } catch (e) {
              console.warn("email send failed", e);
            }
          }
          results.push({ id: wish.id, status: "price_drop", oldPrice, newPrice, link: updatePayload.product_url });
        } else {
          results.push({ id: wish.id, status: "no_change", price: newPrice, link: updatePayload.product_url });
        }

      } catch (err) {
        console.error("check-prices error for wish", wish.id, err);
        results.push({ id: wish.id, status: "error", error: String(err) });
      }
    } // end for

    return res.status(200).json({ success: true, checked: wishes.length, results });
  } catch (err) {
    console.error("ERROR /api/check-prices:", err);
    return res.status(500).json({ success: false, error: String(err) });
  }
}
