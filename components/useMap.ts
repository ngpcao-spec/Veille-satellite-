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
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

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
    m.once("style.load", () => {
      setMap(m);
      cb.current?.(m);
    });
    return () => m.remove();
  }, []);

  return { container, map };
}
