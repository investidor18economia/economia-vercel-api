const SERPAPI_BASE = "https://serpapi.com/search.json";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST' });
  }

  const clientKey = req.headers['x-api-key'] || '';
  if (process.env.API_SHARED_KEY && clientKey !== process.env.API_SHARED_KEY) {
    return res.status(403).json({ error: 'invalid_api_key' });
  }

  const body = req.body || {};
  const inputText = (body.text || '').trim();
  if (!inputText) return res.status(400).json({ error: 'Missing parameter: text' });

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured: missing SERPAPI_KEY' });

  try {
    const params = new URLSearchParams({
      engine: "google_shopping",
      q: inputText,
      gl: "br",
      hl: "pt",
      api_key: apiKey
    });

    const url = `${SERPAPI_BASE}?${params.toString()}`;
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(r.status).json({ error: "SerpApi error", details: txt });
    }
    const json = await r.json().catch(() => ({}));
    const items = json.shopping_results || json.organic_results || [];

    const results = items.slice(0, 8).map((it) => {
      const realLink = it.product_link || it.serpapi_product_link || it.link || "";
      const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || ""}/api/redirect?u=${encodeURIComponent(realLink)}&p=${encodeURIComponent(it.title || "")}`;
      return {
        title: it.title || it.product_title || it.name || "",
        price: it.price || it.price_string || it.extracted_price || "",
        link: realLink,
        affiliateLink: realLink,
        redirectUrl,
        source: it.source || it.store || ""
      };
    });

    return res.status(200).json({ source: "live", query: inputText, results });
  } catch (err) {
    console.error("ERROR /api/economia:", err);
    return res.status(500).json({ error: "internal_error", details: String(err) });
  }
}
