"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import area from "@turf/area";
import type { Feature, Polygon } from "geojson";
import { createClient } from "@/lib/supabase/client";
import { MAX_HA, MIN_HA, TYPES_SUIVIS, type Sensibilite, type TypeSuivi, type Zone } from "@/lib/types";
import { useMap } from "./useMap";

const ETAT_LABEL = { calme: "Calme", changement: "Changement", alerte: "Alerte" } as const;

function bounds(polys: Polygon[]) {
  const b = new maplibregl.LngLatBounds();
  polys.forEach((p) => p.coordinates[0].forEach(([x, y]) => b.extend([x, y])));
  return b;
}

export default function ZonesApp({ zones }: { zones: Zone[] }) {
  const router = useRouter();
  const draw = useRef<MapboxDraw | null>(null);
  const { container, map } = useMap();
  const [drawing, setDrawing] = useState(false);
  const [polygon, setPolygon] = useState<Polygon | null>(null);
  const [nom, setNom] = useState("");
  const [sensibilite, setSensibilite] = useState<Sensibilite>("normale");
  const [types, setTypes] = useState<TypeSuivi[]>(["vegetation", "eau", "construction"]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ha = polygon ? area({ type: "Feature", properties: {}, geometry: polygon }) / 10_000 : 0;

  // Outil de dessin (sans contrôles par défaut : on pilote le mode nous-mêmes).
  useEffect(() => {
    if (!map) return;
    const d = new MapboxDraw({ displayControlsDefault: false });
    draw.current = d;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addControl(d as any);
    const sync = () => {
      const feats = d.getAll().features as Feature[];
      const last = feats[feats.length - 1];
      setPolygon(last?.geometry?.type === "Polygon" ? (last.geometry as Polygon) : null);
    };
    const onCreate = () => {
      // un seul polygone à la fois
      const feats = d.getAll().features;
      feats.slice(0, -1).forEach((f) => f.id && d.delete(String(f.id)));
      setDrawing(false);
      sync();
    };
    // les évènements draw.* ne sont pas dans les types de MapLibre
    const m = map as unknown as { on: (t: string, f: () => void) => void; off: (t: string, f: () => void) => void };
    m.on("draw.create", onCreate);
    m.on("draw.update", sync);
    m.on("draw.delete", sync);
    return () => {
      m.off("draw.create", onCreate);
      m.off("draw.update", sync);
      m.off("draw.delete", sync);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.removeControl(d as any);
    };
  }, [map]);

  // Zones existantes
  useEffect(() => {
    if (!map) return;
    const data = {
      type: "FeatureCollection" as const,
      features: zones.map((z) => ({
        type: "Feature" as const,
        properties: { id: z.id, nom: z.nom, etat: z.etat },
        geometry: z.geom,
      })),
    };
    const src = map.getSource("zones") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      map.addSource("zones", { type: "geojson", data });
      const color = ["match", ["get", "etat"], "alerte", "#c93a3a", "changement", "#d98a1f", "#2f9e5b"] as never;
      map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": color, "fill-opacity": 0.2 } });
      map.addLayer({ id: "zones-line", type: "line", source: "zones", paint: { "line-color": color, "line-width": 2 } });
      map.on("click", "zones-fill", (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) router.push(`/zones/${id}`);
      });
      map.on("mouseenter", "zones-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "zones-fill", () => (map.getCanvas().style.cursor = ""));
    }
  }, [map, zones, router]);

  const fitted = useRef(false);
  useEffect(() => {
    if (map && zones.length && !fitted.current) {
      fitted.current = true;
      map.fitBounds(bounds(zones.map((z) => z.geom)), { padding: 60, maxZoom: 14, duration: 0 });
    }
  }, [map, zones]);

  function startDrawing() {
    draw.current?.deleteAll();
    setPolygon(null);
    setErreur(null);
    setDrawing(true);
    draw.current?.changeMode("draw_polygon");
  }

  function cancel() {
    draw.current?.deleteAll();
    draw.current?.changeMode("simple_select");
    setPolygon(null);
    setDrawing(false);
    setErreur(null);
  }

  function toggleType(t: TypeSuivi) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!polygon) return;
    if (ha < MIN_HA || ha > MAX_HA) {
      setErreur(`La surface doit être comprise entre ${MIN_HA} ha et ${MAX_HA} ha (100 km²).`);
      return;
    }
    if (!types.length) {
      setErreur("Choisissez au moins un type de changement.");
      return;
    }
    setSaving(true);
    setErreur(null);
    const { error } = await createClient().rpc("create_zone", {
      p_nom: nom.trim(),
      p_geojson: polygon,
      p_sensibilite: sensibilite,
      p_types: types,
    });
    setSaving(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    cancel();
    setNom("");
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="layout">
      <aside className="side">
        <div className="row">
          <h1>Mes zones</h1>
          <button className="btn" onClick={signOut}>Déconnexion</button>
        </div>

        {polygon ? (
          <form className="zoneform card" onSubmit={save}>
            <strong>Nouvelle zone · {ha.toFixed(ha < 10 ? 2 : 0)} ha</strong>
            <label>
              Nom
              <input type="text" required maxLength={120} value={nom} onChange={(e) => setNom(e.target.value)} />
            </label>
            <label>
              Sensibilité
              <select value={sensibilite} onChange={(e) => setSensibilite(e.target.value as Sensibilite)}>
                <option value="basse">Basse (moins d'alertes)</option>
                <option value="normale">Normale</option>
                <option value="haute">Haute (plus d'alertes)</option>
              </select>
            </label>
            <div className="checks">
              Changements à surveiller
              {TYPES_SUIVIS.map((t) => (
                <label key={t.value}>
                  <input type="checkbox" checked={types.includes(t.value)} onChange={() => toggleType(t.value)} />
                  {t.label}
                </label>
              ))}
            </div>
            {erreur && <div className="error">{erreur}</div>}
            <div className="row">
              <button type="button" className="btn" onClick={cancel}>Annuler</button>
              <button className="btn primary" disabled={saving}>{saving ? "Création…" : "Créer la zone"}</button>
            </div>
          </form>
        ) : drawing ? (
          <div className="card">
            Cliquez sur la carte pour placer les sommets ; double-clic pour terminer.
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={cancel}>Annuler</button>
            </div>
          </div>
        ) : (
          <button className="btn primary" onClick={startDrawing} disabled={!map}>+ Dessiner une zone</button>
        )}

        {zones.length === 0 && !polygon && !drawing && (
          <p className="muted">Aucune zone pour l'instant. Dessinez un polygone de 1 ha à 100 km² pour commencer la veille.</p>
        )}
        {zones.map((z) => (
          <Link key={z.id} href={`/zones/${z.id}`} className="card">
            <div><span className={`dot ${z.etat}`} />{z.nom}</div>
            <div className="meta">
              {ETAT_LABEL[z.etat]} · {z.surface_ha ?? "—"} ha{z.actif ? "" : " · en pause"}
            </div>
          </Link>
        ))}
      </aside>
      <div className="mapwrap"><div ref={container} /></div>
    </div>
  );
}
