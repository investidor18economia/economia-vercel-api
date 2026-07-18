import { resolveBuildInfo } from "../../lib/miaBuildInfo.js";
import { applyInternalSecurityHeaders } from "../../lib/miaEndpointAccessPolicy.js";
import { withMiaObservability } from "../../lib/miaObservability.js";

function hasMinimalConfig(env = process.env) {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      (env.SUPABASE_SERVICE_ROLE_KEY || env.API_SHARED_KEY)
  );
}

async function handler(req, res) {
  applyInternalSecurityHeaders(res);
  const ready = hasMinimalConfig();
  const info = resolveBuildInfo();

  return res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    version: info.version,
    timestamp: new Date().toISOString(),
  });
}

export default withMiaObservability(handler, {
  endpoint: "/api/ready",
});
