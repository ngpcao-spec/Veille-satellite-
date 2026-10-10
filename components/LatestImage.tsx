import { latestAcquisition } from "@/lib/copernicus-client";

/** Dernière image Sentinel-2 en couleurs naturelles (nuages < 30 % sur la scène). */
export default async function LatestImage({ zoneId }: { zoneId: string }) {
  const latest = await latestAcquisition(zoneId);
  if (latest.status === "not_configured") {
    return <p className="muted">Images satellite indisponibles : identifiants Copernicus non configurés.</p>;
  }
  if (latest.status === "error") {
    return (
      <p className="muted">
        Impossible de joindre Copernicus pour le moment.
        <br />
        <small>Détail technique : {latest.detail}</small>
      </p>
    );
  }
  const acq = latest.acquisition;
  if (!acq) {
    return <p className="muted">Aucune image Sentinel-2 peu nuageuse sur les {latest.fenetreJours} derniers jours.</p>;
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
