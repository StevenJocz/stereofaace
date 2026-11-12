import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { genres, radioStations, users } from "@/db/schema";
import {
  createStation,
  deleteStation,
  getStationAdmin,
  listPublicStations,
  listStationsAdmin,
  setStationAuthorization,
  setStationEnabled,
  updateStation,
} from "@/modules/radio/service";
import { authorizationInputSchema, isAllowedStationEmbedHost, stationInputSchema } from "@/modules/radio/validators";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;
let redactor: Actor;

const base = {
  name: "Radio Prueba",
  streamKind: "hls",
  streamUrl: "https://stream.example.org/live.m3u8",
  attributionName: "Radio Prueba FM",
  attributionUrl: "https://example.org",
};

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db
    .insert(users)
    .values({ email: `${n}@example.com`, name: n, role })
    .returning();
  return { id: u.id, role: u.role };
}

beforeAll(async () => {
  h = await makeDb({ seed: true });
  admin = await mkUser("admin", "root");
  editor = await mkUser("editor", "edi");
  redactor = await mkUser("redactor", "red");
});
afterAll(async () => {
  await h.close();
});

describe("validación de emisoras", () => {
  it("exige https público y atribución", () => {
    expect(stationInputSchema.safeParse(base).success).toBe(true);
    expect(stationInputSchema.safeParse({ ...base, streamUrl: "http://stream.example.org/a.mp3" }).success).toBe(false);
    expect(stationInputSchema.safeParse({ ...base, streamUrl: "https://127.0.0.1/live.m3u8" }).success).toBe(false);
    expect(stationInputSchema.safeParse({ ...base, streamUrl: "https://192.168.1.10/live.m3u8" }).success).toBe(false);
    expect(stationInputSchema.safeParse({ ...base, attributionName: "" }).success).toBe(false);
    expect(stationInputSchema.safeParse({ ...base, attributionUrl: undefined }).success).toBe(false);
    expect(stationInputSchema.safeParse({ ...base, attributionUrl: "http://example.org" }).success).toBe(false);
  });
  it("los reproductores incrustados solo desde proveedores permitidos", () => {
    const embed = { ...base, streamKind: "embed", streamUrl: undefined };
    expect(
      stationInputSchema.safeParse({ ...embed, embedUrl: "https://www.mixcloud.com/widget/iframe/?feed=x" }).success,
    ).toBe(true);
    expect(stationInputSchema.safeParse({ ...embed, embedUrl: "https://player.desconocido.example/x" }).success).toBe(
      false,
    );
    expect(isAllowedStationEmbedHost("player.desconocido.example", "desconocido.example")).toBe(true);
    expect(stationInputSchema.safeParse({ ...base, embedUrl: "https://www.mixcloud.com/x" }).success).toBe(false);
  });
  it("conceder autorización exige evidencia", () => {
    expect(authorizationInputSchema.safeParse({ status: "granted" }).success).toBe(false);
    expect(authorizationInputSchema.safeParse({ status: "granted", notes: "ok" }).success).toBe(false);
    expect(
      authorizationInputSchema.safeParse({
        status: "granted",
        notes: "Permiso escrito de la dirección, 10/11/2026, por correo.",
      }).success,
    ).toBe(true);
    expect(authorizationInputSchema.safeParse({ status: "denied" }).success).toBe(true);
  });
});

