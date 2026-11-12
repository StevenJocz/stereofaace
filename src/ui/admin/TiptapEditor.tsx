"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Embed, Gallery, Pullquote } from "./tiptap-extensions";
import { MediaUpload } from "./MediaUpload";
import { toEmbedUrl } from "@/modules/content/embed";

export type EditorValue = { json: JSONContent; html: string };

type Field = { name: string; label: string; type?: "url" | "text" | "textarea"; required?: boolean; hint?: string };

const httpsOnly = (v: string) => /^https:\/\//i.test(v.trim());

/** Diálogo accesible (elemento <dialog> nativo) para pedir datos al insertar bloques. */
function AskDialog({
  title,
  fields,
  onSubmit,
  onClose,
}: {
  title: string;
  fields: Field[];
  onSubmit: (v: Record<string, string>) => string | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-auto w-[min(32rem,92vw)] rounded-[12px] border border-line bg-panel p-0 text-fg backdrop:bg-black/60"
    >
      <form
        method="dialog"
        className="grid gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const values = Object.fromEntries(fields.map((f) => [f.name, String(fd.get(f.name) ?? "").trim()]));
          const err = onSubmit(values);
          if (err) setError(err);
          else ref.current?.close();
        }}
      >
        <h2 className="display-up text-[1.1rem]">{title}</h2>
        {fields.map((f, i) => (
          <div key={f.name}>
            <label htmlFor={`ask-${f.name}`} className="mono mb-1 block text-muted">
              {f.label}
            </label>
            {f.type === "textarea" ? (
              <textarea
                id={`ask-${f.name}`}
                name={f.name}
                required={f.required}
                className="input"
                autoFocus={i === 0}
              />
            ) : (
              <input
                id={`ask-${f.name}`}
                name={f.name}
                type={f.type ?? "text"}
                required={f.required}
                className="input"
                autoFocus={i === 0}
              />
            )}
            {f.hint && <p className="mt-1 text-[0.78rem] text-muted">{f.hint}</p>}
          </div>
        ))}
        <p role="alert" className="mono min-h-5 text-[#ff8a8a]">
          {error}
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-accent">
            Insertar
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Btn({
  label,
  on,
  active,
  disabled,
  children,
}: {
  label: string;
  on: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Evita que el botón le quite el foco/selección al editor (el texto sigue escribiéndose donde estaba el cursor).
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`mono grid h-9 min-w-9 place-items-center rounded-[6px] border px-2 transition-colors disabled:opacity-40 ${
        active
          ? "border-transparent bg-accent text-[#07080a]"
          : "border-line hover:border-accent-ink hover:text-accent-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, ask }: { editor: Editor; ask: (d: DialogSpec) => void }) {
  const st = useEditorState({
    editor,
    selector: (s) => ({
      h2: s.editor.isActive("heading", { level: 2 }),
      h3: s.editor.isActive("heading", { level: 3 }),
      bold: s.editor.isActive("bold"),
      italic: s.editor.isActive("italic"),
      underline: s.editor.isActive("underline"),
      link: s.editor.isActive("link"),
      ul: s.editor.isActive("bulletList"),
      ol: s.editor.isActive("orderedList"),
      quote: s.editor.isActive("blockquote"),
      pull: s.editor.isActive("pullquote"),
      table: s.editor.isActive("table"),
      canUndo: s.editor.can().undo(),
      canRedo: s.editor.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();

  return (
    <div role="toolbar" aria-label="Formato del artículo" className="flex flex-wrap gap-1.5 border-b border-line p-2">
      <Btn label="Título (H2)" on={() => c().toggleHeading({ level: 2 }).run()} active={st.h2}>
        H2
      </Btn>
      <Btn label="Subtítulo (H3)" on={() => c().toggleHeading({ level: 3 }).run()} active={st.h3}>
        H3
      </Btn>
      <span className="mx-1 w-px bg-line" aria-hidden="true" />
      <Btn label="Negrita" on={() => c().toggleBold().run()} active={st.bold}>
        <b>B</b>
      </Btn>
      <Btn label="Cursiva" on={() => c().toggleItalic().run()} active={st.italic}>
        <i>I</i>
      </Btn>
      <Btn label="Subrayado" on={() => c().toggleUnderline().run()} active={st.underline}>
        <u>U</u>
      </Btn>
      <Btn
        label="Enlace"
        active={st.link}
        on={() => {
          if (st.link) return void c().unsetLink().run();
          ask({
            title: "Enlace",
            fields: [{ name: "url", label: "URL (https o mailto)", type: "url", required: true }],
            submit: (v) => {
              if (!httpsOnly(v.url) && !/^mailto:/i.test(v.url)) return "Debe empezar por https:// o mailto:";
              c().extendMarkRange("link").setLink({ href: v.url }).run();
              return null;
            },
          });
        }}
      >
        ↗
      </Btn>
      <span className="mx-1 w-px bg-line" aria-hidden="true" />
      <Btn label="Lista con viñetas" on={() => c().toggleBulletList().run()} active={st.ul}>
        •≡
      </Btn>
      <Btn label="Lista numerada" on={() => c().toggleOrderedList().run()} active={st.ol}>
        1.
      </Btn>
      <Btn label="Cita" on={() => c().toggleBlockquote().run()} active={st.quote}>
        “
      </Btn>
      <Btn label="Cita destacada" on={() => c().toggleWrap("pullquote").run()} active={st.pull}>
        “”
      </Btn>
      <Btn label="Separador" on={() => c().setHorizontalRule().run()}>
        —
      </Btn>
      <span className="mx-1 w-px bg-line" aria-hidden="true" />
      <Btn
        label="Imagen"
        on={() =>
          ask({
            title: "Imagen",
            fields: [
              { name: "src", label: "URL de la imagen (https)", type: "url", required: true },
              {
                name: "alt",
                label: "Texto alternativo",
                required: true,
                hint: "Describe la imagen para personas que no la ven.",
              },
            ],
            submit: (v) => {
              if (!httpsOnly(v.src)) return "La imagen debe ser https";
              c().setImage({ src: v.src, alt: v.alt }).run();
              return null;
            },
          })
        }
      >
        Img
      </Btn>
      <Btn
        label="Galería"
        on={() =>
          ask({
            title: "Galería (2 a 6 imágenes)",
            fields: [{ name: "urls", label: "Una URL https por línea", type: "textarea", required: true }],
            submit: (v) => {
              const urls = v.urls.split(/\s+/).filter(Boolean);
              if (urls.length < 2 || urls.length > 6) return "Escribe entre 2 y 6 URLs";
              if (!urls.every(httpsOnly)) return "Todas las URLs deben ser https";
              c()
                .insertContent({
                  type: "gallery",
                  content: urls.map((src) => ({ type: "image", attrs: { src, alt: "" } })),
                })
                .run();
              return null;
            },
          })
        }
      >
        Gal
      </Btn>
      <Btn
        label="Video o audio incrustado"
        on={() =>
          ask({
            title: "Video o audio",
            fields: [
              {
                name: "url",
                label: "Enlace",
                type: "url",
                required: true,
                hint: "YouTube, Vimeo, Spotify, SoundCloud, Mixcloud o Bandcamp. Se usa el reproductor oficial.",
              },
            ],
            submit: (v) => {
              const src = toEmbedUrl(v.url);
              if (!src) return "Proveedor no permitido o enlace no válido";
              c()
                .insertContent({ type: "embed", attrs: { src, title: "Contenido incrustado" } })
                .run();
              return null;
            },
          })
        }
      >
        ▶
      </Btn>
      <Btn label="Tabla" on={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        ▦
      </Btn>
      {st.table && (
        <>
          <Btn label="Añadir fila" on={() => c().addRowAfter().run()}>
            +fila
          </Btn>
          <Btn label="Añadir columna" on={() => c().addColumnAfter().run()}>
            +col
          </Btn>
          <Btn label="Eliminar fila" on={() => c().deleteRow().run()}>
            -fila
          </Btn>
          <Btn label="Eliminar tabla" on={() => c().deleteTable().run()}>
            ×tabla
          </Btn>
        </>
      )}
      <span className="mx-1 w-px bg-line" aria-hidden="true" />
      <Btn label="Deshacer" on={() => c().undo().run()} disabled={!st.canUndo}>
        ↶
      </Btn>
      <Btn label="Rehacer" on={() => c().redo().run()} disabled={!st.canRedo}>
        ↷
      </Btn>
    </div>
  );
}

type DialogSpec = { title: string; fields: Field[]; submit: (v: Record<string, string>) => string | null };

export function TiptapEditor({
  initialJson,
  initialHtml,
  onChange,
  disabled,
}: {
  initialJson?: JSONContent | null;
  initialHtml?: string | null;
  onChange: (v: EditorValue) => void;
  disabled?: boolean;
}) {
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ["https", "mailto"] },
      }),
      Image.configure({ allowBase64: false }),
      Table.configure({ resizable: false, HTMLAttributes: { class: "sf-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      Pullquote,
      Embed,
      Gallery,
      Placeholder.configure({
        placeholder: "Empieza a escribir. Usa la barra para títulos, citas, imágenes, galerías, video y tablas…",
      }),
    ],
    content: initialJson ?? initialHtml ?? "",
    editorProps: {
      attributes: {
        class: "article-body sf-editor min-h-[24rem] p-5 outline-none",
        "aria-label": "Cuerpo del artículo",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: e }) => onChange({ json: e.getJSON(), html: e.getHTML() }),
  });

  if (!editor) return <div className="panel min-h-[28rem]" aria-busy="true" />;
  return (
    <div className="panel overflow-hidden">
      {!disabled && (
        <div className="border-b border-line p-2">
          <MediaUpload
            label="Subir e insertar imagen en el artículo"
            onUploaded={(media) => {
              editor.chain().focus().setImage({ src: media.url, alt: media.alt, title: `${media.credit} · ${media.license}` }).run();
            }}
          />
        </div>
      )}
      {!disabled && <Toolbar editor={editor} ask={setDialog} />}
      <EditorContent editor={editor} />
      {dialog && (
        <AskDialog
          title={dialog.title}
          fields={dialog.fields}
          onSubmit={dialog.submit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
