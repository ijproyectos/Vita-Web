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
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.body || "",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      // Mismo tag = la notificación de esa dosis se reemplaza, no se apila.
      tag: datos.tag || "vita",
      renotify: false,
      data: { url: datos.url || "/app" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const ventana of ventanas) {
        if (new URL(ventana.url).origin === self.location.origin) {
          await ventana.focus();
          if ("navigate" in ventana) await ventana.navigate(destino);
          return;
        }
      }
      await self.clients.openWindow(destino);
    })()
  );
});