describe("ciclo de vida y reglas de autorización", () => {
  it("una emisora nueva nace desactivada y con autorización pendiente, aunque se intente lo contrario", async () => {
    const s = await createStation(h.db, editor, { ...base, enabled: true, authorizationStatus: "granted" });
    const row = await getStationAdmin(h.db, editor, s.id);
    expect(row?.enabled).toBe(false);
    expect(row?.authorizationStatus).toBe("pending");
    expect((await listPublicStations(h.db)).map((x) => x.slug)).not.toContain(s.slug);
  });

  it("no se activa sin autorización", async () => {
    const s = await createStation(h.db, admin, { ...base, name: "Sin permiso" });
    await expect(setStationEnabled(h.db, admin, s.id, true)).rejects.toMatchObject({ code: "not_authorized" });
    await setStationAuthorization(h.db, admin, s.id, { status: "denied", notes: "Rechazado por la emisora." });
    await expect(setStationEnabled(h.db, admin, s.id, true)).rejects.toBeInstanceOf(DomainError);
  });

  it("no se activa sin URL de la señal, aunque tenga autorización", async () => {
    const s = await createStation(h.db, admin, { ...base, name: "Sin URL", streamUrl: undefined });
    await setStationAuthorization(h.db, admin, s.id, {
      status: "granted",
      notes: "Permiso escrito recibido por correo.",
    });
    await expect(setStationEnabled(h.db, admin, s.id, true)).rejects.toMatchObject({ code: "no_source" });
  });

  it("con autorización y fuente se activa y aparece en el listado público sin datos internos", async () => {
    const s = await createStation(h.db, admin, { ...base, name: "Autorizada", genreIds: [] });
    await setStationAuthorization(h.db, admin, s.id, {
      status: "granted",
      notes: "Permiso escrito recibido por correo.",
    });
    await setStationEnabled(h.db, admin, s.id, true);
    const pub = await listPublicStations(h.db);
    const found = pub.find((x) => x.slug === s.slug);
    expect(found).toBeTruthy();
    expect(found?.attributionName).toBe("Radio Prueba FM");
    expect(JSON.stringify(found)).not.toContain("Permiso escrito");
    expect(Object.keys(found!)).not.toContain("authorizationNotes");
  });

  it("revocar la autorización desactiva la emisora", async () => {
    const s = await createStation(h.db, admin, { ...base, name: "Revocable" });
    await setStationAuthorization(h.db, admin, s.id, {
      status: "granted",
      notes: "Permiso escrito recibido por correo.",
    });
    await setStationEnabled(h.db, admin, s.id, true);
    await setStationAuthorization(h.db, admin, s.id, { status: "denied", notes: "Retiraron el permiso." });
    expect((await getStationAdmin(h.db, admin, s.id))?.enabled).toBe(false);
    expect((await listPublicStations(h.db)).map((x) => x.slug)).not.toContain(s.slug);
  });

  it("cambiar la URL de una emisora activa la desactiva (la autorización era para otra fuente)", async () => {
    const s = await createStation(h.db, admin, { ...base, name: "Cambia fuente" });
    await setStationAuthorization(h.db, admin, s.id, {
      status: "granted",
      notes: "Permiso escrito recibido por correo.",
    });
    await setStationEnabled(h.db, admin, s.id, true);
    const r = await updateStation(h.db, admin, s.id, {
      ...base,
      name: "Cambia fuente",
      streamUrl: "https://otra.example.org/live.m3u8",
    });
    expect(r.autoDisabled).toBe(true);
    expect((await getStationAdmin(h.db, admin, s.id))?.enabled).toBe(false);
    // Cambiar solo el nombre no la desactiva.
    await setStationEnabled(h.db, admin, s.id, true);
    const r2 = await updateStation(h.db, admin, s.id, {
      ...base,
      name: "Cambia fuente 2",
      streamUrl: "https://otra.example.org/live.m3u8",
    });
    expect(r2.autoDisabled).toBe(false);
    expect((await getStationAdmin(h.db, admin, s.id))?.enabled).toBe(true);
  });

  it("borrar la quita del reproductor y del listado de administración", async () => {
    const s = await createStation(h.db, admin, { ...base, name: "Se borra" });
    await setStationAuthorization(h.db, admin, s.id, {
      status: "granted",
      notes: "Permiso escrito recibido por correo.",
    });
    await setStationEnabled(h.db, admin, s.id, true);
    await deleteStation(h.db, admin, s.id);
    expect((await listPublicStations(h.db)).map((x) => x.slug)).not.toContain(s.slug);
    expect((await listStationsAdmin(h.db, admin)).map((x) => x.id)).not.toContain(s.id);
  });

  it("asocia géneros", async () => {
    const g = await h.db.select().from(genres).limit(2);
    const s = await createStation(h.db, admin, { ...base, name: "Con géneros", genreIds: g.map((x) => x.id) });
    await setStationAuthorization(h.db, admin, s.id, {
      status: "granted",
      notes: "Permiso escrito recibido por correo.",
    });
    await setStationEnabled(h.db, admin, s.id, true);
    const pub = (await listPublicStations(h.db)).find((x) => x.slug === s.slug);
    expect(pub?.genres.sort()).toEqual(g.map((x) => x.name).sort());
  });
});

describe("permisos en el servidor", () => {
  it("el redactor solo lee; el editor edita pero no activa ni autoriza; el admin todo", async () => {
    await expect(createStation(h.db, redactor, base)).rejects.toBeInstanceOf(ForbiddenError);
    const s = await createStation(h.db, editor, { ...base, name: "Del editor" });
    await expect(setStationEnabled(h.db, editor, s.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      setStationAuthorization(h.db, editor, s.id, { status: "granted", notes: "Permiso escrito recibido por correo." }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteStation(h.db, editor, s.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listStationsAdmin(h.db, redactor)).length).toBeGreaterThan(0);
    await expect(listStationsAdmin(h.db, null)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("restricciones de la base de datos (defensa en profundidad)", () => {
  it("la base rechaza activar una emisora sin autorización aunque se salte la aplicación", async () => {
    const s = await createStation(h.db, admin, { ...base, name: "Intento directo" });
    await expect(h.db.update(radioStations).set({ enabled: true }).where(eq(radioStations.id, s.id))).rejects.toThrow();
  });
  it("la base rechaza activar sin fuente aunque haya autorización", async () => {
    await expect(
      h.db.insert(radioStations).values({
        slug: "directo-sin-fuente",
        name: "x",
        streamKind: "hls",
        attributionName: "x",
        attributionUrl: "https://example.org",
        authorizationStatus: "granted",
        enabled: true,
      }),
    ).rejects.toThrow();
  });
});

describe("registros sembrados", () => {
  it("The Lot Radio existe desactivada, pendiente y sin URL de señal", async () => {
    const [lot] = await h.db.select().from(radioStations).where(eq(radioStations.slug, "the-lot-radio"));
    expect(lot).toBeTruthy();
    expect(lot.enabled).toBe(false);
    expect(lot.authorizationStatus).toBe("pending");
    expect(lot.streamUrl).toBeNull();
    expect(lot.embedUrl).toBeNull();
    expect(lot.attributionName).toBe("The Lot Radio");
    expect((await listPublicStations(h.db)).map((x) => x.slug)).not.toContain("the-lot-radio");
  });
  it("la señal de prueba solo existe como demo", async () => {
    const [t] = await h.db.select().from(radioStations).where(eq(radioStations.slug, "senal-de-prueba"));
    expect(t.isDemo).toBe(true);
    expect(t.authorizationStatus).toBe("not_required");
  });
});
