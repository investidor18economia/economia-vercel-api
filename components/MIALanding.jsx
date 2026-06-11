import MIAWordmark from "./MIAWordmark";

function scrollToChat() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(() => {
    const input = document.querySelector(".mia-input:not([disabled])");
    if (input instanceof HTMLElement) input.focus({ preventScroll: true });
  }, 420);
}

const DIFFERENTIATORS = [
  {
    icon: "🧠",
    title: "Entende contexto",
    text: "Orçamento, uso real, rotina e prioridades entram na conversa — não só ficha técnica. A MIΛ interpreta o que você precisa de verdade, não apenas o que você digitou."
  },
  {
    icon: "⚖️",
    title: "Explica prós e contras",
    text: "Mostra o que você ganha e o que abre mão em cada caminho. Sem respostas genéricas: cada trade-off fica claro para a sua situação."
  },
  {
    icon: "🎯",
    title: "Focada em decisões",
    text: "O objetivo não é listar opções. É ajudar você a escolher com confiança — com critério, contexto e clareza sobre o próximo passo."
  },
  {
    icon: "🔍",
    title: "Transparente",
    text: "Recomendações com contexto. Você entende o porquê por trás de cada sugestão e consegue questionar, comparar e decidir com mais segurança."
  },
  {
    icon: "💸",
    title: "Mostra oportunidades",
    text: "Encontra opções que fazem sentido para o seu momento — sem empurrar compra, sem criar urgência artificial e sem ruído de promoção vazia."
  },
  {
    icon: "❤️",
    title: "Feita para o consumidor",
    text: "Projetada para quem compra online e quer decidir melhor — com uma IA que trabalha a favor do seu interesse, não contra ele."
  }
];

function LandingCta({ className = "" }) {
  return (
    <button type="button" className={`mia-landing-cta${className ? ` ${className}` : ""}`} onClick={scrollToChat}>
      <span aria-hidden="true">💬</span>
      Conversar com a <MIAWordmark size="xs" />
    </button>
  );
}

