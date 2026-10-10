// Edge Function « copernicus » : seul endroit qui connaît le secret Copernicus.
// Appelée par l'appli Next.js avec le jeton de session de l'utilisateur (verify_jwt activé) ;
// la zone est relue avec ce même jeton, donc la RLS garantit qu'elle appartient à l'appelant.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CopernicusError, searchAcquisitions, trueColorImage } from "../_shared/copernicus.ts";
import type { Polygon } from "../_shared/geo.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FENETRE_JOURS = 30;
const NUAGES_MAX = 30;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const creds = {
    clientId: Deno.env.get("COPERNICUS_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("COPERNICUS_CLIENT_SECRET") ?? "",
  };
  if (!creds.clientId || !creds.clientSecret) return json({ error: "not_configured" }, 503);

  let body: { action?: string; zone_id?: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!body.zone_id || !UUID.test(body.zone_id)) return json({ error: "bad_request" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: zone } = await supabase.from("zones").select("geom").eq("id", body.zone_id).maybeSingle();
  if (!zone) return json({ error: "not_found" }, 404);
  const geom = zone.geom as Polygon;

  try {
    if (body.action === "latest") {
      const to = new Date();
      const from = new Date(to.getTime() - FENETRE_JOURS * 864e5);
      const [acq] = await searchAcquisitions(creds, geom, {
        collection: "sentinel-2-l2a",
        from,
        to,
        maxCloud: NUAGES_MAX,
        limit: 5,
      });
      return json({ acquisition: acq ?? null, fenetre_jours: FENETRE_JOURS });
    }
    if (body.action === "image") {
      if (!body.date || !DAY.test(body.date)) return json({ error: "bad_request" }, 400);
      const png = await trueColorImage(creds, geom, body.date);
      return new Response(png, { headers: { "Content-Type": "image/png" } });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    const status = e instanceof CopernicusError && e.status === 429 ? 429 : 502;
    return json({ error: "copernicus_unavailable" }, status);
  }
});
