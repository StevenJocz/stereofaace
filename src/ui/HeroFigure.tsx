import { TONES, type Tone } from "./Art";

type Props = { tone?: Tone; className?: string };

/**
 * Figura de portada: retrato estilizado (auriculares y gafas con reflejo de luz) sobre un disco de color.
 * Ilustración vectorial propia; no es una fotografía ni representa a una persona real.
 */
export function HeroFigure({ tone = "acid", className }: Props) {
  const t = TONES[tone];
  const id = `hf-${tone}`;
  return (
    <svg
      className={className}
      viewBox="0 0 640 720"
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`${id}-dots`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="3.5" cy="3.5" r="1.9" fill="#050505" />
        </pattern>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.55" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <mask id={`${id}-m`}>
          <rect width="640" height="720" fill={`url(#${id}-shade)`} />
        </mask>
        <clipPath id={`${id}-lensL`}>
          <rect x="196" y="318" width="104" height="66" rx="22" />
        </clipPath>
        <clipPath id={`${id}-lensR`}>
          <rect x="340" y="318" width="104" height="66" rx="22" />
        </clipPath>
      </defs>

      <rect width="640" height="720" fill={t.bg} />

      {/* Disco de color y órbita */}
      <circle data-art="disc" cx="330" cy="330" r="270" fill={t.a} />
      <circle data-art="orbit" cx="330" cy="330" r="312" fill="none" stroke={t.a} strokeWidth="1.5" opacity="0.6" />
      <circle cx="330" cy="330" r="345" fill="none" stroke={t.a} strokeWidth="1" opacity="0.3" strokeDasharray="3 9" />

      <g data-art="figure">
        {/* Cabello */}
        <path
          d="M 190 300 C 170 150, 280 90, 340 100 C 430 100, 490 190, 452 310 C 470 250, 420 160, 330 170 C 250 175, 205 220, 190 300 Z"
          fill="#0b0b0b"
        />
        {[...Array(14)].map((_, i) => (
          <path
            key={i}
            d={`M ${200 + i * 19} ${150 + (i % 4) * 8} C ${160 + i * 22} ${60 + (i % 3) * 20}, ${210 + i * 18} ${40 + (i % 5) * 10}, ${150 + i * 26} ${20 + (i % 4) * 14}`}
            fill="none"
            stroke="#0b0b0b"
            strokeWidth="3.2"
            strokeLinecap="round"
            opacity="0.9"
          />
        ))}

        {/* Cuello y chaqueta */}
        <path d="M 270 520 L 262 620 L 400 620 L 392 520 Z" fill="#9a9a9a" />
        <path
          d="M 40 720 C 60 610, 190 590, 262 600 L 330 650 L 400 600 C 480 590, 600 610, 620 720 Z"
          fill="#cfcfcf"
        />
        <path d="M 262 600 L 330 650 L 400 600 L 380 590 L 330 625 L 282 590 Z" fill="#6e6e6e" />
        <path d="M 120 690 C 200 640, 250 650, 330 690" fill="none" stroke="#7a7a7a" strokeWidth="3" />

        {/* Rostro */}
        <ellipse cx="322" cy="360" rx="128" ry="168" fill="#d6d6d6" />
        <ellipse cx="322" cy="360" rx="128" ry="168" fill={`url(#${id}-dots)`} mask={`url(#${id}-m)`} opacity="0.85" />
        <path
          d="M 322 330 L 312 430 C 318 440, 338 440, 346 430"
          fill="none"
          stroke="#6a6a6a"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path d="M 270 486 C 300 470, 344 470, 378 486 C 360 512, 292 512, 270 486 Z" fill="#7d7d7d" />
        <path d="M 276 486 C 310 482, 342 482, 372 486" fill="none" stroke="#2a2a2a" strokeWidth="3" />

        {/* Gafas con reflejo */}
        <g>
          <rect x="196" y="318" width="104" height="66" rx="22" fill="#0a0a0a" />
          <rect x="340" y="318" width="104" height="66" rx="22" fill="#0a0a0a" />
          {[clip("lensL"), clip("lensR")].map((c, k) => (
            <g key={c} clipPath={`url(#${id}-${c})`} data-art="lens">
              <rect x={k ? 340 : 196} y="318" width="104" height="66" fill={t.bg} />
              {[...Array(6)].map((_, i) => (
                <polygon
                  key={i}
                  points={`${(k ? 340 : 196) + 8 + i * 16},384 ${(k ? 340 : 196) + 20 + i * 16},384 ${(k ? 340 : 196) + 48 + i * 10},330 ${(k ? 340 : 196) + 40 + i * 10},330`}
                  fill={t.a}
                  opacity={0.7 - i * 0.06}
                />
              ))}
              <circle cx={(k ? 340 : 196) + 52} cy="378" r="26" fill={t.a} opacity="0.55" />
            </g>
          ))}
          <rect x="196" y="318" width="104" height="66" rx="22" fill="none" stroke="#ededed" strokeWidth="9" />
          <rect x="340" y="318" width="104" height="66" rx="22" fill="none" stroke="#ededed" strokeWidth="9" />
          <path d="M 300 340 C 312 330, 328 330, 340 340" fill="none" stroke="#ededed" strokeWidth="9" />
        </g>

        {/* Auriculares */}
        <path
          d="M 160 340 C 130 150, 300 70, 400 110 C 480 140, 500 260, 484 340"
          fill="none"
          stroke="#bdbdbd"
          strokeWidth="26"
          strokeLinecap="round"
        />
        <path
          d="M 160 340 C 130 150, 300 70, 400 110 C 480 140, 500 260, 484 340"
          fill="none"
          stroke="#f2f2f2"
          strokeWidth="4"
          strokeLinecap="round"
          transform="translate(0 -9)"
          opacity="0.7"
        />
        {[
          { x: 124, k: 0 },
          { x: 456, k: 1 },
        ].map(({ x, k }) => (
          <g key={k} data-art="cup">
            <rect x={x} y="300" width="64" height="150" rx="30" fill="#d9d9d9" stroke="#8c8c8c" strokeWidth="3" />
            <rect x={x + 10} y="318" width="44" height="114" rx="20" fill="#bdbdbd" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line
                key={i}
                x1={x + 14}
                x2={x + 50}
                y1={330 + i * 16}
                y2={330 + i * 16}
                stroke="#8c8c8c"
                strokeWidth="3"
              />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

function clip(n: "lensL" | "lensR") {
  return n;
}