export default function MIALanding() {
  return (
    <div className="mia-landing" aria-label="Sobre a Teilor e a MIΛ">
      <section className="mia-landing-section mia-landing-hero">
        <p className="mia-landing-eyebrow">
          Teilor · Powered by <MIAWordmark size="sm" />
        </p>
        <h1 className="mia-landing-hero-title">
          A nova geração de IA para compras online.
        </h1>
        <p className="mia-landing-hero-subtitle">
          🧠 A MIΛ entende o que você precisa, compara opções, explica diferenças e
          ajuda você a decidir com mais confiança — sem ruído e sem pressão.
        </p>
        <div className="mia-landing-prose mia-landing-hero-copy">
          <p>
            Comprar online deveria ser simples. Na prática, virou um labirinto de
            anúncios, reviews conflitantes, comparadores frios e opiniões que nunca
            batem com a sua realidade.
          </p>
          <p>
            A Teilor existe para mudar isso: uma IA vertical, especializada em
            decisões de compra — não em empilhar links, cupons ou listas genéricas.
          </p>
        </div>
      </section>

      <section className="mia-landing-section mia-landing-problem">
        <h2 className="mia-landing-heading">
          O problema não é encontrar produtos.
        </h2>
        <p className="mia-landing-lead">
          🔎 O problema é saber qual realmente faz sentido para você — e confiar na escolha.
        </p>
        <div className="mia-landing-prose">
          <p>
            Muita gente passa horas pesquisando antes de comprar. Abre reviews,
            assiste vídeos, lê comentários, compara preços em sites diferentes —
            e mesmo assim continua insegura.
          </p>
          <p>
            Não porque faltou informação. Porque sobrou informação demais — e
            nenhuma delas foi organizada em torno do que importa para o seu caso.
          </p>
        </div>
        <ul className="mia-landing-problem-list">
          <li>Vendo reviews que dizem coisas opostas</li>
          <li>Assistindo vídeos que recomendam produtos diferentes</li>
          <li>Lendo comentários que não refletem o seu uso</li>
          <li>Abrindo comparadores que listam specs, mas não explicam trade-offs</li>
        </ul>
        <div className="mia-landing-callout">
          <p>
            O excesso de informação cria a mesma dúvida que a falta dela.
            Você vê dezenas de opções — e ainda não sabe qual escolher.
          </p>
        </div>
      </section>

      <section className="mia-landing-section mia-landing-flow">
        <h2 className="mia-landing-heading">
          Como a <MIAWordmark size="sm" /> pensa
        </h2>
        <p className="mia-landing-lead">
          Da sua pergunta à recomendação, com foco em clareza — não apenas em fichas técnicas.
        </p>
        <div className="mia-landing-flow-stack">
          <article className="mia-landing-flow-card mia-landing-flow-card--user">
            <span className="mia-landing-flow-label">Você fala</span>
            <p className="mia-landing-flow-quote">
              &ldquo;Quero um celular até R$ 2.000&rdquo;
            </p>
          </article>

          <div className="mia-landing-flow-arrow" aria-hidden="true">↓</div>

          <article className="mia-landing-flow-card mia-landing-flow-card--understand">
            <span className="mia-landing-flow-label">
              <MIAWordmark size="xs" /> entende
            </span>
            <ul className="mia-landing-flow-bullets">
              <li>Orçamento</li>
              <li>Uso real</li>
              <li>Prioridades</li>
              <li>Contexto</li>
              <li>Prós e contras</li>
            </ul>
          </article>

          <div className="mia-landing-flow-arrow" aria-hidden="true">↓</div>

          <article className="mia-landing-flow-card mia-landing-flow-card--result">
            <span className="mia-landing-flow-label">Depois</span>
            <ul className="mia-landing-flow-bullets mia-landing-flow-bullets--result">
              <li>Compara opções relevantes</li>
              <li>Explica diferenças</li>
              <li>Recomenda com contexto</li>
              <li>Mostra oportunidades</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="mia-landing-section mia-landing-diff">
        <h2 className="mia-landing-heading">
          O que torna a <MIAWordmark size="sm" /> diferente
        </h2>
        <p className="mia-landing-lead">
          IA vertical de compras — especialista em decisão, não em empilhar links.
        </p>
        <div className="mia-landing-diff-grid">
          {DIFFERENTIATORS.map((item) => (
            <article key={item.title} className="mia-landing-diff-card">
              <span className="mia-landing-diff-icon" aria-hidden="true">{item.icon}</span>
              <h3 className="mia-landing-diff-title">{item.title}</h3>
              <p className="mia-landing-diff-text">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mia-landing-section mia-landing-cta-mid">
        <p className="mia-landing-cta-mid-lead">
          Pronto para testar uma forma diferente de decidir?
        </p>
        <LandingCta className="mia-landing-cta--mid" />
      </section>

      <section className="mia-landing-section mia-landing-trust">
        <h2 className="mia-landing-heading">Transparência</h2>
        <p className="mia-landing-lead">
          Confiança não se constrói com slogans. Se constrói com regras claras.
        </p>
        <div className="mia-landing-trust-featured">
          <span className="mia-landing-trust-featured-icon" aria-hidden="true">✦</span>
          <p className="mia-landing-trust-featured-text">
            <strong>Seu interesse em primeiro lugar.</strong>{" "}
            <span className="mia-landing-trust-featured-gold">Não ganhamos comissão por indicação.</span>{" "}
            A recomendação não muda porque alguém pagou mais.
          </p>
        </div>
        <div className="mia-landing-trust-quotes">
          <blockquote className="mia-landing-trust-quote">
            <span className="mia-landing-trust-quote-mark">Não ganhamos comissão por indicação.</span>{" "}
            A MIΛ recomenda o que realmente faz sentido para você — não o que paga mais para aparecer.
          </blockquote>
          <blockquote className="mia-landing-trust-quote">
            <span className="mia-landing-trust-quote-mark">Seu interesse em primeiro lugar.</span>{" "}
            Não trabalhamos para as marcas. Trabalhamos para quem precisa decidir com clareza.
          </blockquote>
          <blockquote className="mia-landing-trust-quote">
            A confiança nasce quando a recomendação não depende de quem paga mais.
            Transparência não é detalhe — é a base do produto.
          </blockquote>
        </div>
      </section>

      <section className="mia-landing-section mia-landing-vision">
        <h2 className="mia-landing-heading">
          Por que estamos construindo a Teilor
        </h2>
        <p className="mia-landing-lead">
          Compras online são um dos problemas mais interessantes — e mais negligenciados — da internet.
        </p>
        <div className="mia-landing-prose">
          <p>
            IA genérica responde perguntas. IA vertical resolve um tipo de problema
            com profundidade. Compras online misturam preço, contexto, confiança,
            trade-offs e timing — e merecem uma inteligência feita para isso.
          </p>
          <p>
            A Teilor nasce da convicção de que decidir o que comprar pode ser mais
            claro, humano e inteligente. Não substituímos o seu julgamento —
            organizamos a informação para que ele funcione melhor.
          </p>
          <p>
            Estamos construindo uma experiência de compra assistida por IA: conversa
            natural, recomendações contextualizadas e transparência real sobre
            como cada sugestão é formada. Porque o futuro das compras online não
            é mais opções — é mais clareza.
          </p>
        </div>
      </section>

      <section className="mia-landing-section mia-landing-final">
        <h2 className="mia-landing-final-title">
          Pronto para comprar com mais confiança?
        </h2>
        <p className="mia-landing-final-sub">
          Comece uma conversa. A MIΛ está pronta para entender o que você precisa.
        </p>
        <LandingCta />
      </section>
    </div>
  );
}
