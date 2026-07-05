// Auth gate for every page and API route (spec §9.1). Next.js 16 renamed the
// `middleware` convention to `proxy`; it defaults to the Node.js runtime.
//
// One gate covers the UI AND every expensive provider route — without a valid
// cookie nobody can trigger STT/LLM/TTS calls on our keys.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { authOutcome } from "@/lib/proxyAuth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(AUTH_COOKIE)?.value ?? "";
  const secret = process.env.AUTH_COOKIE_SECRET ?? "";
  const authorized = await verifyAuthToken(token, secret);

  const outcome = authOutcome(pathname, authorized);

  switch (outcome.kind) {
    case "pass":
      return NextResponse.next();
    case "unauthorized":
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    case "redirect": {
      const url = request.nextUrl.clone();
      url.pathname = outcome.location;
      return NextResponse.redirect(url);
    }
  }
}

export const config = {
  // Run on everything except the login surfaces and static assets. Note: the
  // proxy still guards /api/* (except /api/login) — that is the cost safety net.
  matcher: [
    "/((?!login|api/login|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)",
  ],
};
