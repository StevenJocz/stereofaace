import type { ReactElement } from "react";

import type { Scene, Tone } from "@/modules/media/cover-art";

export type { Scene, Tone };

type Props = { scene: Scene; tone?: Tone; seed?: number; className?: string };

export const TONES: Record<Tone, { bg: string; a: string; b: string; c: string; d: string }> = {
  acid: { bg: "#060902", a: "#c6ff00", b: "#5f7d00", c: "#eaffb0", d: "#121a03" },
  violet: { bg: "#08050f", a: "#9b6bff", b: "#43249a", c: "#e0d2ff", d: "#150c2c" },
  mono: { bg: "#080808", a: "#f1f1f1", b: "#6a6a6a", c: "#ffffff", d: "#161616" },
};

/** PRNG determinista: mismo seed → misma escena en servidor y cliente. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 400;
const H = 500;

/**
 * Escenas generativas en SVG: estética de cartel de club (luz, siluetas, vinilo, ondas).
 * Sustituyen a la fotografía mientras no exista material propio; todo uso en el sitio va marcado DEMO.
 * Cada escena marca los elementos que reaccionan al hover con data-art="…" (ver globals.css).
 */
export function Art({ scene, tone = "acid", seed = 1, className }: Props) {
  const r = rng(seed * 7919 + 13);
  const t = TONES[tone];
  const els: ReactElement[] = [];

  if (scene === "crowd") {
    const beams = 6;
    for (let i = 0; i < beams; i++) {
      const x0 = 40 + (i / (beams - 1)) * 320;
      const x1 = x0 + (r() - 0.5) * 380;
      const w = 18 + r() * 40;
      els.push(
        <polygon
          key={`b${i}`}
          data-art="beam"
          points={`${x0 - 4},-10 ${x0 + 4},-10 ${x1 + w},${H} ${x1 - w},${H}`}
          fill={t.a}
          opacity={0.1 + r() * 0.16}
        />,
      );
    }
    els.push(<ellipse key="glow" cx={W / 2} cy={H * 0.8} rx={280} ry={130} fill={t.a} opacity={0.32} />);
    els.push(<ellipse key="glow2" cx={W / 2} cy={H * 0.86} rx={190} ry={80} fill={t.c} opacity={0.22} />);
    for (let i = 0; i < 26; i++) {
      const x = r() * W;
      const y = H * 0.7 + r() * H * 0.26;
      const s = 0.7 + (y / H) * 0.9;
      const arms = r() > 0.35;
      els.push(
        <g key={`p${i}`} data-art="person" fill="#000" stroke="#000">
          <circle cx={x} cy={y} r={14 * s} />
          <rect x={x - 22 * s} y={y + 12 * s} width={44 * s} height={140} rx={18 * s} />
          {arms && (
            <>
              <line
                x1={x - 18 * s}
                y1={y + 24 * s}
                x2={x - 34 * s}
                y2={y - 34 * s}
                strokeWidth={9 * s}
                strokeLinecap="round"
              />
              <line
                x1={x + 18 * s}
                y1={y + 24 * s}
                x2={x + 34 * s}
                y2={y - 38 * s}
                strokeWidth={9 * s}
                strokeLinecap="round"
              />
              <circle cx={x - 34 * s} cy={y - 38 * s} r={6 * s} />
              <circle cx={x + 34 * s} cy={y - 42 * s} r={6 * s} />
            </>
          )}
        </g>,
      );
    }
  } else if (scene === "vinyl") {
    const cx = 200 + (r() - 0.5) * 30;
    const cy = 270;
    els.push(<circle key="plat" cx={cx} cy={cy} r={178} fill="#0d0d0d" stroke={t.b} strokeWidth={2} />);
    for (let i = 0; i < 28; i++) {
      els.push(
        <circle
          key={`g${i}`}
          data-art="groove"
          cx={cx}
          cy={cy}
          r={62 + i * 4}
          fill="none"
          stroke={i % 5 === 0 ? t.b : "#262626"}
          strokeWidth={i % 5 === 0 ? 1.4 : 1}
        />,
      );
    }
    els.push(
      <path
        key="shine"
        d={`M ${cx - 120} ${cy - 120} A 170 170 0 0 1 ${cx + 130} ${cy - 110}`}
        fill="none"
        stroke={t.c}
        strokeWidth={3}
        opacity={0.35}
      />,
    );
    els.push(<circle key="label" cx={cx} cy={cy} r={52} fill={t.a} />);
    els.push(<circle key="label2" cx={cx} cy={cy} r={38} fill="none" stroke="#000" strokeWidth={1.2} opacity={0.5} />);
    els.push(<circle key="spin" cx={cx} cy={cy} r={5} fill={t.bg} />);
    els.push(
      <line
        key="arm"
        data-art="arm"
        x1={372}
        y1={36}
        x2={cx + 56}
        y2={cy - 46}
        stroke={t.c}
        strokeWidth={6}
        strokeLinecap="round"
      />,
    );
    els.push(
      <rect
        key="head"
        data-art="arm"
        x={cx + 38}
        y={cy - 64}
        width={34}
        height={20}
        rx={3}
        transform={`rotate(-30 ${cx + 55} ${cy - 54})`}
        fill={t.c}
      />,
    );
    els.push(<circle key="pivot" cx={372} cy={36} r={16} fill="#222" stroke={t.c} strokeWidth={2} />);
  } else if (scene === "dj") {
    for (let i = 1; i <= 16; i++) {
      els.push(
        <circle
          key={`r${i}`}
          data-art="ring"
          cx={200}
          cy={210}
          r={i * 24}
          fill="none"
          stroke={i % 4 === 0 ? t.a : t.b}
          strokeWidth={i % 4 === 0 ? 2.5 : 1}
          opacity={0.9 - i * 0.04}
        />,
      );
    }
    els.push(<ellipse key="sh" cx={200} cy={500} rx={190} ry={140} fill="#000" />);
    els.push(<rect key="neck" x={170} y={290} width={60} height={110} fill="#000" />);
    els.push(<ellipse key="head" cx={200} cy={240} rx={64} ry={80} fill="#000" />);
    els.push(<path key="band" d="M 128 250 C 128 120, 272 120, 272 250" fill="none" stroke="#000" strokeWidth={16} />);
    els.push(
      <path
        key="band2"
        d="M 128 250 C 128 120, 272 120, 272 250"
        fill="none"
        stroke={t.c}
        strokeWidth={2}
        opacity={0.5}
        transform="translate(0 -9)"
      />,
    );
    for (const x of [112, 262]) {
      els.push(
        <rect
          key={`cup${x}`}
          x={x}
          y={228}
          width={30}
          height={72}
          rx={12}
          fill="#000"
          stroke={t.c}
          strokeWidth={1.5}
          opacity={0.95}
        />,
      );
    }
    els.push(<path key="rim" d="M 262 190 C 276 230, 270 270, 250 306" fill="none" stroke={t.a} strokeWidth={3} />);
  } else if (scene === "wave") {
    const n = 44;
    const bw = W / n;
    for (let i = 0; i < n; i++) {
      const env = Math.pow(Math.sin(((i + 0.5) / n) * Math.PI), 1.4);
      const h = 14 + r() * 330 * env;
      els.push(
        <rect
          key={i}
          data-art="bar"
          x={i * bw + 1.5}
          y={H / 2 - h / 2}
          width={bw - 3}
          height={h}
          fill={i % 9 === 4 ? t.a : t.c}
          opacity={i % 9 === 4 ? 1 : 0.85}
        />,
      );
    }
    els.push(<line key="mid" x1={0} y1={H / 2} x2={W} y2={H / 2} stroke={t.a} strokeWidth={1.5} />);
  } else if (scene === "peaks") {
    for (let i = 0; i < 5; i++) {
      els.push(
        <polygon
          key={`bm${i}`}
          data-art="beam"
          points={`${80 + i * 60},300 ${70 + i * 60},-10 ${100 + i * 60 + (r() * 60 - 30)},-10`}
          fill={t.a}
          opacity={0.18}
        />,
      );
    }
    const ridge = (base: number, amp: number, fill: string, key: string, op = 1) => {
      let d = `M 0 ${H} L 0 ${base}`;
      for (let x = 0; x <= W; x += 28) d += ` L ${x} ${base - r() * amp}`;
      d += ` L ${W} ${H} Z`;
      return <path key={key} d={d} fill={fill} opacity={op} />;
    };
    els.push(ridge(300, 130, t.d, "m1"));
    els.push(ridge(350, 90, "#050505", "m2"));
    els.push(<rect key="stage" x={110} y={318} width={180} height={64} fill="#000" stroke={t.a} strokeWidth={2} />);
    els.push(<rect key="screen" x={126} y={328} width={148} height={40} fill={t.a} opacity={0.85} />);
    for (let i = 0; i < 40; i++)
      els.push(<circle key={`d${i}`} cx={r() * W} cy={400 + r() * 90} r={4 + r() * 4} fill="#000" />);
  } else if (scene === "rings") {
    const cx = 120 + r() * 160;
    const cy = 160 + r() * 180;
    for (let i = 1; i <= 22; i++) {
      els.push(
        <circle
          key={i}
          data-art="ring"
          cx={cx + i * (r() * 2 - 1)}
          cy={cy}
          r={i * 17}
          fill="none"
          stroke={i % 6 === 0 ? t.a : t.c}
          strokeWidth={i % 3 === 0 ? 2.5 : 0.9}
          opacity={0.9}
        />,
      );
    }
  } else if (scene === "halftone") {
    const cols = 17;
    const rows = 21;
    const cx = (0.3 + r() * 0.4) * W;
    const cy = (0.3 + r() * 0.4) * H;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = (x + 0.5) * (W / cols);
        const py = (y + 0.5) * (H / rows);
        const d = Math.hypot(px - cx, py - cy) / Math.hypot(W, H);
        const rad = Math.max(0.7, (1 - d * 1.7) * (W / cols) * 0.52);
        els.push(<circle key={`${x}-${y}`} cx={px} cy={py} r={rad} fill={d < 0.16 ? t.a : t.c} />);
      }
    }
  } else {
    for (let i = 0; i < 28; i++) {
      const w = 30 + r() * 160;
      const h = 12 + r() * 80;
      els.push(
        <rect
          key={i}
          x={r() * (W - w)}
          y={r() * (H - h)}
          width={w}
          height={h}
          fill={i % 7 === 0 ? t.a : i % 2 ? t.c : t.b}
          opacity={i % 2 ? 0.92 : 0.7}
        />,
      );
    }
    for (let i = 1; i < 10; i++)
      els.push(
        <line key={`l${i}`} x1={i * 40} y1={0} x2={i * 40} y2={H} stroke={t.c} strokeWidth={0.5} opacity={0.35} />,
      );
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={W} height={H} fill={t.bg} />
      {els}
    </svg>
  );
}
