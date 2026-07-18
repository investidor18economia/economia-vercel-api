/**
 * PATCH 12D — Fail-closed gate for dev/test/debug routes in production-like runtimes.
 */

import { NextResponse } from "next/server";

function isDevRouteEnabled(env = process.env) {
  const raw = String(env.MIA_DEV_ROUTES_ENABLED || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function isBlockedDevPath(pathname = "") {
  return (
    pathname === "/mia-test" ||
    pathname.startsWith("/api/dev/") ||
    pathname.startsWith("/api/debug/") ||
    pathname.startsWith("/api/test/") ||
    pathname === "/api/test-mia" ||
    pathname === "/api/test-economia" ||
    pathname === "/api/test-serp" ||
    pathname === "/api/env" ||
    pathname === "/api/pages/api/test-economia"
  );
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!isBlockedDevPath(pathname)) {
    return NextResponse.next();
  }

  if (!isDevRouteEnabled(process.env)) {
    return new NextResponse(
      JSON.stringify({ error: "not_found", reasonCode: "endpoint_not_found" }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/mia-test",
    "/api/dev/:path*",
    "/api/debug/:path*",
    "/api/test/:path*",
    "/api/test-mia",
    "/api/test-economia",
    "/api/test-serp",
    "/api/env",
    "/api/pages/api/test-economia",
  ],
};
