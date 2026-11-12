import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { auditLogs, siteSettings, users } from "@/db/schema";
import { DEFAULT_SITE_SETTINGS, getSiteSettings, saveSiteSettings } from "@/modules/settings/site";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}
const full = (over: Record<string, unknown> = {}) => ({
  site: { name: "StereoFace", tagline: "música y escena", description: "Descripción nueva." },
  social: { instagram: "https://instagram.com/stereoface" },
  newsletter: { title: "Boletín", text: "Cada semana." },
  footer: { text: "Texto del pie." },
  ...over,
});

beforeAll(async () => {
  h = await makeDb();
  admin = await mkUser("admin", "adm");
  editor = await mkUser("editor", "ed");
});
afterAll(async () => {
  await h.close();
});

describe("ajustes del sitio", () => {
  it("sin filas devuelve los textos que hoy están fijos en la web", async () => {
    const s = await getSiteSettings(h.db);
    expect(s).toEqual(DEFAULT_SITE_SETTINGS);
    expect(s.newsletter.text).toBe("Una carta semanal con lo esencial de la escena.");
    expect(s.social).toEqual({});
  });

  it("tras guardar, la lectura refleja el cambio y se audita sin copiar los valores", async () => {
    await saveSiteSettings(h.db, admin, full());
    const s = await getSiteSettings(h.db);
    expect(s.site.description).toBe("Descripción nueva.");
    expect(s.social.instagram).toBe("https://instagram.com/stereoface");
    expect(s.newsletter.title).toBe("Boletín");
    const logs = await h.db.select().from(auditLogs);
    const log = logs.find((l) => l.action === "settings.update");
    expect(log).toBeTruthy();
    expect(JSON.stringify(log?.diff)).not.toContain("Descripción nueva");
  });

  it("rechaza redes que no sean https y limpia las vacías", async () => {
    await expect(saveSiteSettings(h.db, admin, full({ social: { instagram: "http://insta.example" } }))).rejects.toBeInstanceOf(ZodError);
    await expect(saveSiteSettings(h.db, admin, full({ social: { youtube: "javascript:alert(1)" } }))).rejects.toBeInstanceOf(ZodError);
    await saveSiteSettings(h.db, admin, full({ social: { instagram: "https://instagram.com/x", x: undefined } }));
    expect(Object.keys((await getSiteSettings(h.db)).social)).toEqual(["instagram"]);
  });

  it("un valor guardado inválido no rompe la web: se usa el predeterminado", async () => {
    await h.db.insert(siteSettings).values({ key: "footer", value: { text: 42 } }).onConflictDoUpdate({ target: siteSettings.key, set: { value: { text: 42 } } });
    expect((await getSiteSettings(h.db)).footer.text).toBe(DEFAULT_SITE_SETTINGS.footer.text);
  });

  it("solo administradores guardan ajustes (el editor no tiene permiso)", async () => {
    await expect(saveSiteSettings(h.db, editor, full())).rejects.toBeInstanceOf(ForbiddenError);
  });
});
