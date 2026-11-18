import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { listSpacesForVerify } from "@/modules/spaces/moderation";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { verifyBadgeAction } from "../actions";

const STATUS: Record<string, string> = { draft: "Borrador", published: "Publicado" };

/** Dar o quitar el chulo de verificado a un Space. Disponible para todo el equipo (cualquier rol por encima de oyente). */
export default async function VerifySpacesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("space:verify");
  const sp = await searchParams;
  const rows = await listSpacesForVerify(await getDb(), user, { q: sp.q });
  return (
    <>
      <PageHead eyebrow="Audiencia" title="Verificar Spaces" />
      <p className="mt-3 max-w-[70ch] text-muted">El chulo de verificado aparece junto al nombre de usuario en el perfil. Dalo a artistas, DJs, sellos y cuentas oficiales que hayas comprobado.</p>
      <form className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <label className="block">
          <span className="mono muted block">Buscar</span>
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="usuario o nombre" maxLength={40} />
        </label>
        <button type="submit" className="btn">
          Buscar
        </button>
      </form>
      <ul className="mt-6 grid gap-2">
        {rows.map((r) => (
          <li key={r.userId} className="panel flex flex-wrap items-center justify-between gap-3 p-3">
            <span>
              <Link href={`/@${r.username}?vista=borrador`} className="font-bold hover:text-accent-ink">
                @{r.username}
              </Link>
              {r.badge && <span className="badge badge-ok ml-2">Verificado ✓</span>}
              <span className="mono muted block text-[0.72rem]">
                {r.displayName} · {STATUS[r.status] ?? r.status}
              </span>
            </span>
            <RowAction action={verifyBadgeAction} fields={{ id: r.userId, value: r.badge ? "0" : "1" }} label={r.badge ? "Quitar verificado" : "Verificar ✓"} />
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted">Ningún Space coincide.</li>}
      </ul>
    </>
  );
}
