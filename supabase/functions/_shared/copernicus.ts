import { imageSize, polygonBBox, type Polygon } from "./geo.ts";

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const CATALOG_URL = "https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

export type Collection = "sentinel-2-l2a" | "sentinel-1-grd";

export interface Acquisition {
  id: string;
  datetime: string;
  cloudCover: number | null; // null pour le radar
}

export class CopernicusError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

type Fetch = typeof fetch;

export interface Credentials {
  clientId: string;
  clientSecret: string;
}

// Le jeton expire vite : on le garde en mémoire du process jusqu'à ~30 s avant l'expiration.
let cached: { token: string; expiresAt: number } | null = null;

export async function getToken(creds: Credentials, fetchImpl: Fetch = fetch): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const id = creds.clientId;
  const secret = creds.clientSecret;
  if (!id || !secret) throw new CopernicusError("Identifiants Copernicus non configurés");
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  if (!res.ok) throw new CopernicusError(`Authentification Copernicus refusée (${res.status})`, res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 30) * 1000 };
  return json.access_token;
}

export function resetTokenCache() {
  cached = null;
}

/** Catalog API : acquisitions récentes couvrant la zone, de la plus récente à la plus ancienne. */
export async function searchAcquisitions(
  creds: Credentials,
  geom: Polygon,
  opts: { collection: Collection; from: Date; to: Date; maxCloud?: number; limit?: number },
  fetchImpl: Fetch = fetch,
): Promise<Acquisition[]> {
  const token = await getToken(creds, fetchImpl);
  const optical = opts.collection === "sentinel-2-l2a";
  const body: Record<string, unknown> = {
    collections: [opts.collection],
    datetime: `${opts.from.toISOString()}/${opts.to.toISOString()}`,
    intersects: geom,
    limit: opts.limit ?? 20,
    fields: { include: ["id", "properties.datetime", ...(optical ? ["properties.eo:cloud_cover"] : [])] },
  };
  if (optical && opts.maxCloud !== undefined) {
    body["filter-lang"] = "cql2-text";
    body.filter = `eo:cloud_cover < ${Number(opts.maxCloud)}`;
  }
  const res = await fetchImpl(CATALOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new CopernicusError(`Catalog API : ${res.status}`, res.status);
  const json = (await res.json()) as {
    features?: { id: string; properties: { datetime: string; "eo:cloud_cover"?: number } }[];
  };
  return (json.features ?? [])
    .map((f) => ({
      id: f.id,
      datetime: f.properties.datetime,
      cloudCover: f.properties["eo:cloud_cover"] ?? null,
    }))
    .sort((a, b) => b.datetime.localeCompare(a.datetime));
}

const TRUE_COLOR = `//VERSION=3
function setup() {
  return { input: ["B04", "B03", "B02", "dataMask"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  const g = 2.5;
  return [g * s.B04, g * s.B03, g * s.B02, s.dataMask];
}`;

/** Process API : PNG en couleurs naturelles découpé sur le polygone, pour la journée donnée (YYYY-MM-DD). */
export async function trueColorImage(
  creds: Credentials,
  geom: Polygon,
  day: string,
  fetchImpl: Fetch = fetch,
): Promise<ArrayBuffer> {
  const token = await getToken(creds, fetchImpl);
  const { width, height } = imageSize(polygonBBox(geom));
  const res = await fetchImpl(PROCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "image/png", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      input: {
        bounds: { geometry: geom, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: { from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z` },
              mosaickingOrder: "leastCC",
            },
          },
        ],
      },
      output: { width, height, responses: [{ identifier: "default", format: { type: "image/png" } }] },
      evalscript: TRUE_COLOR,
    }),
  });
  if (!res.ok) throw new CopernicusError(`Process API : ${res.status}`, res.status);
  return res.arrayBuffer();
}
