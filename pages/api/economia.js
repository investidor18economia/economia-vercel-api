import { NextResponse } from "next/server";
import { openai } from "./chat-gpt4o";
import { createClient } from "@supabase/supabase-js";
import { fetchProductData } from "@/lib/fetcher";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();
    const { query, user_id } = body;

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    // 0 - CHECK MENSAGENS
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", user_id)
      .single();

    const isPlus = user?.plan === "plus";
    const limit = isPlus
      ? Number(process.env.PLUS_MONTHLY_MSGS)
      : Number(process.env.FREE_MONTHLY_MSGS);

    if (user.monthly_messages >= limit) {
      return NextResponse.json({
        mia: "Você atingiu o limite mensal da MIA para seu plano.",
        prices: []
      });
    }

    // 1 - BUSCA DE PREÇOS
    const results = await fetchProductData(query);

    // 2 - PROMPT PARA GPT-4O MINI
    const prompt = `
Você é a MIA, a assistente oficial da EconomIA.

Pergunta do usuário: "${query}"

Preços encontrados:
${results.map(r => `• ${r.title} — R$ ${r.price} — ${r.link}`).join("\n")}

Regras:
- Seja clara, natural e útil.
- Mostre o melhor preço.
- Mostre a melhor opção custo-benefício.
- Não invente preços.
- Use SOMENTE os dados acima.
`;

    // 3 - CHAMADA GPT-4O MINI
    const gpt = await openai.responses.create({
      model: process.env.MODEL_GPT4O_MINI,
      input: prompt
    });

    const miaReply = gpt.output_text;

    // 4 - UPDATE DE CONSUMO
    await supabase
      .from("users")
      .update({ monthly_messages: user.monthly_messages + 1 })
      .eq("id", user_id);

    return NextResponse.json({
      mia: miaReply,
      prices: results
    });

  } catch (err) {
      console.error(err);
      return NextResponse.json(
        { error: "Erro interno no servidor" },
        { status: 500 }
      );
  }
}
