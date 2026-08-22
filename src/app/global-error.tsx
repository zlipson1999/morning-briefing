"use client";

/**
 * Last resort: an error thrown in the root layout itself, where the normal
 * error boundary has no shell left to render into. This one supplies its own
 * <html> and can't rely on globals.css having loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#08090c",
          color: "#e8ecf2",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>The briefing crashed on start-up.</h1>
        <p style={{ color: "#7c8595", fontSize: "0.875rem", maxWidth: "28rem" }}>
          The failure happened in the root layout, before the dashboard existed.
          {error.digest ? ` Digest ${error.digest}.` : ""}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: "1px solid #2a313f",
            borderRadius: "0.5rem",
            padding: "0.5rem 1rem",
            color: "#c3cad6",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
