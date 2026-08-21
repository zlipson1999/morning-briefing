"use client";

/**
 * Arc reactor. Geometry is generated rather than hand-authored so the ring
 * counts and coil shapes stay adjustable, and so the file stays readable.
 *
 * Everything animates in CSS (see globals.css) — no JS timers driving frames.
 */

const TICKS = 60;
const COILS = 10;

/** One trapezoidal copper coil, pointing inward, centred on `angle`. */
function coilPath(angle: number): string {
  const spread = 360 / COILS / 2 - 2.2;
  const outer = 62;
  const inner = 38;
  const point = (radius: number, degrees: number) => {
    const rad = ((degrees - 90) * Math.PI) / 180;
    return [100 + radius * Math.cos(rad), 100 + radius * Math.sin(rad)];
  };
  const [ax, ay] = point(outer, angle - spread);
  const [bx, by] = point(outer, angle + spread);
  const [cx, cy] = point(inner, angle + spread * 0.62);
  const [dx, dy] = point(inner, angle - spread * 0.62);
  return `M${ax.toFixed(2)} ${ay.toFixed(2)} A${outer} ${outer} 0 0 1 ${bx.toFixed(2)} ${by.toFixed(2)} L${cx.toFixed(2)} ${cy.toFixed(2)} A${inner} ${inner} 0 0 0 ${dx.toFixed(2)} ${dy.toFixed(2)} Z`;
}

export default function ArcReactor({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Arc reactor powering up">
      <defs>
        <radialGradient id="ar-core">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="42%" stopColor="#d8f6ff" />
          <stop offset="72%" stopColor="#5cc8de" />
          <stop offset="100%" stopColor="#1d6a80" />
        </radialGradient>
        <radialGradient id="ar-halo">
          <stop offset="0%" stopColor="#5cc8de" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#5cc8de" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#5cc8de" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ar-coil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8ee6f7" />
          <stop offset="100%" stopColor="#2b7f95" />
        </linearGradient>
        <filter id="ar-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="100" cy="100" r="96" fill="url(#ar-halo)" className="ar-halo" />

      {/* Outer housing */}
      <circle cx="100" cy="100" r="88" fill="none" stroke="#223040" strokeWidth="7" />
      <circle cx="100" cy="100" r="88" fill="none" stroke="#3c5266" strokeWidth="1" />

      {/* Tick ring — counter-rotates against the coils */}
      <g className="ar-ticks">
        {Array.from({ length: TICKS }, (_, i) => {
          const major = i % 5 === 0;
          return (
            <line
              key={i}
              x1="100"
              y1={major ? 12 : 15}
              x2="100"
              y2="21"
              stroke={major ? "#7fd6e8" : "#3c5266"}
              strokeWidth={major ? 1.6 : 1}
              strokeLinecap="round"
              transform={`rotate(${(360 / TICKS) * i} 100 100)`}
            />
          );
        })}
      </g>

      <circle cx="100" cy="100" r="70" fill="none" stroke="#1b2735" strokeWidth="10" />

      {/* Copper coils */}
      <g className="ar-coils" filter="url(#ar-glow)">
        {Array.from({ length: COILS }, (_, i) => (
          <path
            key={i}
            d={coilPath((360 / COILS) * i)}
            fill="url(#ar-coil)"
            stroke="#bff0ff"
            strokeWidth="0.7"
            opacity="0.92"
            style={{ animationDelay: `${i * 90}ms` }}
            className="ar-coil"
          />
        ))}
      </g>

      {/* Core */}
      <circle cx="100" cy="100" r="34" fill="#0a1219" stroke="#2b4354" strokeWidth="2" />
      <circle cx="100" cy="100" r="26" fill="url(#ar-core)" filter="url(#ar-glow)" className="ar-core" />
      <circle cx="100" cy="100" r="26" fill="none" stroke="#eafcff" strokeWidth="0.8" opacity="0.85" />

      {/* Sweep line */}
      <g className="ar-sweep">
        <line x1="100" y1="100" x2="100" y2="20" stroke="#8ee6f7" strokeWidth="1" opacity="0.35" />
      </g>
    </svg>
  );
}
