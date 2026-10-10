"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkLogin, COOKIE, cookieOptions, makeSession } from "@/lib/auth";

export async function signIn(form: FormData) {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!checkLogin(email, password)) {
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    redirect("/login?error=" + encodeURIComponent("Wrong email or password."));
  }
  (await cookies()).set(COOKIE, makeSession(email), cookieOptions());
  redirect("/admin");
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
