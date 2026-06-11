/** Marca tipográfica padronizada: MIΛ */
export const MIA_BRAND = "MIΛ";

export default function MIAWordmark({
  className = "",
  size = "md",
  showBeta = false,
  suffix = null,
  prefix = null,
  as = "span",
}) {
  const Tag = as;
  const classes = [
    "mia-wordmark",
    `mia-wordmark--${size}`,
    showBeta ? "mia-wordmark--with-beta" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} aria-label={MIA_BRAND}>
      {prefix ? <span className="mia-wordmark-prefix">{prefix}</span> : null}
      <span className="mia-wordmark-text">{MIA_BRAND}</span>
      {showBeta ? (
        <span className="mia-wordmark-beta" aria-hidden="true">
          beta
        </span>
      ) : null}
      {suffix ? <span className="mia-wordmark-suffix">{suffix}</span> : null}
    </Tag>
  );
}

export function MIAWordmarkInline({ className = "", size = "sm" }) {
  return <MIAWordmark className={className} size={size} as="span" />;
}
