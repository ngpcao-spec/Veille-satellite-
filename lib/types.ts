import type { Polygon } from "geojson";

export type Sensibilite = "basse" | "normale" | "haute";
export type EtatZone = "calme" | "changement" | "alerte";
export type TypeSuivi = "vegetation" | "eau" | "construction";

export interface Zone {
  id: string;
  nom: string;
  geom: Polygon;
  surface_ha: number | null;
  sensibilite: Sensibilite;
  types_suivis: TypeSuivi[];
  actif: boolean;
  derniere_verif_at: string | null;
  created_at: string;
  etat: EtatZone;
}

export const TYPES_SUIVIS: { value: TypeSuivi; label: string }[] = [
  { value: "vegetation", label: "Végétation" },
  { value: "eau", label: "Eau" },
  { value: "construction", label: "Construction / sol nu" },
];

export const MIN_HA = 1;
export const MAX_HA = 10_000; // 100 km²
