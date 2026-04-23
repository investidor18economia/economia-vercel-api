export async function fetchSerpPrices(query, limit = 8) {
  console.log("✅ lib/prices.js carregou corretamente");

  return [
    {
      product_name: "Produto teste",
      price: 1000,
      link: "https://example.com",
      thumbnail: null,
      source: "teste"
    }
  ];
}
