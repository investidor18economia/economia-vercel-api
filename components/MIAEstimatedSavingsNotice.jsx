import { useEffect, useState } from "react";

/**
 * Notificação premium de economia estimada (MVP).
 * PATCH visual — animação e hierarquia; texto/valor vêm do pai sem alteração.
 */
function parseSavingsMessage(message = "") {
  const trimmed = String(message || "").trim();
  if (!trimmed) return null;

  const hasIcon = trimmed.startsWith("💰");
  const rest = hasIcon ? trimmed.slice(1).trim() : trimmed;
  const amountMatch = rest.match(/R\$\s*\d+/);

  if (!amountMatch) {
    return {
      icon: hasIcon ? "💰" : "",
      prefix: rest,
      amount: "",
      suffix: ""
    };
  }

  const amount = amountMatch[0];
  const idx = rest.indexOf(amount);

  return {
    icon: hasIcon ? "💰" : "💰",
    prefix: rest.slice(0, idx),
    amount,
    suffix: rest.slice(idx + amount.length)
  };
}

export default function MIAEstimatedSavingsNotice({
  message,
  onComplete,
  inFlow = false
}) {
  const [phase, setPhase] = useState("idle");

  useEffect(() => {
    if (!message) {
      setPhase("idle");
      return undefined;
    }

    setPhase("idle");

    const delayBeforeShow = 800;
    const enterMs = 320;
    const visibleMs = 4800;
    const exitMs = 300;

    const tEnter = setTimeout(() => setPhase("enter"), delayBeforeShow);
    const tVisible = setTimeout(
      () => setPhase("visible"),
      delayBeforeShow + enterMs
    );
    const tExit = setTimeout(
      () => setPhase("exit"),
      delayBeforeShow + enterMs + visibleMs
    );
    const tDone = setTimeout(
      () => {
        setPhase("idle");
        onComplete?.();
      },
      delayBeforeShow + enterMs + visibleMs + exitMs
    );

    return () => {
      clearTimeout(tEnter);
      clearTimeout(tVisible);
      clearTimeout(tExit);
      clearTimeout(tDone);
    };
  }, [message, onComplete]);

  if (!message || phase === "idle") return null;

  const parts = parseSavingsMessage(message);

  return (
    <div
      className={`mia-estimated-savings mia-estimated-savings--${phase}${
        inFlow ? " mia-estimated-savings--in-flow" : ""
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="mia-estimated-savings__content">
        {parts?.icon ? (
          <span className="mia-estimated-savings__icon" aria-hidden="true">
            {parts.icon}
          </span>
        ) : null}
        <p className="mia-estimated-savings__text">
          {parts?.amount ? (
            <>
              <span className="mia-estimated-savings__prefix">{parts.prefix}</span>
              <strong className="mia-estimated-savings__amount">{parts.amount}</strong>
              <span className="mia-estimated-savings__suffix">{parts.suffix}</span>
            </>
          ) : (
            message
          )}
        </p>
      </div>
    </div>
  );
}
