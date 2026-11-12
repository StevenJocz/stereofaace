/**
 * Una celda de CSV segura: neutraliza las fórmulas de hoja de cálculo (valores que empiezan por
 * `=`, `+`, `-`, `@`, tabulador o retorno de carro) anteponiendo `'`, y entrecomilla si hace falta.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
