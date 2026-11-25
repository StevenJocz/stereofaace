"use client";

import { MIDI_ACTIONS, describeKey, keyOf, type MidiAction, type MidiMap } from "./engine/midi";
import type { MidiStatus } from "./useMidi";

const STATUS_TEXT: Record<MidiStatus, string> = {
  unsupported: "Este navegador no permite controladores MIDI. Usa Chrome o Edge.",
  idle: "Desconectado.",
  asking: "Esperando el permiso del navegador…",
  ready: "Conectado.",
  denied: "El navegador no dejó usar el MIDI. Permítelo en el candado de la barra de direcciones y vuelve a conectar.",
  error: "No se pudo abrir el MIDI. Revisa que el aparato esté conectado y vuelve a intentarlo.",
};

const GROUPS = [...new Set(MIDI_ACTIONS.map((a) => a.group))];

/**
 * Vincula un controlador MIDI (consola de DJ, mezclador, pads) a las acciones del estudio: se pulsa «Aprender» en una acción,
 * se toca el botón o se mueve el deslizador del aparato y queda guardado en este navegador.
 */
export function MidiPanel({
  status,
  inputs,
  map,
  learning,
  last,
  onConnect,
  onDisconnect,
  onLearn,
  onUnbind,
  onClear,
}: {
  status: MidiStatus;
  inputs: string[];
  map: MidiMap;
  learning: string | null;
  last: { key: string; text: string } | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onLearn: (id: string | null) => void;
  onUnbind: (id: string) => void;
  onClear: () => void;
}) {
  const on = status === "ready";
  const hint = (a: MidiAction) => (a.kind === "fader" ? "Mueve el deslizador o la perilla del aparato…" : a.kind === "hold" ? "Pulsa el botón del aparato…" : "Pulsa el botón del aparato…");
  return (
    <section className="studio-voice panel zs-midi" aria-label="Controlador MIDI">
      <header className="flex items-center justify-between gap-2">
        <h2 className="display-up text-[1.4rem]">Controlador MIDI</h2>
        {on && <span className="badge badge-ok">{inputs.length > 0 ? `${inputs.length} aparato${inputs.length === 1 ? "" : "s"}` : "Sin aparatos"}</span>}
      </header>
      <p className="muted mt-2 max-w-[62ch] text-[0.88rem]">
        Si tu consola de DJ, mezclador o pads tienen USB, vincula sus botones y deslizadores al estudio: pulsa «Aprender» en una acción y toca el control. Los vínculos se guardan en este navegador.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={on ? "btn" : "btn btn-accent"} onClick={on ? onDisconnect : onConnect} disabled={status === "unsupported" || status === "asking"}>
          {on ? "Desconectar" : "Conectar controlador"}
        </button>
        {Object.keys(map).length > 0 && (
          <button type="button" className="btn" onClick={onClear}>
            Quitar todos los vínculos
          </button>
        )}
      </div>
      <p className="muted mt-2 text-[0.85rem]" role="status" data-testid="midi-status">
        {STATUS_TEXT[status]}
        {on && inputs.length > 0 && <> {inputs.join(", ")}.</>}
        {on && inputs.length === 0 && <> Enchufa el aparato y aparecerá aquí.</>}
      </p>
      {on && (
        <p className="mono muted mt-1 text-[0.82rem]" aria-live="off" data-testid="midi-last">
          Último mensaje: {last ? last.text : "—"}
        </p>
      )}
      <div className="zs-midi-list mt-3">
        {GROUPS.map((g) => (
          <fieldset key={g} className="zs-midi-group">
            <legend className="mono muted">{g}</legend>
            {MIDI_ACTIONS.filter((a) => a.group === g).map((a) => {
              const key = keyOf(map, a.id);
              const isLearning = learning === a.id;
              return (
                <div key={a.id} className="zs-midi-row" data-learning={isLearning || undefined} data-action={a.id}>
                  <span className="zs-midi-label">{a.label}</span>
                  <span className="zs-midi-key mono">{isLearning ? hint(a) : key ? describeKey(key) : "Sin vincular"}</span>
                  <button type="button" className="btn zs-midi-btn" disabled={!on} onClick={() => onLearn(isLearning ? null : a.id)} aria-pressed={isLearning}>
                    {isLearning ? "Cancelar" : key ? "Cambiar" : "Aprender"}
                  </button>
                  {key && !isLearning && (
                    <button type="button" className="btn zs-midi-btn" onClick={() => onUnbind(a.id)} aria-label={`Quitar el vínculo de ${a.label}`}>
                      Quitar
                    </button>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>
    </section>
  );
}
