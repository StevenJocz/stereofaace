/** Anuncios de la hora: nombres de los eventos y asignación automática del audio de cada hora según el nombre del jingle. */

/** Debe coincidir con `HOUR_EVENT_PREFIX` del servidor (una prueba lo comprueba). */
export const HOUR_PREFIX = "Hora · ";
const pad = (n: number) => String(n).padStart(2, "0");

export const hourEventName = (hour: number, minute = 0) => `${HOUR_PREFIX}${pad(hour)}:${pad(minute)}`;

/** «Hora · 14:00» → { hour: 14, minute: 0 }; cualquier otro nombre → null. */
export function parseHourEvent(name: string): { hour: number; minute: number } | null {
  const m = /^Hora · ([01]\d|2[0-3]):([0-5]\d)$/.exec(name);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Busca entre los jingles el que parece ser el de una hora, por su nombre: «14:00», «14h00», «14 horas», «hora 14», «2 pm», «2 p.m.».
 * Devuelve su id o null. Si varios coinciden, gana el primero (en el orden de la lista).
 */
export function guessHourCart(carts: ReadonlyArray<{ id: string; name: string }>, hour: number): string | null {
  const hh = pad(hour);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ap = hour < 12 ? "a" : "p";
  const patterns = [
    new RegExp(`(^|[^0-9])${hh}\\s*[:.h]\\s*00([^0-9]|$)`),
    // Sin «:» ni «.» delante: en «14:00 hora» el «00 hora» no es la hora 0.
    new RegExp(`(^|[^0-9:.])0?${hour}\\s*(h|hs|hrs|horas?)([^a-z]|$)`),
    new RegExp(`(^|[^0-9:.])hora\\s*0?${hour}([^0-9]|$)`),
    new RegExp(`(^|[^0-9:.])0?${h12}\\s*(${ap}m|${ap}\\.\\s?m\\.?)([^a-z]|$)`),
  ];
  const names = carts.map((c) => ({ id: c.id, n: norm(c.name) }));
  for (const re of patterns) {
    const hit = names.find((c) => re.test(c.n));
    if (hit) return hit.id;
  }
  return null;
}
