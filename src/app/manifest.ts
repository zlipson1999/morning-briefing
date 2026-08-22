import type { MetadataRoute } from "next";
import { ASSISTANT_NAME, ASSISTANT_TAGLINE } from "@/lib/config";

/**
 * Installable on a phone home screen, which is where a morning briefing is
 * actually read. Standalone display drops the browser chrome so the one-screen
 * layout gets the whole screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${ASSISTANT_NAME} — ${ASSISTANT_TAGLINE}`,
    short_name: ASSISTANT_NAME,
    description: "Schedule, inbox, tasks, news, weather and portfolio for the day ahead.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#08090c",
    theme_color: "#08090c",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" }],
  };
}
