"use client";

import { useState } from "react";

export type UploadedMedia = { id: string; url: string; alt: string; credit: string; license: string };

export function MediaUpload({
  onUploaded,
  disabled,
  label = "Subir imagen",
}: {
  onUploaded: (media: UploadedMedia) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [credit, setCredit] = useState("");
  const [license, setLicense] = useState("Propia");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const upload = async () => {
    if (!file) return setMessage("Selecciona una imagen.");
    setPending(true);
    setMessage(null);
    const form = new FormData();
    form.set("file", file);
    form.set("alt", alt);
    form.set("credit", credit);
    form.set("license", license);
    try {
      const response = await fetch("/api/media", { method: "POST", body: form });
      const data = (await response.json()) as UploadedMedia & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo subir la imagen.");
      onUploaded(data);
      setMessage("Imagen cargada.");
      setFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setPending(false);
    }
  };

  return (
    <details className="rounded-[6px] border border-line p-3">
      <summary className="mono cursor-pointer text-accent-ink">{label}</summary>
      <div className="mt-3 grid gap-3">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={disabled || pending}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <input
          className="input"
          value={alt}
          required
          maxLength={200}
          placeholder="Texto alternativo"
          disabled={disabled || pending}
          onChange={(e) => setAlt(e.target.value)}
        />
        <input
          className="input"
          value={credit}
          required
          maxLength={200}
          placeholder="Crédito / autor"
          disabled={disabled || pending}
          onChange={(e) => setCredit(e.target.value)}
        />
        <input
          className="input"
          value={license}
          required
          maxLength={200}
          placeholder="Licencia o permiso"
          disabled={disabled || pending}
          onChange={(e) => setLicense(e.target.value)}
        />
        <button type="button" className="btn btn-accent w-fit" disabled={disabled || pending} onClick={() => void upload()}>
          {pending ? "Subiendo…" : "Cargar"}
        </button>
        {message && (
          <p role="status" className="mono text-sm text-muted">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
