import { test } from "node:test";
import assert from "node:assert/strict";
import { getToken, resetTokenCache, searchAcquisitions, trueColorImage } from "../supabase/functions/_shared/copernicus.ts";
import { cleanPolygon, imageSize, polygonBBox, type Polygon } from "../supabase/functions/_shared/geo.ts";

const poly: Polygon = {
  type: "Polygon",
  coordinates: [[[2, 48], [2.02, 48], [2.02, 48.01], [2, 48.01], [2, 48]]],
};

const creds = { clientId: "id", clientSecret: "secret" };

function mockFetch(routes: Record<string, (init: RequestInit) => Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error("route inattendue " + url);
    return routes[key](init);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
const tokenRoute = () => json({ access_token: "tok", expires_in: 600 });

test("imageSize respecte les proportions et le côté max", () => {
  const { width, height } = imageSize(polygonBBox(poly));
  assert.equal(Math.max(width, height), 512);
  assert.ok(width > height); // 0.02° de long à 48°N (~1,5 km) vs 0.01° de haut (~1,1 km)
});

test("le jeton est mis en cache", async () => {
  resetTokenCache();
  const { f, calls } = mockFetch({ "openid-connect/token": tokenRoute });
  assert.equal(await getToken(creds, f), "tok");
  assert.equal(await getToken(creds, f), "tok");
  assert.equal(calls.length, 1);
});

test("searchAcquisitions filtre les nuages, trie par date décroissante", async () => {
  resetTokenCache();
  const { f, calls } = mockFetch({
    "openid-connect/token": tokenRoute,
    "catalog/1.0.0/search": () =>
      json({
        features: [
          { id: "a", properties: { datetime: "2026-10-01T10:00:00Z", "eo:cloud_cover": 12.4 } },
          { id: "b", properties: { datetime: "2026-10-06T10:00:00Z", "eo:cloud_cover": 3 } },
        ],
      }),
  });
  const res = await searchAcquisitions(
    creds,
    poly,
    { collection: "sentinel-2-l2a", from: new Date("2026-09-10"), to: new Date("2026-10-10"), maxCloud: 30 },
    f,
  );
  assert.deepEqual(res.map((r) => r.id), ["b", "a"]);
  const sent = JSON.parse(String(calls[1].init.body));
  assert.equal(sent.filter, "eo:cloud_cover < 30");
  assert.match(sent.datetime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal((calls[1].init.headers as Record<string, string>).Authorization, "Bearer tok");
});

test("trueColorImage envoie le polygone et la journée, renvoie le PNG", async () => {
  resetTokenCache();
  const { f, calls } = mockFetch({
    "openid-connect/token": tokenRoute,
    "/api/v1/process": () => new Response(new Uint8Array([137, 80, 78, 71])),
  });
  const png = await trueColorImage(creds, poly, "2026-10-06", f);
  assert.equal(png.byteLength, 4);
  const sent = JSON.parse(String(calls[1].init.body));
  assert.equal(sent.input.data[0].dataFilter.timeRange.from, "2026-10-06T00:00:00Z");
  assert.deepEqual(sent.input.bounds.geometry, poly);
});

test("une erreur Catalog inclut le message de Copernicus", async () => {
  resetTokenCache();
  const { f } = mockFetch({
    "openid-connect/token": tokenRoute,
    "catalog/1.0.0/search": () => new Response('{"message":"Invalid filter"}', { status: 400 }),
  });
  await assert.rejects(
    searchAcquisitions(creds, poly, { collection: "sentinel-2-l2a", from: new Date(), to: new Date() }, f),
    /Catalog API : 400 — \{"message":"Invalid filter"\}/,
  );
});

test("identifiants absents : erreur explicite sans appel réseau", async () => {
  resetTokenCache();
  const { f, calls } = mockFetch({});
  await assert.rejects(getToken({ clientId: "", clientSecret: "" }, f), /non configurés/);
  assert.equal(calls.length, 0);
});

test("erreur d'authentification explicite", async () => {
  resetTokenCache();
  const { f } = mockFetch({ "openid-connect/token": () => new Response("no", { status: 401 }) });
  await assert.rejects(getToken(creds, f), /refusée \(401\)/);
});

const withCrs = {
  ...poly,
  crs: { type: "name", properties: { name: "EPSG:4326" } },
} as unknown as Polygon;

test("cleanPolygon retire le membre crs ajouté par PostgREST", () => {
  const clean = cleanPolygon(withCrs);
  assert.deepEqual(Object.keys(clean).sort(), ["coordinates", "type"]);
  assert.deepEqual(clean.coordinates, poly.coordinates);
});

test("Catalog et Process n'envoient jamais de crs dans la géométrie", async () => {
  resetTokenCache();
  const { f, calls } = mockFetch({
    "openid-connect/token": tokenRoute,
    "catalog/1.0.0/search": () => json({ features: [] }),
    "/api/v1/process": () => new Response(new Uint8Array([1])),
  });
  await searchAcquisitions(creds, withCrs, { collection: "sentinel-2-l2a", from: new Date(), to: new Date() }, f);
  await trueColorImage(creds, withCrs, "2026-10-06", f);
  const catalog = JSON.parse(String(calls[1].init.body));
  const process_ = JSON.parse(String(calls[2].init.body));
  assert.equal("crs" in catalog.intersects, false);
  assert.equal("crs" in process_.input.bounds.geometry, false);
});
