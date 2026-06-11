import { useState } from "react";
import MIAWordmark from "./MIAWordmark";
import MIAAvatar from "./MIAAvatar";
import { MIA_NO_SPAM_MESSAGE } from "../lib/miaTrustCopy";

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Escolha um produto",
    text: "Você diz qual produto quer acompanhar.",
  },
  {
    step: "2",
    title: "Defina o momento ideal",
    text: "Pode ser um preço específico ou uma boa queda de valor.",
  },
  {
    step: "3",
    title: "A MIΛ monitora para você",
    text: "Quando surgir uma oportunidade interessante, você recebe um aviso.",
  },
];

const MIA_SUGGESTIONS = [
  {
    icon: "🎯",
    title: "Produtos que você acompanha com frequência",
    text: "Acompanhe itens importantes sem precisar pesquisar todos os dias.",
  },
  {
    icon: "📉",
    title: "Oportunidades de queda de preço",
    text: "Receba avisos quando surgir uma oportunidade interessante.",
  },
  {
    icon: "💸",
    title: "Ofertas que valem a pena acompanhar",
    text: "A MIΛ ajuda você a não perder bons momentos de compra.",
  },
  {
    icon: "❤️",
    title: "Produtos salvos nos Favoritos",
    text: "Transforme favoritos em alertas e acompanhe tudo em um só lugar.",
  },
];

