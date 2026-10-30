import { describe, expect, it } from "vitest";
import { leerEventosChat, parsearBloqueSSE, separarBloques } from "./leer-sse";

function stream(partes: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const p of partes) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

describe("separarBloques", () => {
  it("deja el bloque incompleto como resto", () => {
    expect(separarBloques('data: {"chunk":"a"}\n\ndata: {"chu')).toEqual({
      bloques: ['data: {"chunk":"a"}'],
      resto: 'data: {"chu',
    });
  });
});

describe("parsearBloqueSSE", () => {
  it("reconoce cada tipo de evento", () => {
    expect(parsearBloqueSSE('data: {"chunk":"Hola"}')).toEqual({ tipo: "chunk", texto: "Hola" });
    expect(parsearBloqueSSE('data: {"session":"s1"}')).toEqual({ tipo: "sesion", id: "s1" });
    expect(parsearBloqueSSE('data: {"error":"mal","sinReintento":true}')).toEqual({ tipo: "error", mensaje: "mal" });
    expect(parsearBloqueSSE('data: {"uso":{"usados":1}}')).toEqual({ tipo: "uso" });
    expect(parsearBloqueSSE('data: {"action":{"type":"ayuda_enviada","nombres":["Mica"]}}')).toEqual({
      tipo: "accion",
      accion: { type: "ayuda_enviada", nombres: ["Mica"] },
    });
    expect(parsearBloqueSSE("data: [DONE]")).toEqual({ tipo: "fin" });
  });
  it("ignora lo que no entiende", () => {
    expect(parsearBloqueSSE(": comentario")).toBeNull();
    expect(parsearBloqueSSE("data: {roto")).toBeNull();
    expect(parsearBloqueSSE("data: 5")).toBeNull();
    expect(parsearBloqueSSE('data: {"action":{"x":1}}')).toBeNull();
  });
});

describe("leerEventosChat", () => {
  it("junta eventos partidos entre lecturas y marca el fin", async () => {
    const eventos: string[] = [];
    const r = await leerEventosChat(
      stream(['data: {"chunk":"Ho', 'la"}\n\ndata: {"chunk":" Mica"}\n\n', "data: [DONE]\n\n"]),
      (e) => eventos.push(e.tipo === "chunk" ? e.texto : e.tipo)
    );
    expect(r.terminoBien).toBe(true);
    expect(eventos).toEqual(["Hola", " Mica", "fin"]);
  });
  it("sin [DONE] no terminó bien", async () => {
    const r = await leerEventosChat(stream(['data: {"chunk":"a"}\n\n']), () => {});
    expect(r.terminoBien).toBe(false);
  });
});
