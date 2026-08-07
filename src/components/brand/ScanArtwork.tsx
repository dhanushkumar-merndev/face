import { cn } from "@/lib/utils";

/**
 * Decorative artwork for the landing page. Everything here mirrors the visual
 * language of the live scanner — landmark mesh, sweeping beam, tracking
 * brackets — redrawn in the warm editorial palette. All of it is aria-hidden.
 */

/** Landmark positions inside the 220x260 emblem viewBox, symmetric about x=110. */
const MESH_POINTS: [number, number][] = [
  [110, 46], // 0  hairline
  [78, 60], //  1  forehead L
  [142, 60], // 2  forehead R
  [58, 92], //  3  temple L
  [162, 92], // 4  temple R
  [74, 96], //  5  brow L outer
  [100, 88], // 6  brow L inner
  [120, 88], // 7  brow R inner
  [146, 96], // 8  brow R outer
  [86, 112], // 9  eye L
  [134, 112], // 10 eye R
  [110, 104], // 11 nose bridge
  [110, 140], // 12 nose tip
  [96, 148], // 13 nostril L
  [124, 148], // 14 nostril R
  [56, 130], // 15 cheekbone L
  [164, 130], // 16 cheekbone R
  [80, 140], // 17 cheek L
  [140, 140], // 18 cheek R
  [110, 166], // 19 philtrum
  [92, 170], // 20 mouth L
  [128, 170], // 21 mouth R
  [110, 180], // 22 lower lip
  [66, 168], // 23 jaw L
  [154, 168], // 24 jaw R
  [86, 196], // 25 jawline L
  [134, 196], // 26 jawline R
  [110, 208], // 27 chin
];

const MESH_EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 6], [0, 7], [1, 3], [2, 4], [1, 6], [2, 7], [6, 7],
  [3, 5], [4, 8], [5, 6], [7, 8], [5, 9], [6, 9], [7, 10], [8, 10],
  [9, 11], [10, 11], [6, 11], [7, 11], [11, 12],
  [3, 15], [4, 16], [15, 17], [16, 18], [9, 17], [10, 18], [17, 13], [18, 14],
  [12, 13], [12, 14], [13, 14],
  [13, 19], [14, 19], [13, 20], [14, 21], [19, 20], [19, 21], [20, 22], [21, 22],
  [15, 23], [16, 24], [17, 23], [18, 24], [17, 20], [18, 21], [23, 20], [24, 21],
  [20, 25], [21, 26], [23, 25], [24, 26], [25, 22], [26, 22], [25, 27], [26, 27],
  [22, 27],
];

/** Landmarks drawn larger — the features the reading actually keys off. */
const KEY_POINTS = new Set([0, 9, 10, 12, 19, 22, 27]);

/**
 * Hero emblem: a wireframe face inside a tracking frame, with a beam that
 * sweeps top to bottom the way the scanner's does.
 */
export function FaceMeshEmblem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 260"
      className={cn("h-44 w-auto sm:h-52", className)}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hero-mesh" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d3ab84" />
          <stop offset="100%" stopColor="#a9703e" />
        </linearGradient>
        <linearGradient id="hero-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d59a5b" stopOpacity="0" />
          <stop offset="50%" stopColor="#d59a5b" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#d59a5b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hero-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b67a42" stopOpacity="0" />
          <stop offset="50%" stopColor="#b67a42" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#b67a42" stopOpacity="0" />
        </linearGradient>
        <clipPath id="hero-face-clip">
          <ellipse cx="110" cy="126" rx="64" ry="86" />
        </clipPath>
      </defs>

      {/* Tracking frame */}
      <path
        d="M10 30V8h22M188 8h22v22M210 230v22h-22M32 252H10v-22"
        stroke="#c9a882"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Orbit ring and cardinal ticks */}
      <ellipse
        cx="110"
        cy="126"
        rx="78"
        ry="100"
        stroke="#d9bd9a"
        strokeWidth="1.2"
        strokeDasharray="6 12"
        className="animate-orbit-dash"
      />
      <path
        d="M110 18v16M110 218v16M24 126h16M180 126h16"
        stroke="#c08d55"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Face oval */}
      <ellipse cx="110" cy="126" rx="64" ry="86" stroke="url(#hero-mesh)" strokeWidth="1.6" />

      {/* Landmark mesh */}
      <g stroke="url(#hero-mesh)" strokeWidth="0.9" strokeOpacity="0.75" strokeLinecap="round">
        {MESH_EDGES.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={MESH_POINTS[a][0]}
            y1={MESH_POINTS[a][1]}
            x2={MESH_POINTS[b][0]}
            y2={MESH_POINTS[b][1]}
          />
        ))}
      </g>
      <g fill="#a9703e">
        {MESH_POINTS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={KEY_POINTS.has(i) ? 2.6 : 1.5} />
        ))}
      </g>

      {/* Sweeping beam, clipped to the face so it reads as a surface scan */}
      <g clipPath="url(#hero-face-clip)">
        <g className="animate-scan-sweep">
          <rect x="30" y="-20" width="160" height="40" fill="url(#hero-beam)" />
        </g>
      </g>
      <g className="animate-scan-sweep">
        <line x1="26" y1="0" x2="194" y2="0" stroke="url(#hero-edge)" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

