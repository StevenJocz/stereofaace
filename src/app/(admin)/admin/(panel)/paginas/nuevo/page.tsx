import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { PageHead } from "@/ui/admin/fields";
import { PageForm } from "@/ui/admin/PageForm";

export default async function NewPagePage() {
  await requirePermission("page:create");
  return (
    <>
      <PageHead eyebrow="Contenido" title="Nueva página" action={<Link href="/admin/paginas" className="btn">← Páginas</Link>} />
      <div className="mt-8">
        <PageForm initial={{}} />
      </div>
    </>
  );
}
