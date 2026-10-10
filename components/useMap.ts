"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Fond raster OpenStreetMap : léger et sans dépendance à un serveur de tuiles vectorielles.
const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Fond de secours si les tuiles OpenStreetMap sont refusées ou injoignables (limitation, blocage réseau…).
const FALLBACK_TILES = ["a", "b", "c", "d"].map(
  (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`,
);

/** La carte est exposée dès que son style est chargé (« style.load »), sans attendre les tuiles. */
export function useMap(onReady?: (map: maplibregl.Map) => void) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const cb = useRef(onReady);
  cb.current = onReady;

  useEffect(() => {
    if (!container.current) return;
    // Worker servi par le site (copié dans /public avant le build) : voir scripts/copy-maplibre-worker.mjs
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const m = new maplibregl.Map({
      container: container.current,
      style: BASE_STYLE,
      center: [2.35, 46.6],
      zoom: 5,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    let tileErrors = 0;
    let switched = false;
    m.on("error", (e) => {
      const { sourceId } = e as unknown as { sourceId?: string };
      if (sourceId !== "osm" || switched) return;
      tileErrors += 1;
      if (tileErrors < 2) return;
      switched = true;
      console.warn("Tuiles OpenStreetMap indisponibles : bascule sur le fond de secours");
      (m.getSource("osm") as maplibregl.RasterTileSource | undefined)?.setTiles(FALLBACK_TILES);
    });
    m.once("style.load", () => {
      setMap(m);
      cb.current?.(m);
    });
    return () => m.remove();
  }, []);

  return { container, map };
}
