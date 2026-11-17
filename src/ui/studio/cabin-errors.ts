/** Mensajes claros para los fallos de cámara y de red de «Cámara en cabina». */
export function cameraErrorMessage(e: unknown): string {
  const name = e instanceof DOMException || (e && typeof e === "object" && "name" in e) ? String((e as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "El navegador no tiene permiso para usar la cámara. Autorízala desde el candado de la barra de direcciones y vuelve a pulsar «Activar cámara».";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se encontró ninguna cámara disponible (o la elegida ya no está conectada).";
    case "NotReadableError":
    case "AbortError":
      return "La cámara está en uso por otra aplicación o pestaña. Ciérrala e inténtalo de nuevo.";
    default:
      return "No se pudo activar la cámara.";
  }
}

/** Respuesta de error de la API (sesión vencida, permisos, YouTube, relay…) → texto para la persona. */
export function apiErrorMessage(status: number, body: { error?: string } | null): string {
  if (status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión para transmitir.";
  if (body?.error) return body.error;
  if (status === 0) return "No se pudo conectar con el servidor. Revisa tu conexión a internet.";
  if (status >= 500) return `El servidor respondió con el error ${status} sin detalle (puede ser un tiempo de espera). Inténtalo de nuevo y, si se repite, avisa a quien administra el servidor.`;
  return "No se pudo completar la acción.";
}
