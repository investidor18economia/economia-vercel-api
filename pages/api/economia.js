// /api/economia.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    // 0 - CHECAR MENSAGENS DO USUÁRIO
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", user_id)
      .single();

    const isPlus = user?.plan === "plus";
    const limit = isPlus
      ? Number(process.env.PLUS_MONTHLY_MSGS)
      : Number(process.env.FREE_MONTHLY_MSGS);

    if ((user?.monthly_messages || 0) >= limit) {
      return NextResponse.json({
        mia: `Você atingiu o limite mensal da MIA para seu plano.`,
        prices: []
      });
    }

    // 1 - BUSCA DE PREÇOS NO SUPABASE
    let results = [];
    try {
      const { data } = await supabase
        .from("cache_results")
        .select("*")
        .ilike("product_name", `%${query}%`)
        .limit(10);
      results = data || [];
    } catch (err) {
      console.error("Erro ao buscar preços:", err);
    }

    // 2 - CHAMAR A API /api/chat-gpt4o
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/chat-gpt4o`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.API_SHARED_KEY
      },
      body: JSON.stringify({
        text: query,
        user_id,
        conversation_id: null
      })
    });

    const data = await response.json();

    // 3 - ATUALIZAR MENSAGENS DO USUÁRIO (caso queira manter contagem no /api/economia)
    await supabase
      .from("users")
      .update({ monthly_messages: (user?.monthly_messages || 0) + 1 })
      .eq("id", user_id);

    // 4 - RETORNAR RESPOSTA + PREÇOS
    return NextResponse.json({
      mia: data.reply || "Desculpe, não consegui gerar uma resposta.",
      prices: results
    });

  } catch (err) {
    console.error("Erro interno /api/economia:", err);
    return NextResponse.json(
      { error: "Erro interno no servidor" },
      { status: 500 }
    );
  }
}
