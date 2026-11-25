/**
 * Tecla para hablar («mantener para hablar»): la elige el DJ y se guarda en este navegador. Se identifica por `KeyboardEvent.code`
 * (la posición de la tecla), así no cambia con el idioma del teclado.
 */
export const PTT_KEY = "sf-studio-ptt";
export const DEFAULT_PTT = "KeyV";

const FORBIDDEN = new Set(["Escape", "Tab", "Enter", "NumpadEnter", "Backspace", "Delete", "CapsLock", "ContextMenu", "PrintScreen", "NumLock", "ScrollLock", "Pause", "Insert", "Home", "End", "PageUp", "PageDown"]);
const MODIFIER = /^(Shift|Control|Alt|Meta|OS|Fn)/;

/** ¿Sirve esa tecla? Se descartan las que cambian el comportamiento del navegador o del teclado y las modificadoras. */
export function validPttCode(code: string | null | undefined): code is string {
  if (!code || code.length > 20) return false;
  if (FORBIDDEN.has(code) || MODIFIER.test(code)) return false;
  return /^(Key[A-Z]|Digit\d|Numpad[A-Za-z0-9]+|F\d{1,2}|Space|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|Arrow(Up|Down|Left|Right)|IntlBackslash)$/.test(code);
}

/** Lo que se lee del almacenamiento: una tecla válida o la de siempre (V). */
export const parsePtt = (raw: string | null): string => (validPttCode(raw) ? raw : DEFAULT_PTT);

const NAMED: Record<string, string> = {
  Space: "Espacio",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  IntlBackslash: "<",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/** Cómo se muestra la tecla: «V», «5», «F8», «Espacio», «Núm. 1». */
export function pttLabel(code: string): string {
  if (NAMED[code]) return NAMED[code];
  const key = /^Key([A-Z])$/.exec(code);
  if (key) return key[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const num = /^Numpad(\d)$/.exec(code);
  if (num) return `Núm. ${num[1]}`;
  return code;
}
