import axios from "axios";

export async function fetchSerpPrices(query, limit = 8) {
  const SERPAPI_KEY = process.env.SERPAPI_KEY;

  if (!SERPAPI_KEY) {
    console.error("❌ SERPAPI_KEY não definida");
    return [];
  }

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

    const data = response.data;

    // 🔥 suporta resposta em inglês e português
    const results =
      data.shopping_results ||
      data.resultados_de_compras ||
      [];

    if (!results.length) {
      console.error("⚠️ Nenhum resultado da SerpAPI", data);
      return [];
    }

    const items = results.slice(0, limit).map((p) => ({
      product_name: p.title || p.título || "",
      price:
        p.extracted_price ||
        p.price ||
        p.preço ||
        null,
      link: p.link || p.product_link || null,
      thumbnail: p.thumbnail || null,
      source: p.source || "",
    }));

    return items;

  } catch (err) {
    console.error("❌ ERRO SERPAPI:", err?.message || err);
    return [];
  }
}
