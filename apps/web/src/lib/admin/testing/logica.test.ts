import { describe, expect, it } from "vitest";
import {
  cambiosDeBug,
  esBugCerrado,
  estadoDeCaso,
  filtrarBugs,
  filtrarCasos,
  nombreSeguro,
  normalizarEmail,
  ordenarBugs,
  puedePasarBug,
  resumir,
  resumirRonda,
  rutaAdjuntoValida,
  tasaOk,
  transicionesBug,
  ultimaPruebaPorCaso,
  validarAdjunto,
  validarBug,
  validarPrueba,
  validarReporte,
  validarRonda,
  type Asignacion,
  type Bug,
  type Caso,
  type Prueba,
} from "./logica";

const caso = (id: number, area: string, extra: Partial<Caso> = {}): Caso => ({
  id,
  codigo: `T-${id}`,
  area,
  funcionalidad: `Func ${id}`,
  prioridad: "Media",
  precondicion: "",
  pasos: "",
  esperado: "",
  posicion: id,
  archivado: false,
  ...extra,
});

const prueba = (id: number, caso_id: number, estado: Prueba["estado"], extra: Partial<Prueba> = {}): Prueba => ({
  id,
  caso_id,
  estado,
  resultado: "",
  dispositivo: "",
  admin_email: "a@x.com",
  ronda_id: null,
  asignacion_id: null,
  bug_id: null,
  fecha: "2026-11-16",
  created_at: `2026-11-16T10:00:0${id}Z`,
  ...extra,
});

const bug = (id: number, extra: Partial<Bug> = {}): Bug => ({
  id,
  codigo: `B-${id}`,
  caso_id: null,
  titulo: "t",
  pasos: "",
  actual: "",
  esperado: "",
  severidad: "Media",
  dispositivo: "",
  enlace: "",
  estado: "Abierto",
  responsable_email: null,
  reportado_por: "",
  recibido_por_email: null,
  ticket_externo: "",
  notas: "",
  creado_por: "a@x.com",
  created_at: "2026-11-16T10:00:00Z",
  ...extra,
});

describe("estado de los casos", () => {
  it("toma la última prueba y Pendiente si no hay", () => {
    const ultima = ultimaPruebaPorCaso([prueba(1, 1, "Falla"), prueba(2, 1, "OK")]);
    expect(estadoDeCaso(ultima.get(1))).toBe("OK");
    expect(estadoDeCaso(ultima.get(2))).toBe("Pendiente");
  });

  it("resume por área, ignora archivados y calcula la tasa de OK", () => {
    const casos = [caso(1, "Acceso"), caso(2, "Acceso"), caso(3, "Rutina"), caso(4, "Rutina", { archivado: true })];
    const r = resumir(casos, [prueba(1, 1, "OK"), prueba(2, 2, "Falla")], [bug(1), bug(2, { estado: "Verificado" })], []);
    expect(r.total).toBe(3);
    expect(r.conteo.Pendiente).toBe(1);
    expect(r.avance).toBeCloseTo(2 / 3);
    expect(r.tasaOk).toBe(50);
    expect(r.porArea.map((a) => a.area)).toEqual(["Acceso", "Rutina"]);
    expect(r.porArea[1].tasaOk).toBeNull();
    expect(r.bugsAbiertos).toBe(1);
  });

  it("la tasa de OK no cuenta pendientes ni no aplica", () => {
    expect(tasaOk({ Pendiente: 5, OK: 1, Falla: 0, Bloqueado: 2, "No aplica": 4 })).toBe(33.3);
    expect(tasaOk({ Pendiente: 5, OK: 0, Falla: 0, Bloqueado: 0, "No aplica": 4 })).toBeNull();
  });
});

describe("rondas", () => {
  it("cuenta cada asignación con su última prueba, partida por área", () => {
    const casos = new Map([1, 2, 3].map((i) => [i, caso(i, i === 3 ? "Turnos" : "Acceso")]));
    const asignaciones: Asignacion[] = [
      { id: 10, ronda_id: 1, caso_id: 1, admin_email: "a@x.com", dispositivo: "iPhone" },
      { id: 11, ronda_id: 1, caso_id: 1, admin_email: "b@x.com", dispositivo: "Android" },
      { id: 12, ronda_id: 1, caso_id: 3, admin_email: "a@x.com", dispositivo: "" },
      { id: 13, ronda_id: 1, caso_id: 99, admin_email: null, dispositivo: "" },
    ];
    const pruebas = [prueba(1, 1, "Falla", { asignacion_id: 10 }), prueba(2, 1, "OK", { asignacion_id: 10 }), prueba(3, 1, "Falla", { asignacion_id: 11 })];
    const r = resumirRonda(asignaciones, pruebas, casos);
    expect(r.total).toBe(3);
    expect(r.conteo).toMatchObject({ OK: 1, Falla: 1, Pendiente: 1 });
    expect(r.porArea.find((a) => a.area === "Acceso")?.tasaOk).toBe(50);
    expect(r.porArea.find((a) => a.area === "Turnos")?.total).toBe(1);
  });
});

