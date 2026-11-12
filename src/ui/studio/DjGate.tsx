"use client";

import { useEffect, useState } from "react";
import type { DjProgramInfo } from "@/modules/schedule/dj";
import { ProgramPicker } from "./ProgramPicker";

const CREDS_KEY = "sf-studio-dj";
const DJ_RE = /^[a-z0-9_.-]{2,50}$/;

export type DjEntry = { user: string; password: string; programChoice: string };

function savedUser(): { user: string; password: string } {
  try {
    const raw = sessionStorage.getItem(CREDS_KEY);
    const p = raw ? (JSON.parse(raw) as { user?: string; password?: string }) : {};
    return { user: p.user ?? "", password: p.password ?? "" };
  } catch {
    return { user: "", password: "" };
  }
}

/** Entrada al estudio: el DJ se identifica y ve el programa que le toca antes de abrir la consola. */
export function DjGate({ onEnter }: { onEnter: (entry: DjEntry) => void }) {
  const [form, setForm] = useState({ user: "", password: "" });
  const [programChoice, setProgramChoice] = useState("");
  const [dj, setDj] = useState<DjProgramInfo | null>(null);
  const user = form.user.trim().toLowerCase();
  const valid = DJ_RE.test(user) && form.password.length > 0;

  // Lo guardado en esta pestaña solo existe en el navegador: se carga tras montar para no desajustar la hidratación.
  useEffect(() => {
    const saved = savedUser();
    if (saved.user || saved.password) setForm(saved); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  useEffect(() => {
    if (!DJ_RE.test(user)) return;
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/studio/my-program?dj=${encodeURIComponent(user)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: DjProgramInfo | null) => alive && setDj(d))
        .catch(() => undefined);
    }, 400); // espera a que termine de escribir
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [user]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const entry = { user: form.user.trim(), password: form.password };
    try {
      sessionStorage.setItem(CREDS_KEY, JSON.stringify(entry));
    } catch {
      /* sin almacenamiento: la consola recibe los datos por propiedad */
    }
    onEnter({ ...entry, programChoice });
  };

  return (
    <div className="studio-gate">
      <form className="studio-gate-card panel" onSubmit={submit}>
        <p className="mono text-accent-ink">StereoFace Radio</p>
        <h1 className="display-up text-[2rem] leading-none">Estudio en vivo</h1>
        <p className="muted mt-2 text-[0.9rem]">Identifícate como DJ para abrir la consola. Tus datos solo se guardan en esta pestaña.</p>
        <div className="mt-5 grid gap-3">
          <label className="block">
            <span className="mono muted block">Usuario DJ</span>
            <input className="input" value={form.user} onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))} autoComplete="username" autoFocus />
          </label>
          <label className="block">
            <span className="mono muted block">Contraseña</span>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="current-password" />
          </label>
        </div>
        {dj && DJ_RE.test(user) && (
          <div className="studio-gate-program">
            <ProgramPicker dj={dj} programChoice={programChoice} onProgramChoice={setProgramChoice} />
          </div>
        )}
        <button type="submit" className="btn btn-accent mt-5 w-full" disabled={!valid}>
          Entrar al estudio
        </button>
        <p className="mono muted mt-3 text-[0.7rem]">La contraseña se comprueba al pulsar «Emitir en vivo».</p>
      </form>
    </div>
  );
}
