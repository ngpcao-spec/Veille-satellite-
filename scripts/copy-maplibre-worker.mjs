// MapLibre 6 déduit l'URL de son worker de l'URL de son propre bundle ; une fois intégré par Next.js,
// cette URL est fausse (« Worker failed to load » : plus de contours de zones). On sert donc le worker
// depuis /public et on l'indique à MapLibre avec setWorkerUrl (voir components/useMap.ts).
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
