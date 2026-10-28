/* Service worker de vita: solo maneja Web Push y el click en la notificación.
 * No cachea nada ni intercepta fetch — la app sigue siendo online-first. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { body: event.data ? event.data.text() : "" };
  }

  const titulo = datos.title || "vita";
  const opciones = {
    body: datos.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    // Mismo tag = la notificación de esa dosis se reemplaza, no se apila.
    tag: datos.tag || "vita",
    // Con el mismo tag, renotify hace que el segundo aviso vuelva a sonar.
    renotify: Boolean(datos.renotify),
    data: { url: datos.url || "/app", datos: datos.datos || {} },
  };
  if (Array.isArray(datos.actions) && datos.actions.length > 0) {
    opciones.actions = datos.actions.slice(0, 2);
  }
  if (datos.requireInteraction) {
    // La "alarma a pantalla completa" del diseño NO es posible en una PWA: el
    // navegador no deja a una web ocupar la pantalla ni sonar por su cuenta
    // desde el service worker. Lo más cercano que sí existe: la notificación
    // no se cierra sola hasta que la persona la toca (requireInteraction) y
    // vibra en patrón (se ignora en iOS/desktop).
    opciones.requireInteraction = true;
    opciones.vibrate = [250, 120, 250, 120, 250];
  }

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

// Botones "Ya la tomé" / "En 15 min": POST a /api/avisos/accion con la cookie
// de sesión (mismo origen). Sin sesión o con cualquier error se abre la app en
// la pantalla de la dosis para resolverlo ahí.
async function accionDeDosis(notificacion, accion) {
  const datos = (notificacion.data && notificacion.data.datos) || {};
  const medicamentoId = datos.medicamentoId;
  const origen = self.location.origin;
  const pantallaDosis = new URL("/app/modo-simple", origen).href;

  if (!medicamentoId) {
    await abrirApp(pantallaDosis);
    return;
  }

  let exito = false;
  try {
    const respuesta = await fetch("/api/avisos/accion", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      // `fecha` = el día AR de la dosis: el servidor no marca otra distinta.
      body: JSON.stringify({ medicamentoId, accion, fecha: datos.fecha }),
    });
    exito = respuesta.ok;
  } catch {
    exito = false;
  }

  if (!exito) {
    await abrirApp(pantallaDosis);
    return;
  }

  // Confirmación breve (reemplaza la notificación por tag) que se cierra sola.
  const tag = notificacion.tag || "vita";
  await self.registration.showNotification(accion === "tomada" ? "Listo, anotamos tu toma" : "Te aviso de nuevo en 15 min", {
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag,
    silent: true,
    data: { url: "/app", datos: {} },
  });
  await new Promise((resolver) => setTimeout(resolver, 4000));
  const abiertas = await self.registration.getNotifications({ tag });
  abiertas.forEach((n) => n.close());
}

async function abrirApp(destino) {
  const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const ventana of ventanas) {
    if (new URL(ventana.url).origin === self.location.origin) {
      await ventana.focus();
      if ("navigate" in ventana) await ventana.navigate(destino);
      return;
    }
  }
  await self.clients.openWindow(destino);
}

self.addEventListener("notificationclick", (event) => {
  const notificacion = event.notification;
  notificacion.close();

  if (event.action === "tomada" || event.action === "posponer") {
    event.waitUntil(accionDeDosis(notificacion, event.action));
    return;
  }

  if (event.action === "como-llegar") {
    const mapsUrl = notificacion.data && notificacion.data.datos && notificacion.data.datos.mapsUrl;
    if (typeof mapsUrl === "string" && mapsUrl.startsWith("https://")) {
      event.waitUntil(self.clients.openWindow(mapsUrl));
      return;
    }
  }

  const destino = new URL((notificacion.data && notificacion.data.url) || "/app", self.location.origin).href;
  event.waitUntil(abrirApp(destino));
});