function formatSavedDate(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function alertToProduct(alert) {
  return {
    product_name: alert.product_name,
    title: alert.product_name,
    price: alert.current_price,
    link: alert.link,
    thumbnail: alert.thumbnail,
    source: alert.source,
  };
}

export default function MIAAlertsPanel({
  alerts = [],
  favorites = [],
  onClose,
  onScrollToChat,
  onOpenFavorites,
  onCreateAlert,
  onStartFirstAlert,
  onFavorite,
  onRemoveAlert,
  onAskMia,
  isFavorited,
  formatPrice,
  actionBusy,
}) {
  const [productName, setProductName] = useState("");
  const [seenPrice, setSeenPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");

  const hasAlerts = alerts.length > 0;
  const formBusy = actionBusy === "create-alert";

  function prefillFromFavorite(favorite) {
    setProductName(favorite.product_name || "");
    if (favorite.price) {
      const formatted = formatPrice(favorite.price);
      if (formatted && formatted !== "Preço indisponível") {
        setSeenPrice(formatted.replace(/^R\$\s?/, "").trim());
      }
    }
    setTargetPrice("");
    setDiscountPercent("");
  }

  function handleSubmit(event) {
    event.preventDefault();
    onCreateAlert({
      productName: productName.trim(),
      seenPrice: seenPrice.trim(),
      targetPrice: targetPrice.trim(),
      discountPercent: discountPercent.trim(),
    });
  }

  return (
    <div
      className="mia-side-panel mia-side-panel--alerts mia-alerts-hub mia-hub-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Alertas Inteligentes"
    >
      <div className="mia-alerts-hub-header">
        <div className="mia-alerts-hub-header-copy">
          <p className="mia-alerts-hub-eyebrow">Central Teilor</p>
          <h4 className="mia-alerts-hub-title">
            <span aria-hidden="true">🔔</span> Alertas Inteligentes
          </h4>
          <p className="mia-alerts-hub-subtitle">
            A MIΛ acompanha oportunidades para você não precisar pesquisar toda hora.
          </p>
        </div>
        <button
          type="button"
          className="mia-panel-close-btn"
          onClick={onClose}
          aria-label="Fechar alertas inteligentes"
        >
          Fechar
        </button>
      </div>

      <div className="mia-alerts-hub-mia-note" role="note">
        <span className="mia-alerts-hub-mia-dot" aria-hidden="true" />
        A MIΛ continua acompanhando oportunidades mesmo quando você não está pesquisando.
      </div>

      <p className="mia-hub-trust-note">{MIA_NO_SPAM_MESSAGE}</p>

      <section className="mia-alerts-hub-active mia-alerts-hub-active--primary" aria-labelledby="mia-alerts-active-title">
        <h5 id="mia-alerts-active-title" className="mia-alerts-hub-section-title">
          <span aria-hidden="true">🔔</span> Produtos monitorados
        </h5>

        {!hasAlerts && (
          <div className="mia-alerts-hub-empty">
            <div className="mia-alerts-hub-empty-icon mia-hub-empty-mia-mark" aria-hidden="true">
              <MIAAvatar size="feed" alt="" />
            </div>
            <p className="mia-alerts-hub-empty-title">Nenhum alerta ativo ainda.</p>
            <p className="mia-alerts-hub-empty-text">
              Crie seu primeiro alerta e deixe a MIΛ acompanhar oportunidades para você.
            </p>
            <p className="mia-alerts-hub-empty-trust">{MIA_NO_SPAM_MESSAGE}</p>
            <button
              type="button"
              className="mia-alerts-hub-empty-cta"
              onClick={() => onStartFirstAlert?.()}
            >
              Criar meu primeiro alerta
            </button>
          </div>
        )}

        {hasAlerts && (
          <div className="mia-alerts-hub-list">
            {alerts.map((alert) => {
              const savedDate = formatSavedDate(alert.created_at);
              const targetLabel = alert.target_price != null && alert.target_price !== ""
                ? formatPrice(alert.target_price)
                : "";
              const currentLabel = alert.current_price != null && alert.current_price !== ""
                ? formatPrice(alert.current_price)
                : "";
              const product = alertToProduct(alert);
              const favorited = isFavorited?.(product);
              const busyRemove = actionBusy === `remove-alert-${alert.id}`;
              const busyFavorite = actionBusy === "favorite";

              return (
                <article key={alert.id} className="mia-alerts-card">
                  <div className="mia-alerts-card-main">
                    <div className="mia-alerts-card-media">
                      {alert.thumbnail ? (
                        <img
                          src={alert.thumbnail}
                          alt=""
                          className="mia-alerts-card-image"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="mia-alerts-card-fallback" aria-hidden="true">📦</span>
                      )}
                    </div>
                    <div className="mia-alerts-card-body">
                      <h6 className="mia-alerts-card-name">{alert.product_name}</h6>
                      {targetLabel && targetLabel !== "Preço indisponível" && (
                        <p className="mia-alerts-card-target">
                          Avisar quando chegar a {targetLabel}
                        </p>
                      )}
                      {currentLabel && currentLabel !== "Preço indisponível" && (
                        <p className="mia-alerts-card-meta">Preço de referência: {currentLabel}</p>
                      )}
                      {savedDate && (
                        <p className="mia-alerts-card-date">Ativo desde {savedDate}</p>
                      )}
                    </div>
                  </div>
                  <div className="mia-alerts-card-actions">
                    <button
                      type="button"
                      className={`mia-alerts-card-btn${favorited ? " mia-alerts-card-btn--active" : ""}`}
                      onClick={() => onFavorite?.(product)}
                      disabled={busyFavorite || favorited}
                    >
                      <span aria-hidden="true">❤️</span>
                      {favorited ? "Favoritado" : "Favoritar"}
                    </button>
                    <button
                      type="button"
                      className="mia-alerts-card-btn"
                      onClick={() => onAskMia?.(product)}
                      disabled={Boolean(actionBusy)}
                    >
                      <span aria-hidden="true">💬</span> Perguntar para a MIΛ
                    </button>
                    <button
                      type="button"
                      className="mia-alerts-card-btn mia-alerts-card-btn--danger"
                      onClick={() => onRemoveAlert?.(alert)}
                      disabled={busyRemove}
                    >
                      <span aria-hidden="true">🔕</span> Remover monitoramento
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mia-alerts-hub-create" aria-labelledby="mia-alerts-create-title">
        <h5 id="mia-alerts-create-title" className="mia-alerts-hub-section-title">
          Criar um alerta
        </h5>
        <p className="mia-alerts-hub-create-intro">
          Encontrou algo que vale a pena acompanhar? Escolha um produto e diga quando você
          gostaria de ser avisado. A MIΛ continua observando para você.
        </p>

        {favorites.length > 0 && (
          <div className="mia-alerts-hub-fav-quick">
            <p className="mia-alerts-hub-fav-quick-label">Preencher a partir dos favoritos</p>
            <div className="mia-alerts-hub-fav-quick-list">
              {favorites.slice(0, 4).map((favorite) => (
                <button
                  key={favorite.id}
                  type="button"
                  className="mia-alerts-hub-fav-chip"
                  onClick={() => prefillFromFavorite(favorite)}
                  disabled={formBusy}
                >
                  {favorite.product_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <form className="mia-alerts-hub-form" onSubmit={handleSubmit}>
          <label className="mia-alerts-hub-field">
            <span className="mia-alerts-hub-field-label">Qual produto você quer acompanhar?</span>
            <input
              type="text"
              className="mia-alerts-hub-input"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Ex.: iPhone 13 128GB"
              disabled={formBusy}
              required
            />
          </label>

          <label className="mia-alerts-hub-field">
            <span className="mia-alerts-hub-field-label">Preço que você viu hoje (opcional)</span>
            <input
              type="text"
              inputMode="decimal"
              className="mia-alerts-hub-input"
              value={seenPrice}
              onChange={(event) => setSeenPrice(event.target.value)}
              placeholder="Ex.: 3.499"
              disabled={formBusy}
            />
          </label>

          <label className="mia-alerts-hub-field">
            <span className="mia-alerts-hub-field-label">Quanto você gostaria de pagar?</span>
            <input
              type="text"
              inputMode="decimal"
              className="mia-alerts-hub-input"
              value={targetPrice}
              onChange={(event) => setTargetPrice(event.target.value)}
              placeholder="Ex.: 2.999"
              disabled={formBusy}
            />
          </label>

          <label className="mia-alerts-hub-field">
            <span className="mia-alerts-hub-field-label">Ou me avise se cair (%)</span>
            <input
              type="text"
              inputMode="numeric"
              className="mia-alerts-hub-input"
              value={discountPercent}
              onChange={(event) => setDiscountPercent(event.target.value)}
              placeholder="Ex.: 10"
              disabled={formBusy}
            />
          </label>

          <button
            type="submit"
            className="mia-alerts-hub-submit"
            disabled={formBusy || !productName.trim()}
          >
            {formBusy ? "Ativando alerta..." : "Ativar alerta inteligente"}
          </button>
          <p className="mia-alerts-hub-submit-trust">{MIA_NO_SPAM_MESSAGE}</p>
        </form>
      </section>

      <section className="mia-alerts-hub-how" aria-labelledby="mia-alerts-how-title">
        <h5 id="mia-alerts-how-title" className="mia-alerts-hub-section-title">
          <span aria-hidden="true">💡</span> Como a <MIAWordmark size="xs" /> acompanha oportunidades
        </h5>
        <div className="mia-alerts-hub-flow">
          {HOW_IT_WORKS.map((item, index) => (
            <div key={item.step} className="mia-alerts-hub-flow-item-wrap">
              <article className="mia-alerts-hub-flow-item">
                <span className="mia-alerts-hub-flow-step">{item.step}</span>
                <div>
                  <h6 className="mia-alerts-hub-flow-title">{item.title}</h6>
                  <p className="mia-alerts-hub-flow-text">{item.text}</p>
                </div>
              </article>
              {index < HOW_IT_WORKS.length - 1 && (
                <div className="mia-alerts-hub-flow-arrow" aria-hidden="true">↓</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mia-alerts-hub-bridge" aria-labelledby="mia-alerts-bridge-title">
        <h5 id="mia-alerts-bridge-title" className="mia-alerts-hub-bridge-title">
          <span aria-hidden="true">❤️</span> Favoritos e Alertas trabalham juntos
        </h5>
        <p className="mia-alerts-hub-bridge-text">
          Produtos que você salva nos Favoritos podem virar alertas com apenas um toque.
          Isso ajuda a acompanhar oportunidades sem precisar procurar o produto novamente.
        </p>
        <button type="button" className="mia-alerts-hub-bridge-btn" onClick={onOpenFavorites}>
          Ver Favoritos Inteligentes
        </button>
      </section>

      <section className="mia-alerts-hub-suggestions" aria-labelledby="mia-alerts-suggestions-title">
        <h5 id="mia-alerts-suggestions-title" className="mia-alerts-hub-section-title">
          <MIAAvatar size="drawer" className="mia-avatar-inline-title" alt="" />
          O que a <MIAWordmark size="xs" /> pode monitorar por você
        </h5>
        <div className="mia-alerts-hub-suggestions-grid">
          {MIA_SUGGESTIONS.map((item) => (
            <article key={item.title} className="mia-alerts-hub-suggestion-card">
              <span className="mia-alerts-hub-suggestion-icon" aria-hidden="true">{item.icon}</span>
              <h6 className="mia-alerts-hub-suggestion-title">{item.title}</h6>
              <p className="mia-alerts-hub-suggestion-text">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="mia-alerts-hub-footer-cta">
        <button type="button" className="mia-alerts-hub-cta" onClick={onScrollToChat}>
          <span aria-hidden="true">💬</span>
          Conversar com a MIΛ
        </button>
      </div>
    </div>
  );
}