describe("filtros", () => {
  const casos = [caso(1, "Acceso", { funcionalidad: "Código incorrecto" }), caso(2, "Rutina")];
  const ultima = ultimaPruebaPorCaso([prueba(1, 1, "OK")]);
  it("filtra por área, estado y texto sin acentos", () => {
    expect(filtrarCasos(casos, ultima, { area: "Rutina" }).map((c) => c.id)).toEqual([2]);
    expect(filtrarCasos(casos, ultima, { estado: "Pendiente" }).map((c) => c.id)).toEqual([2]);
    expect(filtrarCasos(casos, ultima, { q: "codigo" }).map((c) => c.id)).toEqual([1]);
  });
  it("filtra y ordena bugs por gravedad", () => {
    const bugs = [bug(1, { severidad: "Baja" }), bug(2, { severidad: "Crítica", estado: "En arreglo" }), bug(3, { estado: "Descartado" })];
    expect(filtrarBugs(bugs, { estado: "abiertos" }).map((b) => b.id)).toEqual([1, 2]);
    expect(filtrarBugs(bugs, { severidad: "Crítica" }).map((b) => b.id)).toEqual([2]);
    expect(ordenarBugs(bugs).map((b) => b.id)).toEqual([2, 3, 1]);
  });
});

describe("estados de bug", () => {
  it("solo permite pasos coherentes", () => {
    expect(puedePasarBug("Abierto", "Verificado")).toBe(false);
    expect(puedePasarBug("Arreglado", "Verificado")).toBe(true);
    expect(puedePasarBug("Verificado", "Abierto")).toBe(true);
    expect(puedePasarBug("Abierto", "Abierto")).toBe(true);
    expect(transicionesBug("Descartado")).toEqual(["Abierto"]);
  });
  it("cerrado = verificado o descartado", () => {
    expect(esBugCerrado("Verificado")).toBe(true);
    expect(esBugCerrado("Arreglado")).toBe(false);
  });
  it("detecta los cambios que van al historial", () => {
    const antes = bug(1);
    const despues = bug(1, { estado: "En arreglo", responsable_email: "a@x.com", notas: "otra nota" });
    expect(cambiosDeBug(antes, despues)).toEqual([
      { campo: "Estado", anterior: "Abierto", nuevo: "En arreglo" },
      { campo: "Quién lo arregla", anterior: null, nuevo: "a@x.com" },
    ]);
  });
});

describe("validaciones", () => {
  it("normaliza emails", () => {
    expect(normalizarEmail("  Mica@Vita.COM ")).toBe("mica@vita.com");
    expect(normalizarEmail("nada")).toBeNull();
  });
  it("una falla exige contar qué pasó", () => {
    expect(validarPrueba({ estado: "Falla", resultado: " ", dispositivo: "" }).ok).toBe(false);
    expect(validarPrueba({ estado: "OK", resultado: "", dispositivo: "iPhone" }).ok).toBe(true);
    expect(validarPrueba({ estado: "Pasó", resultado: "", dispositivo: "" }).ok).toBe(false);
  });
  it("valida el bug", () => {
    expect(validarBug({ titulo: "", severidad: "Alta" }).ok).toBe(false);
    expect(validarBug({ titulo: "x", severidad: "Rara" }).ok).toBe(false);
    expect(validarBug({ titulo: "x", severidad: "Alta", enlace: "javascript:alert(1)" }).ok).toBe(false);
    expect(validarBug({ titulo: "x", severidad: "Alta", responsable_email: "malo" }).ok).toBe(false);
    const ok = validarBug({ titulo: " x ", severidad: "Alta", caso_id: "12", responsable_email: "A@x.com", enlace: "https://a.b/c" });
    expect(ok).toMatchObject({ ok: true, datos: { titulo: "x", caso_id: 12, responsable_email: "a@x.com" } });
  });
  it("valida la ronda y el reporte", () => {
    expect(validarRonda({ nombre: "" }, "2026-11-16").ok).toBe(false);
    expect(validarRonda({ nombre: "R1", desde: "2026-11-10", hasta: "2026-11-01" }, "2026-11-16").ok).toBe(false);
    expect(validarRonda({ nombre: "R1" }, "2026-11-16")).toMatchObject({ ok: true, datos: { desde: "2026-11-16", hasta: null } });
    expect(validarRonda({ nombre: "R1", desde: "2026-02-31" }, "2026-11-16").ok).toBe(false);
    expect(validarReporte({ canal: "WhatsApp", severidad: "Media", paso: "" }, "2026-11-16").ok).toBe(false);
    expect(validarReporte({ canal: "WhatsApp", severidad: "Media", paso: "se cierra" }, "2026-11-16").ok).toBe(true);
  });
  it("limita tipo y tamaño de los adjuntos", () => {
    expect(validarAdjunto("image/png", 1000).ok).toBe(true);
    expect(validarAdjunto("application/pdf", 1000).ok).toBe(false);
    expect(validarAdjunto("video/mp4", 26 * 1024 * 1024).ok).toBe(false);
    expect(validarAdjunto("video/mp4", 0).ok).toBe(false);
  });
  it("arma nombres y rutas seguras", () => {
    expect(nombreSeguro("Captura Pantalla ñ (1).PNG")).toBe("captura-pantalla-n-1-.png");
    expect(nombreSeguro("///")).toBe("archivo");
    expect(rutaAdjuntoValida("adjuntos/123e4567-e89b-12d3-a456-426614174000-a.png")).toBe(true);
    expect(rutaAdjuntoValida("../otra/123e4567-e89b-12d3-a456-426614174000-a.png")).toBe(false);
    expect(rutaAdjuntoValida("adjuntos/x/../y.png")).toBe(false);
  });
});
