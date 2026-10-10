"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function signIn() {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }
  return (
    <main className="center">
      <h1>Veille satellite</h1>
      <p>Dessinez une zone : on la surveille avec Sentinel et on vous alerte en cas de changement.</p>
      <button className="btn primary" onClick={signIn}>Continuer avec Google</button>
    </main>
  );
}
