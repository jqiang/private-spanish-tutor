// Password → signed cookie (spec §9.1). Timing-safe compare, plus a small delay
// on failure as basic brute-force friction.

import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  COOKIE_MAX_AGE_S,
  signAuthToken,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

const FAILURE_DELAY_MS = 500;

async function failureDelay() {
  // Skip the delay under test so the suite stays fast.
  if (process.env.NODE_ENV === "test") return;
  await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
}

export async function POST(req: Request) {
  const password = process.env.AUTH_PASSWORD ?? "";
  const secret = process.env.AUTH_COOKIE_SECRET ?? "";
  if (!password || !secret) {
    return NextResponse.json(
      { error: "Auth is not configured (AUTH_PASSWORD / AUTH_COOKIE_SECRET)." },
      { status: 500 },
    );
  }

  let body: { password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // fall through — empty password fails below
  }
  const input = typeof body.password === "string" ? body.password : "";

  if (!verifyPassword(input, password)) {
    await failureDelay();
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = await signAuthToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return res;
}
