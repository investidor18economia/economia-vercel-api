/**
 * PATCH Comercial 4E-B — Commercial Runtime Mode
 *
 * Feature flag central para legacy / shadow / controlled.
 */

export const COMMERCIAL_RUNTIME_MODE_VERSION = "4E-B";

export const COMMERCIAL_RUNTIME_MODES = Object.freeze({
  LEGACY: "legacy",
  SHADOW: "shadow",
  CONTROLLED: "controlled",
});

const VALID_MODES = new Set(Object.values(COMMERCIAL_RUNTIME_MODES));

/**
 * @param {string} [override]
 */
export function getCommercialRuntimeMode(override = null) {
  const raw = String(
    override != null ? override : process.env.COMMERCIAL_RUNTIME_MODE || COMMERCIAL_RUNTIME_MODES.LEGACY
  )
    .trim()
    .toLowerCase();

  return VALID_MODES.has(raw) ? raw : COMMERCIAL_RUNTIME_MODES.LEGACY;
}

export function isCommercialRuntimeLegacy(mode = getCommercialRuntimeMode()) {
  return mode === COMMERCIAL_RUNTIME_MODES.LEGACY;
}

export function isCommercialRuntimeShadow(mode = getCommercialRuntimeMode()) {
  return mode === COMMERCIAL_RUNTIME_MODES.SHADOW;
}

export function isCommercialRuntimeControlled(mode = getCommercialRuntimeMode()) {
  return mode === COMMERCIAL_RUNTIME_MODES.CONTROLLED;
}

/**
 * Shadow diagnostics ativos em shadow mode ou via flag legada em legacy mode.
 */
export function isCommercialRuntimeShadowDiagnosticsEnabled(mode = getCommercialRuntimeMode()) {
  if (isCommercialRuntimeShadow(mode)) return true;
  if (!isCommercialRuntimeLegacy(mode)) return false;

  const raw = String(process.env.ENABLE_COMMERCIAL_RUNTIME_SHADOW || "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1";
}
