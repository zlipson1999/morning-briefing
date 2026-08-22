import type { BriefingMode } from "./claude";

/** Only named modes are accepted; unknown or missing values stay backward-compatible. */
export function briefingMode(value: string | null): BriefingMode {
  return value === "now" || value === "evening" ? value : "morning";
}
