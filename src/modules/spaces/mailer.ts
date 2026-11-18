/**
 * Envío de correo (verificación y recuperación de contraseña) por la API HTTPS de Resend: sin dependencias nuevas.
 * Variables: RESEND_API_KEY y EMAIL_FROM (p. ej. «StereoFace <no-reply@stereoface.online>», con el dominio verificado en Resend).
 * Sin ellas el envío está DESACTIVADO: no se exige verificar el correo y la recuperación avisa que no está disponible.
 */
export type Mail = { to: string; subject: string; text: string };
export type Mailer = { configured: boolean; send: (mail: Mail) => Promise<void> };

export function createMailer(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Mailer {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!key || !from) return { configured: false, send: async () => undefined };
  return {
    configured: true,
    async send(mail) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(10_000),
      });
      // Nunca se registra el cuerpo ni el destinatario: puede llevar datos personales.
      if (!res.ok) throw new Error(`El proveedor de correo respondió ${res.status}`);
    },
  };
}
