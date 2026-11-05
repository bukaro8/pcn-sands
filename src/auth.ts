import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { verifyAdminCredentials } from "@/lib/auth-security";

export { sessionMaxAgeSeconds } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Credentials({
    name: "Administrator",
    credentials: { username: { label: "Username", type: "text" }, password: { label: "Password", type: "password" } },
    authorize: verifyAdminCredentials,
  })],
});
