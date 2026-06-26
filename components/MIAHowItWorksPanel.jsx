import { useEffect } from "react";

function SectionDivider() {
  return <div className="mia-how-divider" role="separator" aria-hidden="true" />;
}

function CheckItem({ children }) {
  return (
    <li className="mia-how-check-item">
      <span className="mia-how-check-mark" aria-hidden="true">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

function CrossItem({ children }) {
  return (
    <li className="mia-how-cross-item">
      <span className="mia-how-cross-mark" aria-hidden="true">
        ❌
      </span>
      <span>{children}</span>
    </li>
  );
}

function AuditStatusItem({ status = "building", children }) {
  const mark = status === "audited" ? "✅" : "☑️";
  return (
    <li className={`mia-how-audit-item mia-how-audit-item--${status}`}>
      <span className="mia-how-audit-mark" aria-hidden="true">
        {mark}
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function MIAHowItWorksPanel({ onClose, scrollToAnchor = null, onScrollAnchorHandled }) {
  useEffect(() => {
    if (!scrollToAnchor) return undefined;

    const timer = window.setTimeout(() => {
      const target = document.getElementById(scrollToAnchor);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (typeof onScrollAnchorHandled === "function") {
        onScrollAnchorHandled();
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [scrollToAnchor, onScrollAnchorHandled]);

  return (
    <div
      className="mia-side-panel mia-side-panel--how-it-works mia-how-hub mia-hub-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Como a MIA funciona"
    >
      <div className="mia-how-hub-header">
        <div className="mia-how-hub-header-copy">
          <p className="mia-how-hub-eyebrow">MIA</p>
          <h1 className="mia-how-hub-title">
            <span aria-hidden="true">✨</span> Como a MIA funciona
          </h1>
        </div>
        <button
          type="button"
          className="mia-panel-close-btn"
          onClick={onClose}
          aria-label="Fechar Como a MIA funciona"
        >
          Fechar
        </button>
      </div>

      <article className="mia-how-content">
        <header className="mia-how-hero">
          <h2 className="mia-how-hero-title">
            Boas compras começam entendendo você.
          </h2>
          <p className="mia-how-lead">
            A maioria das compras não começa no checkout.
          </p>
          <p className="mia-how-lead">Começa com dúvidas.</p>
          <ul className="mia-how-questions" aria-label="Dúvidas comuns">
            <li>Qual escolher?</li>
            <li>Vale a pena?</li>
            <li>Vou me arrepender depois?</li>
            <li>Existe uma opção melhor?</li>
          </ul>
          <p className="mia-how-body">Você pesquisa.</p>
          <p className="mia-how-body">Compara.</p>
          <p className="mia-how-body">Assiste vídeos.</p>
          <p className="mia-how-body">Lê avaliações.</p>
          <p className="mia-how-body">
            E mesmo assim continua sem ter certeza.
          </p>
          <p className="mia-how-body">
            Porque comprar bem não é apenas encontrar um produto.
          </p>
          <p className="mia-how-body mia-how-body--emphasis">
            É tomar uma boa decisão.
          </p>
        </header>

        <SectionDivider />

        <section className="mia-how-section">
          <h2 className="mia-how-section-title">
            É por isso que a MIA existe.
          </h2>
          <p className="mia-how-body">
            A MIA foi criada para ajudar você a decidir melhor antes de comprar.
          </p>
          <p className="mia-how-body">Não para empurrar produtos.</p>
          <p className="mia-how-body">
            Não para mostrar centenas de opções.
          </p>
          <p className="mia-how-body">
            Não para transformar sua compra em mais uma lista de especificações.
          </p>
          <p className="mia-how-body">A ideia é simples:</p>
          <p className="mia-how-body mia-how-body--emphasis">
            Entender seu contexto antes de recomendar qualquer coisa.
          </p>
        </section>

        <SectionDivider />

        <section className="mia-how-section">
          <h2 className="mia-how-section-title">🧠 Como a MIA pensa</h2>
          <p className="mia-how-body">
            Antes de recomendar, a MIA procura entender coisas que normalmente
            ficam fora das especificações.
          </p>
          <ul className="mia-how-check-list">
            <CheckItem>Como você pretende usar o produto</CheckItem>
            <CheckItem>O que realmente importa para você</CheckItem>
            <CheckItem>O que pode causar arrependimento depois</CheckItem>
            <CheckItem>Quanto tempo você pretende ficar com ele</CheckItem>
            <CheckItem>Quais limitações fazem diferença no dia a dia</CheckItem>
          </ul>
          <p className="mia-how-body">
            Porque duas pessoas podem receber recomendações completamente
            diferentes para a mesma pergunta.
          </p>
          <p className="mia-how-body">E isso é normal.</p>
        </section>

        <SectionDivider />

        <section className="mia-how-section">
          <h2 className="mia-how-section-title">📱 Um exemplo simples</h2>
          <p className="mia-how-label">Usuário:</p>
          <blockquote className="mia-how-quote mia-how-quote--user">
            &ldquo;Quero um celular até R$ 2.000 para trabalhar, usar bastante
            durante o dia e ficar alguns anos com ele.&rdquo;
          </blockquote>
          <p className="mia-how-body">
            A MIA não procura apenas o aparelho com a maior pontuação.
          </p>
          <p className="mia-how-body">
            Ela procura o que faz mais sentido para esse contexto.
          </p>
          <p className="mia-how-label">Resposta:</p>
          <blockquote className="mia-how-quote mia-how-quote--mia">
            &ldquo;Neste caso, o Galaxy A56 faz mais sentido do que opções
            focadas apenas em desempenho bruto.
            <br />
            <br />
            Você abre mão de um pouco de potência em alguns cenários, mas ganha
            suporte mais longo, maior tranquilidade no dia a dia e menor chance
            de arrependimento daqui a alguns anos.&rdquo;
          </blockquote>
          <p className="mia-how-body">
            A diferença não está apenas na resposta.
          </p>
          <p className="mia-how-body mia-how-body--emphasis">
            Está no raciocínio por trás dela.
          </p>
        </section>

        <SectionDivider />

        <section className="mia-how-section">
          <h2 className="mia-how-section-title">
            🔍 O que torna a MIA diferente
          </h2>
          <ul className="mia-how-check-list">
            <CheckItem>Entende seu contexto antes de recomendar</CheckItem>
            <CheckItem>Explica as consequências de cada escolha</CheckItem>
            <CheckItem>Mostra vantagens e limitações com clareza</CheckItem>
            <CheckItem>Ajuda a evitar compras que geram arrependimento</CheckItem>
            <CheckItem>Economiza horas de pesquisa</CheckItem>
            <CheckItem>
              Busca a melhor decisão, não apenas o menor preço
            </CheckItem>
          </ul>
        </section>

        <SectionDivider />

        <section className="mia-how-section">
          <h2 className="mia-how-section-title">❌ O que a MIA não faz</h2>
          <p className="mia-how-body">
            Nem toda recomendação é realmente útil.
          </p>
          <p className="mia-how-body">
            Por isso, existem coisas que a MIA evita fazer.
          </p>
          <ul className="mia-how-cross-list">
            <CrossItem>Não escolhe automaticamente o produto mais caro</CrossItem>
            <CrossItem>Não recomenda baseado em comissão</CrossItem>
            <CrossItem>Não esconde limitações importantes</CrossItem>
            <CrossItem>Não trata todas as pessoas da mesma forma</CrossItem>
            <CrossItem>
              Não assume que a mesma resposta serve para todo mundo
            </CrossItem>
            <CrossItem>Não tenta empurrar uma compra</CrossItem>
          </ul>
        </section>

        <SectionDivider />

        <section className="mia-how-section">
          <h2 className="mia-how-section-title">
            🛡️ Transparência em primeiro lugar
          </h2>
          <p className="mia-how-body">
            A confiança faz parte da recomendação.
          </p>
          <p className="mia-how-body">Por isso:</p>
          <ul className="mia-how-check-list">
            <CheckItem>Não recebemos comissão por indicação</CheckItem>
            <CheckItem>
              Não existe influência de marcas nas recomendações
            </CheckItem>
            <CheckItem>Mostramos pontos fortes e limitações</CheckItem>
            <CheckItem>Seu interesse vem antes de qualquer produto</CheckItem>
          </ul>
          <p className="mia-how-body mia-how-body--emphasis">
            Porque uma boa recomendação só funciona quando existe confiança.
          </p>
        </section>

        <SectionDivider />

        <section className="mia-how-section" id="auditoria">
          <h2 className="mia-how-section-title">🧠 Como a MIA audita os produtos</h2>
          <p className="mia-how-body">
            A MIA só trata uma categoria como conhecimento confiável depois de organizar,
            validar e revisar os dados.
          </p>
          <p className="mia-how-body">
            Enquanto uma categoria ainda está em construção, a MIA pode usar fontes comerciais
            e fallback governado para ajudar na decisão, mas mostra isso com transparência.
          </p>
          <ul className="mia-how-audit-list" aria-label="Status de auditoria por categoria">
            <AuditStatusItem status="audited">Smartphones/celulares — auditado</AuditStatusItem>
            <AuditStatusItem status="building">Notebooks — em construção</AuditStatusItem>
            <AuditStatusItem status="building">PCs gamer — em construção</AuditStatusItem>
            <AuditStatusItem status="building">TVs — em construção</AuditStatusItem>
            <AuditStatusItem status="building">Monitores — em construção</AuditStatusItem>
            <AuditStatusItem status="building">Acessórios — em construção</AuditStatusItem>
          </ul>
        </section>

        <SectionDivider />

        <section className="mia-how-section">
          <h2 className="mia-how-section-title">
            ⏳ Menos tempo pesquisando. Mais clareza para decidir.
          </h2>
          <p className="mia-how-body">A internet tem informação suficiente.</p>
          <p className="mia-how-body">
            O problema normalmente não é falta de informação.
          </p>
          <p className="mia-how-body">É excesso.</p>
          <p className="mia-how-body">
            A MIA existe para transformar informação em clareza.
          </p>
          <p className="mia-how-body">
            Para que você passe menos tempo pesquisando e mais tempo tomando
            decisões com confiança.
          </p>
        </section>

        <SectionDivider />

        <section className="mia-how-section">
          <h2 className="mia-how-section-title">🎯 Nossa missão</h2>
          <ul className="mia-how-mission-list">
            <li>Ajudar pessoas a comprar com mais segurança.</li>
            <li>Reduzir arrependimentos.</li>
            <li>Economizar tempo.</li>
            <li>Explicar decisões com clareza.</li>
            <li>
              E colocar o interesse do usuário acima de qualquer outra coisa.
            </li>
          </ul>
        </section>

        <SectionDivider />

        <section className="mia-how-section mia-how-section--context">
          <h3 className="mia-how-subsection-title">
            Produtos são iguais no papel. Pessoas não.
          </h3>
          <p className="mia-how-body">Cada pessoa tem prioridades diferentes.</p>
          <p className="mia-how-body">Rotinas diferentes.</p>
          <p className="mia-how-body">Necessidades diferentes.</p>
          <p className="mia-how-body">
            Por isso a melhor escolha depende do contexto.
          </p>
          <p className="mia-how-body mia-how-body--emphasis">
            E contexto muda tudo.
          </p>
        </section>

        <SectionDivider />

        <footer className="mia-how-manifesto" aria-label="Manifesto da MIA">
          <p className="mia-how-manifesto-line">
            A MIA não foi criada para ajudar você a comprar mais.
          </p>
          <p className="mia-how-manifesto-line mia-how-manifesto-line--accent">
            Foi criada para ajudar você a comprar melhor.
          </p>
        </footer>
      </article>
    </div>
  );
}
