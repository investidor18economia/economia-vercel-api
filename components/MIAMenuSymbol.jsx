import { MIA_SYMBOL_SRC } from "../lib/miaSymbol";

/** Ícone padronizado da MIΛ em botões do menu/drawer. */
export default function MIAMenuSymbol({ className = "" }) {
  return (
    <span className={`mia-menu-symbol${className ? ` ${className}` : ""}`} aria-hidden="true">
      <img src={MIA_SYMBOL_SRC} alt="" className="mia-menu-symbol-image" decoding="async" />
    </span>
  );
}
