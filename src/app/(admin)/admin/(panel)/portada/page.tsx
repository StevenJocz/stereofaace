import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { listArticlesAdmin } from "@/modules/content/admin";
import { listHomeBlocksAdmin } from "@/modules/content/home-blocks";
import { BlockForm, BlockRow, type BlockView } from "@/ui/admin/HomeBlockForms";
import { PageHead } from "@/ui/admin/fields";

export default async function HomeBlocksPage() {
  const user = await requirePermission("article:publish");
  const db = await getDb();
  const [blocks, published] = await Promise.all([
    listHomeBlocksAdmin(db, user),
    listArticlesAdmin(db, user, { status: "published", pageSize: 100 }),
  ]);
  const articles = published.items.map((a) => ({ id: a.id, title: a.title }));
  const view = (kind: "hero" | "feature"): BlockView[] =>
    blocks
      .filter((b) => b.kind === kind)
      .map((b) => ({
        id: b.id,
        kind: b.kind,
        position: b.position,
        active: b.active,
        articleId: b.article.id,
        articleTitle: b.article.title,
        problem: b.problem,
        config: b.config as BlockView["config"],
      }));
  const heroes = view("hero");
  const features = view("feature");

  return (
    <>
      <PageHead eyebrow="Contenido" title="Portada (automática)" />
      <p className="mt-4 max-w-[70ch] text-muted">
        <strong>La portada se arma sola.</strong> El carrusel toma los artículos publicados más recientes (con foto
        primero) y los destacados, los siguientes más recientes; ninguno se repite. No necesitas hacer nada aquí.
        Si quieres <strong>fijar</strong> un artículo concreto, añádelo abajo: los fijados van primero y el resto se
        completa solo.
      </p>

      <section className="mt-10" aria-labelledby="hero-h">
        <h2 id="hero-h" className="display t-s">Carrusel · artículos fijados</h2>
        <ul className="mt-4 grid gap-3">
          {heroes.map((b, i) => (
            <BlockRow key={b.id} block={b} first={i === 0} last={i === heroes.length - 1} articles={articles} />
          ))}
        </ul>
        {heroes.length === 0 && <p className="mt-3 text-muted">Ninguno fijado: el carrusel se llena solo con lo más reciente.</p>}
        <details className="mt-4">
          <summary className="btn btn-accent w-fit cursor-pointer">Fijar un artículo en el carrusel</summary>
          <div className="panel mt-3 p-4">
            <BlockForm kind="hero" articles={articles} />
          </div>
        </details>
      </section>

      <section className="mt-14" aria-labelledby="feat-h">
        <h2 id="feat-h" className="display t-s">Destacados · artículos fijados</h2>
        <ul className="mt-4 grid gap-3">
          {features.map((b, i) => (
            <BlockRow key={b.id} block={b} first={i === 0} last={i === features.length - 1} articles={articles} />
          ))}
        </ul>
        {features.length === 0 && <p className="mt-3 text-muted">Ninguno fijado: los destacados se llenan solos.</p>}
        <details className="mt-4">
          <summary className="btn btn-accent w-fit cursor-pointer">Fijar un destacado</summary>
          <div className="panel mt-3 p-4">
            <BlockForm kind="feature" articles={articles} />
          </div>
        </details>
      </section>
    </>
  );
}
