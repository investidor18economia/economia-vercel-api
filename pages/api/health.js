import { resolveBuildInfo, MIA_OBSERVABILITY_VERSION } from "../../lib/miaBuildInfo.js";
import { applyInternalSecurityHeaders } from "../../lib/miaEndpointAccessPolicy.js";
import { withMiaObservability } from "../../lib/miaObservability.js";

async function handler(req, res) {
  applyInternalSecurityHeaders(res);
  const info = resolveBuildInfo();
  return res.status(200).json({
    status: "ok",
    version: MIA_OBSERVABILITY_VERSION,
    timestamp: new Date().toISOString(),
    build: info.commit,
  });
}

export default withMiaObservability(handler, { endpoint: "/api/health" });
