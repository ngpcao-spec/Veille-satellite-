import type { Polygon } from "geojson";
import { createClient } from "@/lib/supabase/server";
import { CopernicusError, trueColorImage } from "@/lib/copernicus";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const day = new URL(request.url).searchParams.get("date") ?? "";
  if (!DAY.test(day)) return new Response("date invalide", { status: 400 });

  // RLS : seule une zone appartenant à l'utilisateur connecté est visible.
  const supabase = await createClient();
  const { data: zone } = await supabase.from("zones").select("geom").eq("id", id).maybeSingle();
  if (!zone) return new Response("introuvable", { status: 404 });

  try {
    const png = await trueColorImage(zone.geom as Polygon, day);
    return new Response(png, {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400, immutable" },
    });
  } catch (e) {
    const status = e instanceof CopernicusError && e.status === 429 ? 429 : 502;
    return new Response("image indisponible", { status });
  }
}
