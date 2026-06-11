import { useState } from "react";

import MIAWordmark from "./MIAWordmark";

const CONTACT_EMAIL = "contato@teilor.com.br";

const FAQ_ITEMS = [
  {
    id: "teilor",
    question: "O que é a Teilor?",
    answer:
      "A Teilor é uma empresa focada em criar inteligência para decisões de compra. Nossa missão é ajudar pessoas a comprarem melhor, com mais clareza, contexto e confiança.",
  },
  {
    id: "mia",
    question: "Quem é a MIΛ?",
    answer:
      "A MIΛ é a assistente inteligente da Teilor. Ela analisa contexto, prioridades, orçamento e necessidades para ajudar você a tomar decisões de compra mais inteligentes.",
  },
  {
    id: "cheapest",
    question: "A MIΛ sempre recomenda o produto mais barato?",
    answer:
      "Não. O objetivo da MIΛ não é encontrar apenas o menor preço. O objetivo é encontrar a opção que realmente faz mais sentido para você.",
  },
  {
    id: "commission",
    question: "A MIΛ ganha comissão pelas recomendações?",
    answer:
      "Não. As recomendações da MIΛ não são influenciadas por comissão ou pagamento por indicação.",
  },
  {
    id: "trust",
    question: "Posso confiar nas recomendações?",
    answer:
      "A MIΛ foi criada para explicar o motivo das recomendações. Você entende os pontos fortes, limitações e diferenças antes de tomar sua decisão.",
  },
  {
    id: "favorites",
    question: "O que acontece quando eu salvo um favorito?",
    answer:
      "Você pode acompanhar produtos que chamaram sua atenção e voltar neles quando quiser.",
  },
  {
    id: "alerts",
    question: "O que acontece quando eu ativo um alerta?",
    answer:
      "A MIΛ acompanha oportunidades para você e pode avisar quando houver mudanças relevantes.",
  },
  {
    id: "account",
    question: "Preciso criar uma conta?",
    answer:
      "Você pode conversar com a MIΛ sem criar conta. Mas criar uma conta permite salvar favoritos, acompanhar alertas e personalizar sua experiência.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Você explica o que precisa",
    text: "Exemplo: \"Quero um celular até R$ 2.000\"",
  },
  {
    step: "2",
    title: "A MIΛ entende seu contexto",
    bullets: ["orçamento", "uso", "prioridades", "necessidades"],
  },
  {
    step: "3",
    title: "A MIΛ compara opções",
    bullets: ["diferenças reais", "vantagens", "limitações"],
  },
  {
    step: "4",
    title: "A MIΛ explica o motivo",
    text: "Você entende o porquê da recomendação.",
  },
  {
    step: "5",
    title: "Você acompanha oportunidades",
    bullets: ["favoritos", "alertas", "histórico"],
  },
];

const TRANSPARENCY_ITEMS = [
  {
    title: "Não ganhamos comissão por indicação.",
    text: "A MIΛ recomenda o que realmente faz sentido para você.",
  },
  {
    title: "Não trabalhamos para as marcas.",
    text: "Trabalhamos para o usuário.",
  },
  {
    title: "Você entende o motivo das recomendações.",
    text: "Transparência faz parte da experiência.",
  },
];

const CAPABILITIES = [
  {
    icon: "📱",
    title: "Encontrar celulares",
    text: "Compare opções com base no que importa para o seu uso.",
  },
  {
    icon: "💻",
    title: "Encontrar notebooks",
    text: "Entenda diferenças reais antes de decidir.",
  },
  {
    icon: "🎧",
    title: "Encontrar acessórios",
    text: "Descubra o que combina com o que você já tem ou quer comprar.",
  },
  {
    icon: "🔔",
    title: "Monitorar preços",
    text: "A MIΛ pode acompanhar oportunidades para você.",
  },
  {
    icon: "❤️",
    title: "Salvar favoritos",
    text: "Guarde produtos importantes e volte quando quiser.",
  },
  {
    icon: "🧠",
    title: "Explicar diferenças",
    text: "Veja prós, contras e o motivo de cada sugestão.",
  },
];

