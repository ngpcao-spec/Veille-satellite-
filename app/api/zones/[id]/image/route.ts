import { zoneImage } from "@/lib/copernicus-client";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const day = new URL(request.url).searchParams.get("date") ?? "";
  if (!DAY.test(day)) return new Response("date invalide", { status: 400 });

  // L'Edge Function relit la zone avec le jeton de l'utilisateur : la RLS fait office de contrôle d'accès.
  const res = await zoneImage(id, day);
  if (!res) return new Response("non connecté", { status: 401 });
  if (res.status === 404) return new Response("introuvable", { status: 404 });
  if (!res.ok) return new Response("image indisponible", { status: res.status === 429 ? 429 : 502 });

  return new Response(await res.arrayBuffer(), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400, immutable" },
  });
}
