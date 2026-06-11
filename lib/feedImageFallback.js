export function getFeedImageFallback(category = "") {
  const cat = String(category).toLowerCase();

  if (cat.includes("smartphone") || cat.includes("celular")) {
    return { emoji: "📱", label: "Smartphone" };
  }
  if (cat.includes("notebook") || cat.includes("laptop") || cat.includes("comput")) {
    return { emoji: "💻", label: "Notebook" };
  }
  if (cat.includes("áudio") || cat.includes("audio") || cat.includes("fone") || cat.includes("headphone")) {
    return { emoji: "🎧", label: "Áudio" };
  }
  if (cat.includes("game") || cat.includes("jogo") || cat.includes("console")) {
    return { emoji: "🎮", label: "Games" };
  }
  if (cat.includes("watch") || cat.includes("relógio") || cat.includes("relogio") || cat.includes("wearable")) {
    return { emoji: "⌚", label: "Wearables" };
  }

  return { emoji: "📦", label: "Produto" };
}
