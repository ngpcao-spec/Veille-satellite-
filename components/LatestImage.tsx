import type { Polygon } from "geojson";
import { copernicusConfigured, searchAcquisitions } from "@/lib/copernicus";

const FENETRE_JOURS = 30;
const NUAGES_MAX = 30;

/** Dernière image Sentinel-2 en couleurs naturelles (nuages < 30 % sur la scène). */
export default async function LatestImage({ zoneId, geom }: { zoneId: string; geom: Polygon }) {
  if (!copernicusConfigured()) {
    return <p className="muted">Images satellite indisponibles : identifiants Copernicus non configurés.</p>;
  }
  let acq;
  try {
    const to = new Date();
    const from = new Date(to.getTime() - FENETRE_JOURS * 864e5);
    [acq] = await searchAcquisitions(geom, { collection: "sentinel-2-l2a", from, to, maxCloud: NUAGES_MAX, limit: 5 });
  } catch {
    return <p className="muted">Impossible de joindre Copernicus pour le moment.</p>;
  }
  if (!acq) {
    return <p className="muted">Aucune image Sentinel-2 peu nuageuse sur les {FENETRE_JOURS} derniers jours.</p>;
  }
  const day = acq.datetime.slice(0, 10);
  return (
    <figure style={{ margin: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/zones/${zoneId}/image?date=${day}`}
        alt={`Zone vue par Sentinel-2 le ${day}`}
        style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid var(--line)" }}
      />
      <figcaption className="muted">
        Sentinel-2 · {new Date(acq.datetime).toLocaleDateString("fr-FR")}
        {acq.cloudCover !== null && ` · nuages ${Math.round(acq.cloudCover)} % (scène)`}
      </figcaption>
    </figure>
  );
}
