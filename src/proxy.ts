import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

const PUBLIC_PATHS = new Set(["/login", "/api/health", "/manifest.webmanifest", "/sw.js"]);

const { auth } = NextAuth(authConfig);

export const proxy = auth((request) => {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/icons/") || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/jobs/")) return NextResponse.next();
  if (request.auth?.user?.id === "administrator") return NextResponse.next();
  if (pathname.startsWith("/api/")) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const loginUrl = new URL("/login", request.nextUrl.origin);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
});

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
