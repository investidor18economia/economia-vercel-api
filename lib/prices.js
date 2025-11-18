// lib/prices.js
export async function fetchSerpPrices(query, limit = 8) {
  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  if (!SERPAPI_KEY) return [];

  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}&num=${limit}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`SerpAPI error ${resp.status} ${txt}`);
  }
  const json = await resp.json();
  const items = (json.shopping_results || []).slice(0, limit).map(p => ({
    product_name: p.title || p.name || "",
    price: p.price || p.extracted_price || p.price_string || "0",
    link: p.link || p.product_url || null
  }));
  return items;
}
