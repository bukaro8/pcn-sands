import { redirect } from "next/navigation";

export function isAdministratorSession(session: { user?: { id?: string | null } } | null) {
  return session?.user?.id === "administrator";
}

export async function isAdmin() {
  const { auth } = await import("@/auth");
  return isAdministratorSession(await auth());
}

export async function requireAdmin() {
  if (!await isAdmin()) redirect("/login");
}
