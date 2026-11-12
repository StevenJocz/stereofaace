import { describe, expect, it } from "vitest";
import { assertCan, can, canAssignRole, canEditArticle, canSetArticleStatus, ForbiddenError } from "@/lib/rbac";
import { ROLES } from "@/modules/users/schema";

const actor = (role: (typeof ROLES)[number], id = "u1") => ({ id, role });

describe("RBAC", () => {
  it("superadmin puede todo", () => {
    expect(can("superadmin", "user:manage")).toBe(true);
    expect(can("superadmin", "audit:manage")).toBe(true);
  });
  it("colaborador solo crea borradores propios", () => {
    expect(can("colaborador", "article:create")).toBe(true);
    expect(can("colaborador", "article:publish")).toBe(false);
    expect(can("colaborador", "user:read")).toBe(false);
    expect(can("colaborador", "source:read")).toBe(false);
  });
  it("redactor no gestiona usuarios, fuentes ni ajustes", () => {
    for (const p of ["user:manage", "source:create", "setting:update", "article:publish", "article:delete"] as const)
      expect(can("redactor", p), p).toBe(false);
  });
  it("editor publica y revisa, pero no administra usuarios ni ajustes", () => {
    expect(can("editor", "article:publish")).toBe(true);
    expect(can("editor", "ingest:review")).toBe(true);
    expect(can("editor", "user:manage")).toBe(false);
    expect(can("editor", "setting:update")).toBe(false);
  });
  it("assertCan lanza ForbiddenError sin actor o sin permiso", () => {
    expect(() => assertCan(null, "article:read")).toThrow(ForbiddenError);
    expect(() => assertCan(actor("colaborador"), "article:publish")).toThrow(ForbiddenError);
    expect(() => assertCan(actor("editor"), "article:publish")).not.toThrow();
  });
  it("redactor solo edita sus borradores; editor edita cualquiera", () => {
    expect(canEditArticle(actor("redactor"), { authorId: "u1", status: "draft" })).toBe(true);
    expect(canEditArticle(actor("redactor"), { authorId: "u1", status: "published" })).toBe(false);
    expect(canEditArticle(actor("redactor"), { authorId: "u2", status: "draft" })).toBe(false);
    expect(canEditArticle(actor("editor"), { authorId: "u2", status: "published" })).toBe(true);
  });
  it("publicar o programar exige permiso de publicación", () => {
    expect(canSetArticleStatus(actor("redactor"), "review")).toBe(true);
    expect(canSetArticleStatus(actor("redactor"), "published")).toBe(false);
    expect(canSetArticleStatus(actor("redactor"), "scheduled")).toBe(false);
    expect(canSetArticleStatus(actor("editor"), "scheduled")).toBe(true);
  });
  it("nadie asigna un rol igual o superior al propio salvo superadmin", () => {
    expect(canAssignRole(actor("admin"), "editor")).toBe(true);
    expect(canAssignRole(actor("admin"), "admin")).toBe(false);
    expect(canAssignRole(actor("admin"), "superadmin")).toBe(false);
    expect(canAssignRole(actor("editor"), "colaborador")).toBe(false);
    expect(canAssignRole(actor("superadmin"), "superadmin")).toBe(true);
  });
});
