"use client";

import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";
import type { Polygon } from "geojson";
import { useMap } from "./useMap";

export default function ZoneMap({ geom }: { geom: Polygon }) {
  const { container, map } = useMap();
  useEffect(() => {
    if (!map) return;
    map.addSource("zone", { type: "geojson", data: { type: "Feature", properties: {}, geometry: geom } });
    map.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": "#2f9e5b", "fill-opacity": 0.2 } });
    map.addLayer({ id: "zone-line", type: "line", source: "zone", paint: { "line-color": "#2f9e5b", "line-width": 2 } });
    const b = new maplibregl.LngLatBounds();
    geom.coordinates[0].forEach(([x, y]) => b.extend([x, y]));
    map.fitBounds(b, { padding: 40, duration: 0 });
  }, [map, geom]);
  return <div className="zonemap"><div ref={container} /></div>;
}
