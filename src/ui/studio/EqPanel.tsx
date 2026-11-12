"use client";

import { EQ_PRESETS, FLAT_EQ, type EqPresetKey, type EqSettings } from "./engine/eq";

const BANDS: { key: keyof EqSettings; label: string }[] = [
  { key: "low", label: "Graves" },
  { key: "mid", label: "Medios" },
  { key: "high", label: "Agudos" },
];

function Channel({ title, value, onChange }: { title: string; value: EqSettings; onChange: (e: EqSettings) => void }) {
  return (
    <div>
      <p className="display-up text-[1.1rem]">{title}</p>
      {BANDS.map((b) => (
        <label key={b.key} className="mono muted mt-2 flex items-center gap-2">
          <span className="w-16 shrink-0">{b.label}</span>
          <input
            type="range"
            className="studio-range flex-1"
            aria-label={`${b.label} de ${title.toLowerCase()}`}
            min={-12}
            max={12}
            step={0.5}
            value={value[b.key]}
            onChange={(e) => onChange({ ...value, [b.key]: Number(e.target.value) })}
          />
          <span className="w-14 text-right">{value[b.key] > 0 ? "+" : ""}{value[b.key]} dB</span>
        </label>
      ))}
      <button type="button" className="btn mt-2 !px-3 !py-1" onClick={() => onChange(FLAT_EQ)}>
        Plano
      </button>
    </div>
  );
}

export function EqPanel({
  music,
  mic,
  onMusic,
  onMic,
}: {
  music: EqSettings;
  mic: EqSettings;
  onMusic: (e: EqSettings) => void;
  onMic: (e: EqSettings) => void;
}) {
  return (
    <section className="studio-voice panel" aria-label="Ecualizador">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display-up text-[1.4rem]">Ecualizador</h2>
        <label className="mono muted flex items-center gap-2">
          Preset
          <select
            className="input"
            aria-label="Preset de ecualizador"
            defaultValue=""
            onChange={(e) => {
              const p = EQ_PRESETS[e.target.value as EqPresetKey];
              if (!p) return;
              onMusic(p.music);
              onMic(p.mic);
              e.target.value = "";
            }}
          >
            <option value="">Elegir…</option>
            {Object.entries(EQ_PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <Channel title="Música" value={music} onChange={onMusic} />
        <Channel title="Micrófono" value={mic} onChange={onMic} />
      </div>
    </section>
  );
}
