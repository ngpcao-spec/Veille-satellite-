import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Veille satellite",
    short_name: "Veille",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#0b3d2e",
    lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
