import { createClient } from "@/lib/supabase/server";

export type Latest =
  | { status: "ok"; acquisition: { id: string; datetime: string; cloudCover: number | null } | null; fenetreJours: number }
  | { status: "not_configured" }
  | { status: "error"; detail: string };

async function call(body: Record<string, string>): Promise<Response | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/copernicus`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);
}

function fail(detail: string): Latest {
  console.error("copernicus latest:", detail);
  return { status: "error", detail };
}

export async function latestAcquisition(zoneId: string): Promise<Latest> {
  const res = await call({ action: "latest", zone_id: zoneId });
  if (!res) return fail("appel à la fonction impossible (session ou réseau)");
  if (res.status === 503) return { status: "not_configured" };
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
    return fail(`HTTP ${res.status} ${body?.detail ?? body?.error ?? ""}`.trim());
  }
  const json = (await res.json()) as { acquisition: { id: string; datetime: string; cloudCover: number | null } | null; fenetre_jours: number };
  return { status: "ok", acquisition: json.acquisition, fenetreJours: json.fenetre_jours };
}

export async function zoneImage(zoneId: string, date: string): Promise<Response | null> {
  return call({ action: "image", zone_id: zoneId, date });
}
