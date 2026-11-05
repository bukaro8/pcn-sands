"use server";

import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { loginErrorMessage } from "@/lib/login-errors";

export async function login(_: { error?: string }, formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");
  const safeCallbackUrl = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
  try {
    await signIn("credentials", { username, password, redirect: false });
  } catch (error) {
    const message = loginErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
  redirect(safeCallbackUrl);
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