/**
 * Head orientation glyph for the step cards: the same face, turned. `pose`
 * drives both the rotation and the bowed centre axis, so the three cards read
 * as one sequence.
 */
export function HeadPoseIcon({
  pose,
  className,
}: {
  pose: "front" | "left" | "right";
  className?: string;
}) {
  const dir = pose === "left" ? -1 : pose === "right" ? 1 : 0;
  const shift = dir * 3;
  // Absolute coordinates throughout: relative segments would emit "4--1.5"
  // for a negative shift, which is not a valid path.
  const axis = `M24 9 C ${24 + shift * 1.2} 16 ${24 + shift * 1.4} 25 ${24 + shift * 0.6} 34`;

  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("h-7 w-7", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform={`rotate(${dir * 12} 24 24)`}>
        <path d="M24 8c7 0 11 4.5 11 11 0 5-1.5 9.5-4.5 12.5C28.5 33.5 26.2 35 24 35s-4.5-1.5-6.5-3.5C14.5 28.5 13 24 13 19 13 12.5 17 8 24 8Z" />
        {/* Centre axis bows toward the turn */}
        <path d={axis} strokeDasharray="2 3" strokeWidth="1.2" opacity="0.75" />
        <circle
          cx={19.5 + shift * 1.3}
          cy="20"
          r={dir === -1 ? 0.9 : 1.5}
          fill="currentColor"
          stroke="none"
        />
        <circle
          cx={28.5 + shift * 1.3}
          cy="20"
          r={dir === 1 ? 0.9 : 1.5}
          fill="currentColor"
          stroke="none"
        />
        <path d={`M${21 + shift} 28.5 c 1.5 1.2 4.5 1.2 6 0`} strokeWidth="1.3" />
      </g>

      {dir === 0 ? (
        // Centred: lock-on ticks either side
        <path d="M6 20v8M42 20v8" strokeWidth="1.8" />
      ) : dir === -1 ? (
        <>
          <path d="M31 41c-4 2.5-10 2.5-14 0" strokeWidth="1.4" />
          <path d="M13 41l5-2.4v4.8Z" fill="currentColor" strokeWidth="1" />
        </>
      ) : (
        <>
          <path d="M17 41c4 2.5 10 2.5 14 0" strokeWidth="1.4" />
          <path d="M35 41l-5-2.4v4.8Z" fill="currentColor" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}

/** Viewfinder brackets framing the hero column on wide screens. */
export function ViewfinderCorners({ className }: { className?: string }) {
  const corners = [
    { d: "M1 25V1h24", cls: "left-0 top-0" },
    { d: "M1 1h24v24", cls: "right-0 top-0" },
    { d: "M25 1v24H1", cls: "right-0 bottom-0" },
    { d: "M25 25H1V1", cls: "left-0 bottom-0" },
  ];

  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden="true">
      {corners.map((corner) => (
        <svg
          key={corner.cls}
          viewBox="0 0 26 26"
          className={cn("absolute h-6 w-6 text-[#d8bc99]", corner.cls)}
          fill="none"
        >
          <path d={corner.d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ))}
    </div>
  );
}

/** Topographic contour lines — the skin-layer motif used behind the page footer. */
export function ContourField({ className }: { className?: string }) {
  const lines = Array.from({ length: 7 }, (_, i) => {
    const y = 46 + i * 38;
    const amp = (26 + i * 5) * (i % 2 === 0 ? 1 : -1);
    return `M0 ${y}C240 ${y - amp} 480 ${y + amp} 720 ${y}S1200 ${y + amp} 1440 ${y}`;
  });

  return (
    <svg
      viewBox="0 0 1440 320"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute", className)}
      fill="none"
      aria-hidden="true"
      style={{
        maskImage: "linear-gradient(to top, black, transparent)",
        WebkitMaskImage: "linear-gradient(to top, black, transparent)",
      }}
    >
      {lines.map((d, i) => (
        <path key={i} d={d} stroke="#c9a882" strokeWidth="1" strokeOpacity={0.5 - i * 0.04} />
      ))}
    </svg>
  );
}

/**
 * Circular gauge used for the confidence reading. `value` is 0-1; the label
 * inside carries the number, so the arc never has to be read on its own.
 */
export function ScoreRing({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} stroke="#f0e0cd" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke="#b67a42"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform="rotate(-90 32 32)"
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          className="fill-[#3c2718] font-mono text-[15px] font-bold"
        >
          {Math.round(clamped * 100)}
        </text>
      </svg>
      <div>
        <p className="text-sm font-semibold text-[#3c2718]">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[#8b735f]">
          How clear the captured frame was
        </p>
      </div>
    </div>
  );
}

/** Hairline rule with a scan dot in the middle, used to separate hero sections. */
export function ScanDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full items-center gap-3", className)} aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#e5d3bf]" />
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[#c08d55]" fill="none">
        <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="8" r="2.4" fill="currentColor" fillOpacity="0.85" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#e5d3bf]" />
    </div>
  );
}
