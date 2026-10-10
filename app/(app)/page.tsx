import { createClient } from "@/lib/supabase/server";
import ZonesApp from "@/components/ZonesApp";
import type { EtatZone, Zone } from "@/lib/types";

export const dynamic = "force-dynamic";

const FENETRE_ETAT_JOURS = 14;

export default async function Home() {
  const supabase = await createClient();
  const { data: zones } = await supabase
    .from("zones")
    .select("id, nom, geom, surface_ha, sensibilite, types_suivis, actif, derniere_verif_at, created_at")
    .order("created_at", { ascending: false });

  const depuis = new Date(Date.now() - FENETRE_ETAT_JOURS * 864e5).toISOString();
  const { data: events } = await supabase
    .from("evenements")
    .select("zone_id, gravite, est_artefact, retour_utilisateur")
    .gte("created_at", depuis);

  const etat = new Map<string, EtatZone>();
  for (const ev of events ?? []) {
    if (ev.est_artefact || ev.retour_utilisateur === "fausse_alerte") continue;
    const e: EtatZone = ev.gravite === "alerte" ? "alerte" : "changement";
    if (etat.get(ev.zone_id) !== "alerte") etat.set(ev.zone_id, e);
  }

  const list = (zones ?? []).map((z) => ({ ...z, etat: etat.get(z.id) ?? "calme" })) as unknown as Zone[];
  return <ZonesApp zones={list} />;
}
