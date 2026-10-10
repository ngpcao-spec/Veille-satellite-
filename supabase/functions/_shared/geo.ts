// Code partagé Deno (Edge Functions) / Node (tests) : pas d'API propre à l'un ou l'autre.
export interface Polygon {
  type: "Polygon";
  coordinates: number[][][];
}

/**
 * Contour GeoJSON « nu » (type + coordonnées). PostgREST ajoute un membre `crs` aux géométries PostGIS,
 * que Copernicus refuse (« Field 'intersects.crs' is not supported »).
 */
export function cleanPolygon(p: Polygon): Polygon {
  return { type: "Polygon", coordinates: p.coordinates };
}

export type BBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

export function polygonBBox(p: Polygon): BBox {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of p.coordinates[0]) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

/** Taille (px) d'une image couvrant la bbox, côté le plus long = maxSide, proportions respectées. */
export function imageSize(bbox: BBox, maxSide = 512): { width: number; height: number } {
  const [minX, minY, maxX, maxY] = bbox;
  const midLat = ((minY + maxY) / 2) * (Math.PI / 180);
  const dx = Math.max((maxX - minX) * Math.cos(midLat), 1e-9);
  const dy = Math.max(maxY - minY, 1e-9);
  const k = maxSide / Math.max(dx, dy);
  return {
    width: Math.max(16, Math.round(dx * k)),
    height: Math.max(16, Math.round(dy * k)),
  };
}
