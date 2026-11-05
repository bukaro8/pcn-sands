import { AuthError, CredentialsSignin } from "next-auth";

export function loginErrorMessage(error: unknown) {
  if (error instanceof CredentialsSignin) return "Invalid username or password.";
  if (error instanceof AuthError) {
    console.error(`Administrator login service error: ${error.type}`);
    return "Sign-in is temporarily unavailable. Please try again later.";
  }
  return null;
}
