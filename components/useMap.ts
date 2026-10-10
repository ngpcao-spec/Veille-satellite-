"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export const BASEMAP = "https://tiles.openfreemap.org/styles/liberty";

// Fond de secours (tuiles raster OpenStreetMap) si le style principal ne se charge pas.
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/**
 * La carte est exposée dès que son style est chargé (« style.load »), sans attendre toutes les tuiles
 * (l'évènement « load » peut tarder ou ne jamais venir si un serveur de tuiles est lent).
 */
export function useMap(onReady?: (map: maplibregl.Map) => void) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const cb = useRef(onReady);
  cb.current = onReady;

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: BASEMAP,
      center: [2.35, 46.6],
      zoom: 5,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    let ready = false;
    let fellBack = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      clearTimeout(timer);
      setMap(m);
      cb.current?.(m);
    };
    const fallback = () => {
      if (ready || fellBack) return;
      fellBack = true;
      m.setStyle(FALLBACK_STYLE);
    };
    // Avant « ready », une erreur ne peut venir que du chargement du style.
    const timer = setTimeout(fallback, 8000);
    m.on("style.load", markReady);
    m.on("error", fallback);

    return () => {
      clearTimeout(timer);
      m.remove();
    };
  }, []);

  return { container, map };
}
