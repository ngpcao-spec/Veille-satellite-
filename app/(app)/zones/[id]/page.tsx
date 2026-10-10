import Link from "next/link";
import { notFound } from "next/navigation";
import type { Polygon } from "geojson";
import { createClient } from "@/lib/supabase/server";
import ZoneMap from "@/components/ZoneMap";
import { TYPES_SUIVIS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: zone } = await supabase.from("zones").select("*").eq("id", id).maybeSingle();
  if (!zone) notFound();
  const { data: events } = await supabase
    .from("evenements")
    .select("id, type, description, gravite, surface_ha, created_at")
    .eq("zone_id", id)
    .eq("est_artefact", false)
    .order("created_at", { ascending: false });

  const suivis = TYPES_SUIVIS.filter((t) => zone.types_suivis.includes(t.value)).map((t) => t.label).join(", ");

  return (
    <main className="page">
      <Link href="/">← Mes zones</Link>
      <h1 style={{ margin: 0 }}>{zone.nom}</h1>
      <div className="muted">
        {zone.surface_ha} ha · sensibilité {zone.sensibilite} · {suivis}
        {zone.derniere_verif_at ? ` · dernière vérification ${new Date(zone.derniere_verif_at).toLocaleString("fr-FR")}` : " · pas encore vérifiée"}
      </div>
      <ZoneMap geom={zone.geom as Polygon} />
      <section>
        <h2>Événements détectés</h2>
        {events?.length ? (
          events.map((e) => (
            <div key={e.id} className="card" style={{ marginBottom: 8 }}>
              <strong>{e.type ?? "Changement"}</strong> · {e.gravite} · {new Date(e.created_at).toLocaleDateString("fr-FR")}
              <div>{e.description}</div>
            </div>
          ))
        ) : (
          <p className="muted">Aucun changement détecté. La référence sur 12 mois et les images arrivent aux étapes suivantes.</p>
        )}
      </section>
    </main>
  );
}
