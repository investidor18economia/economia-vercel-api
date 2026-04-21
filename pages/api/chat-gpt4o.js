import { createClient } from "@supabase/supabase-js";
import { fetchSerpPrices } from "../../lib/prices";

const API_SHARED_KEY = process.env.API_SHARED_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function parsePrice(value) {
  if (typeof value === "number") return value;
  if (!value) return NaN;
  return parseFloat(String(value).replace(/[^\d,]/g, "").replace(",", "."));
}

function formatBRL(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function extractBudget(text) {
  const q = (text || "").toLowerCase();

  const patterns = [
    /até\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /abaixo\s*de\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /menos\s*de\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i,
    /no\s*m[aá]ximo\s*r?\$?\s*(\d+[.,]?\d*)\s*(mil)?/i
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match) {
      let value = parseFloat(match[1].replace(",", "."));
      if (match[2]) value *= 1000;
      return value;
    }
  }

  return null;
}

function isComplexQuery(query) {
  return /qual o melhor|melhor|vale a pena|compensa|rodar|gamer|cyberpunk|estudar|ou /i.test(query);
}

function cleanTitle(title) {
  return (title || "")
    .replace(/\b(barato|barata|promoção|promocao|oferta|imperdível|imperdivel|p sair hoje|para sair hoje|aproveite|últimas unidades|ultimas unidades)\b/gi, "")
    .replace(/\b(agora)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .trim();
}
function wantsNewProduct(query) {
  return /\bnovo\b|\bnova\b|\blacrado\b|\blacrada\b|\bzerado\b/i.test(query || "");
}

function isUsedLikeProduct(title) {
  const t = (title || "").toLowerCase();
  function isSuspiciousListing(title)
  {
    function isBadProduct(title) {
  return isSuspiciousListing(title) || isUsedLikeProduct(title);
}
  const t = (title || "").toLowerCase();

  const suspiciousTerms = [
    "leia a descrição",
    "leia a descricao",
    "vende-se",
    "vendo",
    "troco",
    "retirada",
    "retirar",
    "chama no chat",
    "chamar no chat",
    "somente hoje",
    "oportunidade",
    "urgente",
    "negocio",
    "negócio",
    "falar no chat",
    "fale no chat"
  ];

  return suspiciousTerms.some(term => t.includes(term));
}

  const usedTerms = [
    "usado",
    "usada",
    "seminovo",
    "seminova",
    "semi-novo",
    "semi nova",
    "recondicionado",
    "recondicionada",
    "open box",
    "mostruário",
    "mostruario",
    "vitrine",
    "marcas de uso",
    "marca de uso",
    "com uso",
    "bateria",
    "saúde da bateria",
    "saude da bateria",
    "trocafone",
    "segunda mão",
    "segunda mao"
  ];

  return usedTerms.some(term => t.includes(term));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientKey = (req.headers["x-api-key"] || "").toString();
  if (!API_SHARED_KEY || clientKey !== API_SHARED_KEY) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  const { text, user_id, conversation_id } = req.body || {};
  const query = (text || "").trim();

  if (!query) {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    let products = await fetchSerpPrices(query, Number(process.env.SERPAPI_MAX || 8));

    if (!products.length) {
      return res.status(200).json({
        reply: "⚠️ Nenhum resultado encontrado. Tente uma busca diferente.",
        prices: []
      });
    }

    const budget = extractBudget(query);

    if (budget) {
      const withinBudget = products.filter((p) => {
        const price = parsePrice(p.price);
        return !isNaN(price) && price <= budget;
      });

      if (!withinBudget.length) {
        const validPrices = products
          .map((p) => parsePrice(p.price))
          .filter((p) => !isNaN(p));

        const lowestAvailable = validPrices.length ? Math.min(...validPrices) : null;

        return res.status(200).json({
          reply: lowestAvailable
            ? `⚠️ Não encontrei boas opções dentro de ${formatBRL(budget)}.\n📊 Os modelos mais próximos começam em ${formatBRL(lowestAvailable)}.\n❓ Quer ver opções nessa faixa maior?`
            : `⚠️ Não encontrei boas opções dentro de ${formatBRL(budget)}.\n❓ Quer ver opções em outra faixa?`,
          prices: products
        });
      }

      products = withinBudget;
    }
    const wantsNew = wantsNewProduct(query);

if (wantsNew) {
  const newOnlyProducts = products.filter((p) => !isUsedLikeProduct(p.product_name));

  if (!newOnlyProducts.length) {
    return res.status(200).json({
      reply: "⚠️ Não encontrei opções novas confiáveis para essa busca.\n📊 Encontrei apenas itens com sinais de uso ou condição duvidosa.\n❓ Quer ver mesmo assim ou prefere ajustar a busca?",
      prices: products
    });
  }

  products = newOnlyProducts;
}

    const isGamer = /gamer|jogar|cyberpunk/i.test(query);

    if (isGamer) {
      const gamerFiltered = products.filter((p) =>
        /gamer|rtx|gtx|radeon|geforce|ryzen 7|ryzen 5|i7|i5/.test((p.product_name || "").toLowerCase())
      );

      if (gamerFiltered.length) {
        products = gamerFiltered;
      }
    }

    const validProducts = products
      .map((p) => ({
        ...p,
        numericPrice: parsePrice(p.price)
      }))
      .filter((p) => !isNaN(p.numericPrice))
      .sort((a, b) => a.numericPrice - b.numericPrice);

    if (!validProducts.length) {
      return res.status(200).json({
        reply: "⚠️ Nenhum resultado encontrado. Tente uma busca diferente.",
        prices: []
      });
    }

   // separar produtos bons
const goodProducts = validProducts.filter((p) => !isBadProduct(p.product_name));

// escolher base: bons primeiro, se não tiver usa todos
const baseProducts = goodProducts.length ? goodProducts : validProducts;

// ordenar por preço
baseProducts.sort((a, b) => {
  return parsePrice(a.price) - parsePrice(b.price);
});

// pegar o melhor
const best = baseProducts[0];
const title = cleanTitle(best.product_name);
    const hasCheaperBadOption = validProducts.some((p) => {
  const price = parsePrice(p.price);
  return (
    !isNaN(price) &&
    price < parsePrice(best.price) &&
    isBadProduct(p.product_name)
  );
});
    if (isComplexQuery(query)) {
      reply += `💰 Melhor opção encontrada: ${best.price}\n`;
      reply += `🧠 ${title}\n`;

      if (/estudar/i.test(query)) {
        reply += `📊 Boa opção para estudo e uso diário\n`;
      } else if (isGamer) {
        if (/rtx|gtx|radeon|geforce/i.test(title.toLowerCase())) {
          reply += `📊 Parece mais preparado para jogos do que modelos comuns\n`;
        } else {
          reply += `📊 Parece mais indicado para uso leve do que para jogos pesados\n`;
          reply += `⚠️ Para Cyberpunk, o ideal é investir mais\n`;
        }
      } else {
        reply += `📊 Boa opção dentro da busca feita\n`;
      }

      reply += `❓ Quer ver mais opções parecidas?`;
    } else {
      reply = `💰 Melhor preço confiável: ${best.price}
🧠 ${title}${
  hasCheaperBadOption
    ? "\n⚠️ Existem opções mais baratas, mas podem ser usadas ou menos confiáveis"
    : ""
}
❓ Quer ver mais opções parecidas?`;
    }

    try {
      if (user_id && conversation_id) {
        await supabase.from("messages").insert([
          { conversation_id, role: "user", content: query },
          { conversation_id, role: "assistant", content: reply }
        ]);
      }
    } catch (e) {
      console.warn("Falha ao salvar mensagens", e);
    }

    return res.status(200).json({
      reply,
      prices: validProducts.map((p) => ({
        product_name: cleanTitle(p.product_name),
        price: p.price,
        link: p.link,
        thumbnail: p.thumbnail
      }))
    });

  } catch (err) {
    console.error("chat-gpt4o error:", err);
    return res.status(500).json({
      reply: "Desculpe, tive um problema ao processar sua busca.",
      prices: []
    });
  }
}
