const FEED_EDU_ITEMS = [
  {
    icon: "🧠",
    title: "Contexto",
    text: "A MIΛ leva em conta o que você pesquisa.",
  },
  {
    icon: "❤️",
    title: "Interesse",
    text: "Favoritos ajudam a entender o que chama sua atenção.",
  },
  {
    icon: "🔔",
    title: "Oportunidades",
    text: "Alertas ajudam a identificar bons momentos.",
  },
  {
    icon: "🎯",
    title: "Relevância",
    text: "O objetivo não é mostrar mais produtos. É mostrar produtos melhores.",
  },
];

export default function FeedEducationSection() {
  return (
    <section className="mia-feed-edu" aria-labelledby="mia-feed-edu-title">
      <h5 id="mia-feed-edu-title" className="mia-feed-edu-title">
        Como funciona o Feed da MIΛ?
      </h5>
      <div className="mia-feed-edu-grid">
        {FEED_EDU_ITEMS.map((item) => (
          <article key={item.title} className="mia-feed-edu-card">
            <span className="mia-feed-edu-icon" aria-hidden="true">
              {item.icon}
            </span>
            <h6 className="mia-feed-edu-card-title">{item.title}</h6>
            <p className="mia-feed-edu-card-text">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
