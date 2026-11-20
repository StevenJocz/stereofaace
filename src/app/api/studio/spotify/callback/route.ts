/**
 * Vuelta de Spotify tras autorizar. El sitio usa COOP «same-origin», así que la ventana emergente no puede hablar con el estudio
 * por `window.opener`: entrega el resultado por BroadcastChannel (mismo origen) y se cierra. El estudio comprueba `state`
 * y canjea el código; esta página no guarda ni envía nada a ningún servidor.
 */
const HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Spotify</title></head>
<body style="font-family:system-ui,sans-serif;background:#07080a;color:#f2f2ee;display:grid;place-items:center;min-height:100vh;margin:0">
<p id="m">Conectando con Spotify…</p>
<script>
(function () {
  var p = new URLSearchParams(location.search);
  try {
    var c = new BroadcastChannel("sf-spotify-auth");
    c.postMessage({ code: p.get("code"), state: p.get("state"), error: p.get("error") });
    c.close();
    document.getElementById("m").textContent = p.get("code") ? "Listo. Ya puedes cerrar esta ventana." : "No se concedió el permiso. Ya puedes cerrar esta ventana.";
  } catch (e) {
    document.getElementById("m").textContent = "Este navegador no permite completar la conexión.";
  }
  history.replaceState(null, "", location.pathname);
  setTimeout(function () { window.close(); }, 400);
})();
</script>
</body></html>`;

export function GET() {
  return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
