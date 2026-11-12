import type { Role } from "@/modules/users/schema";

/**
 * Control de acceso por rol (RBAC). Es la única fuente de verdad: los casos de uso del servidor
 * llaman a `assertCan` antes de actuar; la interfaz solo lo usa para ocultar controles.
 */
export type Resource =
  | "article"
  | "category"
  | "tag"
  | "artist"
  | "release"
  | "event"
  | "page"
  | "media"
  | "user"
  | "source"
  | "ingest"
  | "setting"
  | "subscriber"
  | "station"
  | "audit"
  | "dashboard";

export type Action = "read" | "create" | "update" | "delete" | "publish" | "review" | "manage";
export type Permission = `${Resource}:${Action}`;

const ALL_RESOURCES: Resource[] = [
  "article",
  "category",
  "tag",
  "artist",
  "release",
  "event",
  "page",
  "media",
  "user",
  "source",
  "ingest",
  "setting",
  "subscriber",
  "audit",
  "dashboard",
  "station",
];
const ALL_ACTIONS: Action[] = ["read", "create", "update", "delete", "publish", "review", "manage"];

const all = (): Permission[] => ALL_RESOURCES.flatMap((r) => ALL_ACTIONS.map((a) => `${r}:${a}` as Permission));
const rw = (r: Resource, extra: Action[] = []): Permission[] =>
  (["read", "create", "update", ...extra] as Action[]).map((a) => `${r}:${a}` as Permission);

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  superadmin: new Set(all()),
  // Administrador: todo salvo gestionar la plataforma a nivel de superadmin (ver `canAssignRole`).
  admin: new Set(all().filter((p) => p !== "audit:manage")),
  editor: new Set<Permission>([
    ...rw("article", ["delete", "publish", "review"]),
    ...rw("category", ["delete"]),
    ...rw("tag", ["delete"]),
    ...rw("artist", ["delete"]),
    ...rw("release", ["delete", "publish"]),
    ...rw("event", ["delete", "publish"]),
    ...rw("page", ["publish"]),
    ...rw("media", ["delete"]),
    // Emisoras: el editor las mantiene, pero no las activa ni cambia su estado de autorización.
    ...rw("station"),
    "ingest:read",
    "ingest:review",
    "source:read",
    "dashboard:read",
    "subscriber:read",
    "user:read",
  ]),
  redactor: new Set<Permission>([
    "article:read",
    "article:create",
    "article:update",
    "category:read",
    "tag:read",
    "tag:create",
    "artist:read",
    "artist:create",
    "artist:update",
    "release:read",
    "release:create",
    "release:update",
    "event:read",
    "event:create",
    "event:update",
    "media:read",
    "media:create",
    "dashboard:read",
    "station:read",
  ]),
  colaborador: new Set<Permission>([
    "article:read",
    "article:create",
    "article:update",
    "category:read",
    "tag:read",
    "artist:read",
    "release:read",
    "event:read",
    "media:read",
    "media:create",
  ]),
};

export class ForbiddenError extends Error {
  constructor(public readonly permission: string) {
    super(`Acceso denegado: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export type Actor = { id: string; role: Role };

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function assertCan(actor: Actor | null | undefined, permission: Permission): asserts actor is Actor {
  if (!actor || !can(actor.role, permission)) throw new ForbiddenError(permission);
}

/** Redactores y colaboradores solo editan lo suyo y solo mientras es borrador; editores y superiores, todo. */
export function canEditArticle(actor: Actor, article: { authorId: string | null; status: string }): boolean {
  if (!can(actor.role, "article:update")) return false;
  if (can(actor.role, "article:review")) return true;
  return article.authorId === actor.id && (article.status === "draft" || article.status === "review");
}

/** Publicar o programar exige permiso de publicación. Colaboradores y redactores solo envían a revisión. */
export function canSetArticleStatus(actor: Actor, next: string): boolean {
  if (next === "published" || next === "scheduled" || next === "archived") return can(actor.role, "article:publish");
  return can(actor.role, "article:update");
}

const RANK: Record<Role, number> = { superadmin: 5, admin: 4, editor: 3, redactor: 2, colaborador: 1 };

/** Nadie asigna un rol igual o superior al propio, salvo el superadministrador. */
export function canAssignRole(actor: Actor, target: Role): boolean {
  if (!can(actor.role, "user:manage")) return false;
  if (actor.role === "superadmin") return true;
  return RANK[target] < RANK[actor.role];
}
