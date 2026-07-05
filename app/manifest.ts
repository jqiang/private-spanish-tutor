import type { MetadataRoute } from "next";

// PWA manifest (spec §9.3 step 9). Served at /manifest.webmanifest — enables
// Add to Home Screen for a standalone, app-like feel on phones.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spanish Tutor",
    short_name: "Spanish",
    description: "Practice conversational Latin American Spanish with a teacher.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#1e293b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
