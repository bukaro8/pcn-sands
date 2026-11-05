import type { NextAuthConfig } from "next-auth";

const secure = process.env.NODE_ENV === "production";
export const sessionMaxAgeSeconds = 8 * 60 * 60;

/** Lightweight configuration safe for Next.js Proxy. Credentials stay in auth.ts. */
export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: sessionMaxAgeSeconds, updateAge: 60 * 60 },
  useSecureCookies: secure,
  cookies: {
    sessionToken: {
      name: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure },
    },
  },
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
