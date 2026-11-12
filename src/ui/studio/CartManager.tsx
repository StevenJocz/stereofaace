"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCartAction, moveCartAction, updateCartAction } from "@/app/(admin)/admin/(panel)/radio/studio/carts/actions";
import type { FormState } from "@/lib/admin/form";
import type { CartView } from "@/modules/studio/carts";
import { ConfirmDelete } from "@/ui/admin/ConfirmDelete";
import { Message } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { CART_KIND_LABEL } from "./engine/carts";
import { formatTime } from "./MeterBar";

const KINDS = Object.entries(CART_KIND_LABEL) as [CartView["kind"], string][];

function UploadForm() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function onFile(file: File | undefined) {
    setDuration("");
    if (!file) return;
    const a = new Audio();
    const url = URL.createObjectURL(file);
    a.preload = "metadata";
    a.src = url;
    a.onloadedmetadata = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration.toFixed(2));
      URL.revokeObjectURL(url);
    };
    a.onerror = () => URL.revokeObjectURL(url);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/studio/carts", { method: "POST", body: new FormData(e.currentTarget) });
      const body = (await res.json().catch(() => null)) as { error?: string; name?: string } | null;
      if (!res.ok) {
        setResult({ ok: false, message: body?.error ?? "No se pudo subir el audio." });
      } else {
        setResult({ ok: true, message: `«${body?.name ?? "Cart"}» agregado.` });
        form.current?.reset();
        setDuration("");
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "No se pudo conectar. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-6" aria-label="Agregar un cart">
      <h2 className="display-up text-[1.3rem] md:col-span-6">Agregar audio</h2>
      <label className="md:col-span-2">
        <span className="mono muted block">Nombre *</span>
        <input name="name" className="input w-full" required maxLength={60} />
      </label>
      <label>
        <span className="mono muted block">Tipo *</span>
        <select name="kind" className="input w-full" defaultValue="jingle">
          {KINDS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mono muted block">Color</span>
        <input name="color" type="color" className="input !p-1 h-[2.6rem] w-full" defaultValue="#c6ff00" />
      </label>
      <label>
        <span className="mono muted block">Atajo (1 tecla)</span>
        <input name="hotkey" className="input w-full" maxLength={1} />
      </label>
      <label>
        <span className="mono muted block">Ganancia (dB)</span>
        <input name="gainDb" type="number" className="input w-full" min={-24} max={6} step={1} defaultValue={0} />
      </label>
      <label className="md:col-span-3">
        <span className="mono muted block">Archivo de audio *</span>
        <input name="file" type="file" required accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" className="input w-full" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <input type="hidden" name="durationSec" value={duration} />
      <label className="mono muted flex items-center gap-2 md:col-span-2">
        <input type="checkbox" name="duck" defaultChecked /> Bajar la música mientras suena
      </label>
      <div className="flex items-center gap-3 md:col-span-6">
        <button type="submit" className="btn btn-accent" disabled={busy}>
          {busy ? "Subiendo…" : "Subir"}
        </button>
        {result && (
          <p role={result.ok ? "status" : "alert"} className={`mono ${result.ok ? "text-accent-ink" : "text-[#ff8a8a]"}`}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}

function EditRow({ cart, first, last, canDelete }: { cart: CartView; first: boolean; last: boolean; canDelete: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateCartAction, null);
  return (
    <li className="panel p-3">
      <form action={action} className="grid items-end gap-2 md:grid-cols-[auto_2fr_1.2fr_auto_auto_auto_auto]">
        <input type="hidden" name="id" value={cart.id} />
        <span className="h-8 w-8 rounded-md" style={{ background: cart.color }} aria-hidden="true" />
        <label>
          <span className="sr-only">Nombre</span>
          <input name="name" className="input w-full" defaultValue={cart.name} maxLength={60} required />
        </label>
        <label>
          <span className="sr-only">Tipo</span>
          <select name="kind" className="input w-full" defaultValue={cart.kind}>
            {KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Color</span>
          <input name="color" type="color" className="input !p-1 h-[2.6rem] w-14" defaultValue={cart.color} />
        </label>
        <label>
          <span className="sr-only">Atajo</span>
          <input name="hotkey" className="input !w-14 text-center" maxLength={1} defaultValue={cart.hotkey ?? ""} placeholder="—" />
        </label>
        <label>
          <span className="sr-only">Ganancia en dB</span>
          <input name="gainDb" type="number" className="input !w-20" min={-24} max={6} step={1} defaultValue={cart.gainDb} />
        </label>
        <label className="mono muted flex items-center gap-1 whitespace-nowrap">
          <input type="checkbox" name="duck" defaultChecked={cart.duck} /> Bajar música
        </label>
        <div className="flex flex-wrap items-center gap-2 md:col-span-7">
          <button type="submit" className="btn btn-accent !px-4 !py-1" disabled={pending}>
            Guardar
          </button>
          <span className="mono muted">{cart.durationSec ? formatTime(cart.durationSec) : "--:--"}</span>
          <Message state={state} />
        </div>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!first && <RowAction action={moveCartAction} fields={{ id: cart.id, direction: "up" }} label="↑ Subir" ariaLabel={`Subir ${cart.name}`} />}
        {!last && <RowAction action={moveCartAction} fields={{ id: cart.id, direction: "down" }} label="↓ Bajar" ariaLabel={`Bajar ${cart.name}`} />}
        <audio controls preload="none" src={`/api/studio/cart/${cart.id}`} className="h-8" aria-label={`Escuchar ${cart.name}`} />
        {canDelete && <ConfirmDelete id={cart.id} action={deleteCartAction} />}
      </div>
    </li>
  );
}

export function CartManager({ initial, canDelete }: { initial: CartView[]; canDelete: boolean }) {
  return (
    <div className="grid gap-6">
      <UploadForm />
      <section aria-label="Carts guardados">
        <h2 className="display-up text-[1.3rem]">Guardados ({initial.length})</h2>
        {initial.length === 0 ? (
          <p className="mt-3 text-muted">Todavía no hay audios. Sube el primero con el formulario de arriba.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {initial.map((c, i) => (
              <EditRow key={c.id} cart={c} first={i === 0} last={i === initial.length - 1} canDelete={canDelete} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
