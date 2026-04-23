export async function fetchSerpPrices(query, limit = 8) {
  const SERPAPI_KEY = process.env.SERPAPI_KEY;

  if (!SERPAPI_KEY) {
    console.error("❌ SERPAPI_KEY não definida");
    return [];
  }

  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}&gl=br&hl=pt-br`;

  try {
    const resp = await fetch(url);

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`SerpAPI error ${resp.status} ${txt}`);
    }

    const json = await resp.json();

    if (!json || !json.shopping_results) {
      console.error("⚠️ Nenhum shopping_results retornado", json);
      return [];
    }

    const items = json.shopping_results.slice(0, limit).map((p) => ({
      product_name: p.title || "",
      price: p.extracted_price || p.price || null,
      link: p.link || null,
      thumbnail: p.thumbnail || null,
      source: p.source || ""
    }));

    return items;

  } catch (err) {
    console.error("❌ ERRO fetchSerpPrices:", err?.message || err);
    return [];
  }
}
