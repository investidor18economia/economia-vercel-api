import { useEffect, useState } from "react";

const BRAND_TAGLINES = [
  "A referência em IA para compras online",
  "Pioneiros em IA vertical para compras online",
  "Compras melhores começam aqui.",
  "Nunca mais pesquise sozinho.",
  "Boas compras começam entendendo você."
];

export default function TeilorBrandHero() {
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [taglineVisible, setTaglineVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return undefined;

    let swapTimer;

    const interval = setInterval(() => {
      setTaglineVisible(false);
      swapTimer = setTimeout(() => {
        setTaglineIndex((current) => (current + 1) % BRAND_TAGLINES.length);
        setTaglineVisible(true);
      }, 320);
    }, 3000);

    return () => {
      clearInterval(interval);
      if (swapTimer) clearTimeout(swapTimer);
    };
  }, []);

  return (
    <header className="teilor-brand-hero" aria-label="Teilor">
      <div className="teilor-brand-top-band" aria-hidden="true" />
      <p
        className={`teilor-brand-tagline${taglineVisible ? " teilor-brand-tagline--visible" : ""}`}
        aria-live="polite"
      >
        {BRAND_TAGLINES[taglineIndex]}
      </p>
      <div className="teilor-brand-logo-wrap">
        <img
          src="/teilor-logo.png"
          alt="Teilor"
          className="teilor-brand-logo"
          width={340}
          height={73}
          decoding="async"
        />
      </div>
      <div className="teilor-brand-trust" role="note">
        <span className="teilor-brand-trust-accent" aria-hidden="true" />
        <p className="teilor-brand-trust-text">
          <span className="teilor-brand-trust-line teilor-brand-trust-line--primary">
            Seu interesse em primeiro lugar. Sem comissão por indicação.
          </span>
          <span className="teilor-brand-trust-line teilor-brand-trust-line--secondary">
            Sem influência nas recomendações.
          </span>
        </p>
      </div>
    </header>
  );
}