export default function MIAHelpPanel({
  onClose,
  onScrollToChat,
  defaultName = "",
  defaultEmail = "",
  onSubmitSupport,
}) {
  const [openFaqId, setOpenFaqId] = useState(FAQ_ITEMS[0]?.id || null);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleFaq(id) {
    setOpenFaqId((current) => (current === id ? null : id));
  }

  function handleSupportSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName || !trimmedEmail || !trimmedMessage) {
      onSubmitSupport?.({ error: "Preencha nome, email e mensagem." });
      return;
    }

    setSubmitting(true);

    const subject = encodeURIComponent("Contato via Central de Ajuda Teilor");
    const body = encodeURIComponent(
      `Nome: ${trimmedName}\nEmail: ${trimmedEmail}\n\n${trimmedMessage}`
    );
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;

    if (typeof window !== "undefined") {
      window.location.href = mailto;
    }

    onSubmitSupport?.({ success: true });
    setSubmitting(false);
  }

  return (
    <div
      className="mia-side-panel mia-side-panel--help mia-help-hub mia-hub-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Central de Ajuda da Teilor"
    >
      <div className="mia-help-hub-header">
        <div className="mia-help-hub-header-copy">
          <p className="mia-help-hub-eyebrow">Central Teilor</p>
          <h4 className="mia-help-hub-title">
            <span aria-hidden="true">❓</span> Central de Ajuda da Teilor
          </h4>
          <p className="mia-help-hub-subtitle">
            Tudo o que você precisa saber para comprar com mais confiança usando a MIΛ.
          </p>
        </div>
        <button
          type="button"
          className="mia-panel-close-btn"
          onClick={onClose}
          aria-label="Fechar central de ajuda"
        >
          Fechar
        </button>
      </div>

      <section className="mia-help-section" aria-labelledby="mia-help-faq-title">
        <h5 id="mia-help-faq-title" className="mia-help-hub-section-title">
          Perguntas frequentes
        </h5>
        <div className="mia-help-faq-list">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openFaqId === item.id;
            return (
              <article
                key={item.id}
                className={`mia-help-faq-item${isOpen ? " mia-help-faq-item--open" : ""}`}
              >
                <button
                  type="button"
                  className="mia-help-faq-trigger"
                  aria-expanded={isOpen}
                  onClick={() => toggleFaq(item.id)}
                >
                  <span className="mia-help-faq-question">{item.question}</span>
                  <span className="mia-help-faq-icon" aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <div className="mia-help-faq-answer">
                    <p>{item.answer}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mia-help-section" aria-labelledby="mia-help-how-title">
        <h5 id="mia-help-how-title" className="mia-help-hub-section-title">
          <span aria-hidden="true">🧠</span> Como a <MIAWordmark size="xs" /> trabalha
        </h5>
        <p className="mia-help-section-intro">
          Da sua dúvida até uma recomendação mais inteligente.
        </p>
        <div className="mia-help-flow">
          {HOW_IT_WORKS.map((item, index) => (
            <div key={item.step} className="mia-help-flow-item-wrap">
              <article className="mia-help-flow-item">
                <span className="mia-help-flow-step">{item.step}</span>
                <div>
                  <h6 className="mia-help-flow-title">{item.title}</h6>
                  {item.text && <p className="mia-help-flow-text">{item.text}</p>}
                  {item.bullets && (
                    <ul className="mia-help-flow-bullets">
                      {item.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
              {index < HOW_IT_WORKS.length - 1 && (
                <div className="mia-help-flow-arrow" aria-hidden="true">↓</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mia-help-section mia-help-transparency" aria-labelledby="mia-help-transparency-title">
        <h5 id="mia-help-transparency-title" className="mia-help-hub-section-title">
          <span aria-hidden="true">🔍</span> Transparência da Teilor
        </h5>
        <div className="mia-help-transparency-grid">
          {TRANSPARENCY_ITEMS.map((item) => (
            <article key={item.title} className="mia-help-transparency-card">
              <h6 className="mia-help-transparency-title">{item.title}</h6>
              <p className="mia-help-transparency-text">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mia-help-section" aria-labelledby="mia-help-capabilities-title">
        <h5 id="mia-help-capabilities-title" className="mia-help-hub-section-title">
          <span aria-hidden="true">✨</span> O que a <MIAWordmark size="xs" /> pode fazer por você
        </h5>
        <div className="mia-help-capabilities-grid">
          {CAPABILITIES.map((item) => (
            <article key={item.title} className="mia-help-capability-card">
              <span className="mia-help-capability-icon" aria-hidden="true">{item.icon}</span>
              <h6 className="mia-help-capability-title">{item.title}</h6>
              <p className="mia-help-capability-text">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mia-help-section" aria-labelledby="mia-help-support-title">
        <h5 id="mia-help-support-title" className="mia-help-hub-section-title">
          <span aria-hidden="true">✉️</span> Fale com a equipe Teilor
        </h5>
        <p className="mia-help-section-intro">
          Não encontrou sua resposta? Envie sua mensagem.
        </p>
        <form className="mia-help-support-form" onSubmit={handleSupportSubmit}>
          <label className="mia-help-field">
            <span className="mia-help-field-label">Nome</span>
            <input
              type="text"
              className="mia-help-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Seu nome"
              disabled={submitting}
              required
            />
          </label>
          <label className="mia-help-field">
            <span className="mia-help-field-label">Email</span>
            <input
              type="email"
              className="mia-help-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu@email.com"
              disabled={submitting}
              required
            />
          </label>
          <label className="mia-help-field">
            <span className="mia-help-field-label">Mensagem</span>
            <textarea
              className="mia-help-textarea"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Como podemos ajudar?"
              rows={3}
              disabled={submitting}
              required
            />
          </label>
          <button type="submit" className="mia-help-support-btn" disabled={submitting}>
            {submitting ? "Abrindo email..." : "Enviar mensagem"}
          </button>
        </form>
        <p className="mia-help-contact-email">
          Ou escreva para{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="mia-help-contact-link">
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>

      <section className="mia-help-final-cta" aria-labelledby="mia-help-final-title">
        <h5 id="mia-help-final-title" className="mia-help-final-title">
          Ainda tem dúvidas?
        </h5>
        <p className="mia-help-final-text">
          A forma mais rápida de entender o que faz sentido para você é conversar
          diretamente com a MIΛ.
        </p>
        <button type="button" className="mia-help-hub-cta" onClick={onScrollToChat}>
          <span aria-hidden="true">💬</span>
          Conversar com a MIΛ
        </button>
      </section>
    </div>
  );
}
