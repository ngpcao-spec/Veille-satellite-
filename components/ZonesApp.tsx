"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import area from "@turf/area";
import kinks from "@turf/kinks";
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
  const { container, map } = useMap();
  const [drawing, setDrawing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [points, setPoints] = useState<[number, number][]>([]);
  const drawingRef = useRef(false);
  drawingRef.current = drawing;
  const [nom, setNom] = useState("");
  const [sensibilite, setSensibilite] = useState<Sensibilite>("normale");
  const [types, setTypes] = useState<TypeSuivi[]>(["vegetation", "eau", "construction"]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Contour fermé une fois le dessin terminé
  const polygon = useMemo<Polygon | null>(
    () => (finished && points.length >= 3 ? { type: "Polygon", coordinates: [[...points, points[0]]] } : null),
    [finished, points],
  );
  const ha =
    points.length >= 3
      ? area({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...points, points[0]]] } }) / 10_000
      : 0;

  // Brouillon de dessin : indépendant du chargement des tuiles (pas d'outil externe)
  useEffect(() => {
    if (!map) return;
    map.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "draft-fill", type: "fill", source: "draft", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2f9e5b", "fill-opacity": 0.25 } });
    map.addLayer({ id: "draft-line", type: "line", source: "draft", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#0b3d2e", "line-width": 3 } });
    map.addLayer({ id: "draft-points", type: "circle", source: "draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#fff", "circle-stroke-color": "#0b3d2e", "circle-stroke-width": 3 } });
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!drawingRef.current) return;
      setPoints((p) => [...p, [e.lngLat.lng, e.lngLat.lat]]);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map]);

  useEffect(() => {
    const src = map?.getSource("draft") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const features: Feature[] = [];
    if (points.length >= 3) {
      features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...points, points[0]]] } });
    }
    if (points.length >= 2) {
      const line = finished || points.length >= 3 ? [...points, points[0]] : points;
      features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } });
    }
    points.forEach((c) => features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } }));
    src.setData({ type: "FeatureCollection", features });
  }, [map, points, finished]);

  useEffect(() => {
    if (map) map.getCanvas().style.cursor = drawing ? "crosshair" : "";
  }, [map, drawing]);

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
      map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": color, "fill-opacity": 0.2 } }, "draft-fill");
      map.addLayer({ id: "zones-line", type: "line", source: "zones", paint: { "line-color": color, "line-width": 2 } }, "draft-fill");
      map.on("click", "zones-fill", (e: maplibregl.MapLayerMouseEvent) => {
        if (drawingRef.current) return;
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
    setPoints([]);
    setFinished(false);
    setErreur(null);
    setDrawing(true);
  }

  function undoPoint() {
    setPoints((p) => p.slice(0, -1));
  }

  function finishDrawing() {
    if (points.length < 3) return;
    const ring: Polygon = { type: "Polygon", coordinates: [[...points, points[0]]] };
    if (kinks({ type: "Feature", properties: {}, geometry: ring }).features.length > 0) {
      setErreur("Le contour se croise : retirez le dernier point ou recommencez.");
      return;
    }
    setErreur(null);
    setDrawing(false);
    setFinished(true);
  }

  function cancel() {
    setPoints([]);
    setDrawing(false);
    setFinished(false);
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
            Touchez la carte pour placer chaque sommet de la zone ({points.length} point{points.length > 1 ? "s" : ""}
            {points.length >= 3 ? ` · ${ha.toFixed(ha < 10 ? 2 : 0)} ha` : ""}). Il en faut au moins 3.
            {erreur && <div className="error">{erreur}</div>}
            <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={cancel}>Annuler</button>
              <button className="btn" onClick={undoPoint} disabled={points.length === 0}>Retirer le dernier</button>
              <button className="btn primary" onClick={finishDrawing} disabled={points.length < 3}>Terminer</button>
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
