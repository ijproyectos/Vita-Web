import { expect, it } from "vitest";
import { mensajeInvitacionCuidador, urlDeInvitacion } from "./enlace";
import { invitacionCuidador } from "@/lib/email/plantillas/invitacion-cuidador";

it("usa el link corto si hay código y el largo si no", () => {
  expect(urlDeInvitacion("https://x.ar/", { token: "abc", codigo: "482916" })).toBe("https://x.ar/c/482916");
  expect(urlDeInvitacion("https://x.ar", { token: "abc", codigo: null })).toBe("https://x.ar/cuidar/invitacion/abc");
});

it("el WhatsApp lleva link, código de respaldo y qué mail usar", () => {
  const m = mensajeInvitacionCuidador({ persona: "Jesus", url: "https://x.ar/c/482916", codigo: "482916", email: "m@g.com" });
  expect(m).toContain("a cuidar a Jesus");
  expect(m).toContain("código 482916");
  expect(m).toContain("m@g.com");
  expect(mensajeInvitacionCuidador({ persona: null, url: "u", email: "m@g.com" })).toContain("a cuidarme");
});

it("al Lector el mail no le promete cargar nada", () => {
  const base = { nombreElder: "Marta", urlInvitacion: "https://x.ar/c/1", diasVigencia: 7, origen: "https://x.ar" };
  expect(invitacionCuidador({ ...base, rol: "ver" }).texto).toContain("sin cambiar nada");
  expect(invitacionCuidador({ ...base, rol: "editar" }).texto).toContain("cargar y cambiar");
  expect(invitacionCuidador({ ...base, rol: "ver" }).texto).not.toContain("cargarle");
});
