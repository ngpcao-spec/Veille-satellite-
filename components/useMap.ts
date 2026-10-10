"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export const BASEMAP = "https://tiles.openfreemap.org/styles/liberty";

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
    m.on("load", () => {
      setMap(m);
      cb.current?.(m);
    });
    return () => m.remove();
  }, []);

  return { container, map };
}
