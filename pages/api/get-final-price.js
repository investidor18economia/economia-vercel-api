// pages/api/get-final-price.js
import { createClient } from "@supabase/supabase-js";
import { fetchSerpPrices } from "../../lib/prices"; // já tem no projeto

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { items, query, cep, user_id } = req.body || {};
  if ((!items || items.length === 0) && !query) {
    return res.status(400).json({ error: "Missing items or query" });
  }

  try {
    // 1) Get marketplaces to evaluate
    const { data: marketplaces } = await supabase.from("marketplaces").select("*");
    // 2) Build price list per marketplace
    const results = [];

    // function to normalize name for matching
    const normalize = s => (s || "").toString().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    // If items not provided, query SerpAPI to get a single product price candidate
    let searchItems = items;
    if (!searchItems || searchItems.length === 0) {
      // try fetchSerpPrices, return best single product
      const serp = await fetchSerpPrices(query || "", 5).catch(()=>[]);
      if (serp && serp.length) {
        searchItems = serp.slice(0,1).map(p => ({ name: p.product_name || p.title || query, qty: 1, price: p.price }));
      } else {
        searchItems = [{ name: query, qty: 1 }];
      }
    }

    // normalize input item names
    const normalizedInputs = searchItems.map(it => ({ ...it, norm: normalize(it.name) }));

    // fetch market_products for all marketplaces for matching
    const { data: allProducts } = await supabase
      .from("market_products")
      .select("*");

    for (const m of marketplaces) {
      let total = 0;
      const breakdown = [];
      for (const it of normalizedInputs) {
        // try exact product match in market_products
        const candidates = (allProducts || []).filter(p => p.marketplace_id === m.id && p.normalized_name && p.normalized_name.includes(it.norm));
        let chosen = null;
        if (candidates.length) {
          chosen = candidates[0];
        } else if (it.price) {
          chosen = { price: Number(it.price), name: it.name };
        } else {
          // fallback: try SerpAPI per item (cheap, optional)
          const serpRes = await fetchSerpPrices(it.name, 5).catch(()=>[]);
          if (serpRes && serpRes.length) {
            // attempt to find candidate in same marketplace via link or store name
            const candidate = serpRes.find(p => (p.source||"").toLowerCase().includes(m.name.toLowerCase())) || serpRes[0];
            chosen = { price: candidate.price || null, name: candidate.product_name || candidate.title || it.name };
          }
        }
        const priceVal = chosen && chosen.price ? Number(chosen.price) : null;
        const qty = it.qty || 1;
        if (priceVal == null) {
          // treat as missing: mark as Infinity so this marketplace is less preferred
          total = Number.POSITIVE_INFINITY;
          breakdown.push({ item: it.name, price: null, note: "não encontrado" });
        } else {
          total += priceVal * qty;
          breakdown.push({ item: it.name, price: priceVal, chosen_name: chosen.name });
        }
      }

      // freight estimation
      let freight = 0;
      if (isFinite(total)) {
        if (m.free_shipping_min && Number(total) >= Number(m.free_shipping_min)) freight = 0;
        else freight = Number(m.default_freight || 0);
      } else {
        freight = Number(m.default_freight || 0);
        total = Number.POSITIVE_INFINITY;
      }

      // coupon apply (take best active coupon)
      const { data: coupons } = await supabase.from("marketplace_coupons").select("*").eq("marketplace_id", m.id).eq("active", true).limit(1);
      let couponApplied = null;
      let discount = 0;
      if (coupons && coupons.length) {
        const c = coupons[0];
        couponApplied = c.code;
        if (c.type === "percent") discount = (total * Number(c.value) / 100);
        else discount = Number(c.value);
      }

      // cashback
      const { data: cashback } = await supabase.from("marketplace_cashbacks").select("*").eq("marketplace_id", m.id).limit(1);
      let cashbackAmt = 0;
      if (cashback && cashback.length) {
        cashbackAmt = (Number(cashback[0].percent || 0) / 100) * (isFinite(total) ? total - discount : 0);
      }

      const precoBase = isFinite(total) ? total : null;
      const precoFinal = isFinite(total) ? Math.max(0, precoBase + freight - (discount || 0) - cashbackAmt) : null;

      results.push({
        marketplace: m.name,
        marketplace_slug: m.slug,
        preco_base: precoBase,
        freight,
        coupon: couponApplied,
        discount,
        cashback: cashbackAmt,
        preco_final: precoFinal,
        breakdown
      });
    }

    // sort by preco_final (null/Infinity to end)
    results.sort((a,b) => {
      const A = a.preco_final == null ? Number.POSITIVE_INFINITY : a.preco_final;
      const B = b.preco_final == null ? Number.POSITIVE_INFINITY : b.preco_final;
      return A - B;
    });

    return res.status(200).json({ success:true, results });
  } catch (err) {
    console.error("get-final-price error:", err);
    return res.status(500).json({ success:false, error: String(err) });
  }
}
