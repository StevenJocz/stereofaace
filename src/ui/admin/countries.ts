/** Países habituales en la agenda (ISO 3166-1 alfa-2). */
export const COUNTRIES: [string, string][] = [
  ["AR", "Argentina"],
  ["BO", "Bolivia"],
  ["BR", "Brasil"],
  ["CL", "Chile"],
  ["CO", "Colombia"],
  ["CR", "Costa Rica"],
  ["CU", "Cuba"],
  ["DO", "República Dominicana"],
  ["EC", "Ecuador"],
  ["SV", "El Salvador"],
  ["ES", "España"],
  ["US", "Estados Unidos"],
  ["GT", "Guatemala"],
  ["HN", "Honduras"],
  ["MX", "México"],
  ["NI", "Nicaragua"],
  ["PA", "Panamá"],
  ["PY", "Paraguay"],
  ["PE", "Perú"],
  ["PR", "Puerto Rico"],
  ["UY", "Uruguay"],
  ["VE", "Venezuela"],
  ["DE", "Alemania"],
  ["FR", "Francia"],
  ["GB", "Reino Unido"],
  ["IT", "Italia"],
  ["NL", "Países Bajos"],
  ["PT", "Portugal"],
];

/** Convierte una fecha a texto para `datetime-local` en hora de Bogotá (UTC−5, sin horario de verano). */
export function toBogotaInput(d: Date): string {
  return new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 16);
}

/** Interpreta el valor de `datetime-local` como hora de Bogotá. Devuelve `undefined` si está vacío. */
export function fromBogotaInput(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.length === 16 ? `${value}:00` : value;
  return `${v}-05:00`;
}
