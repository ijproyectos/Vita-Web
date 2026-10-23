"use client";

import { useState } from "react";
import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { CORREO_SOPORTE } from "@/lib/legal/datos";

type Pregunta = { q: string; a: string; link?: { texto: string; href: string } };

// Copy del V7 (VitaApp › Ayuda › Preguntas frecuentes), ajustado a lo que vita
// hace hoy: sin planes de pago (vita+ todavía no está disponible).
const GRUPOS: { titulo: string; items: Pregunta[] }[] = [
  {
    titulo: "Remedios y avisos",
    items: [
      {
        q: "¿Qué pasa si no confirmo una toma?",
        a: "Te aviso de nuevo. Si alguien te cuida, le aviso también cuando pasa la espera (por defecto 30 minutos). Ese tiempo lo podés cambiar.",
        link: { texto: "Configurar avisos", href: "/app/avisos/configuracion" },
      },
      {
        q: "¿Puedo cambiar el horario de un remedio?",
        a: "Sí. Entrá a Mis medicamentos, tocá el lápiz del remedio y cambiá sus horarios. También podés pedírselo a vita: “pasá el Losartán a las 9”.",
        link: { texto: "Mis medicamentos", href: "/app/medicamentos" },
      },
      {
        q: "¿Cómo sé cuántas pastillas me quedan?",
        a: "Sacale una foto al blister cuando lo empezás. Voy contando las tomas y te aviso antes de que se termine.",
        link: { texto: "Mis pastillas", href: "/app/pastillas" },
      },
      {
        q: "No me llegan los avisos",
        a: "Revisá que vita tenga los avisos permitidos en el celular y que no esté en modo silencio. En iPhone, primero agregá vita a tu pantalla de inicio.",
        link: { texto: "Activar avisos", href: "/app/perfil" },
      },
    ],
  },
  {
    titulo: "Familia",
    items: [
      {
        q: "¿Cómo sumo a alguien para que me ayude a cuidar?",
        a: "Desde Familia y permisos, con «Invitar a un cuidador». Le llega un mail con un link (también lo podés mandar por WhatsApp) y, cuando lo acepta, ve los remedios y recibe los avisos.",
        link: { texto: "Familia y permisos", href: "/app/familia" },
      },
      {
        q: "¿Qué diferencia hay entre Admin y Lector?",
        a: "El Admin puede cargar y cambiar todo. El Lector solo mira y recibe los avisos. Lo decide la persona cuidada o, si es un perfil que llevás vos, un Admin, en Familia.",
        link: { texto: "Familia", href: "/app/familia" },
      },
      {
        q: "¿Cómo conecto el celular de mi mamá?",
        a: "Entrá a su perfil en Familia y tocá “Conectar”. Le pasás un código y listo.",
        link: { texto: "Familia", href: "/app/familia" },
      },
      {
        q: "¿Qué es el modo simple?",
        a: "Una pantalla con letras grandes y solo lo de hoy: qué tomar, cuándo y un botón para avisar que ya lo tomó.",
        link: { texto: "Abrir modo simple", href: "/app/modo-simple" },
      },
    ],
  },
  {
    titulo: "Salud",
    items: [
      {
        q: "¿Vita reemplaza al médico?",
        a: "No. Ordena tus datos y te los resume, pero las decisiones las toma tu médico.",
      },
      {
        q: "¿Cómo cargo un estudio?",
        a: "En Mi Salud tocá el + y elegí Estudio. Podés sacarle una foto al papel o subir el PDF; vita completa el tipo, la fecha y los valores.",
        link: { texto: "Agregar estudio", href: "/app/mi-salud/agregar-estudio" },
      },
    ],
  },
  {
    titulo: "Cuenta y datos",
    items: [
      {
        q: "¿Mis datos están seguros? ¿Puedo borrarlos?",
        a: "No los vendemos ni los compartimos fuera de la gente que vos elijas. Podés descargarlos o borrar tu historial cuando quieras, o eliminar la cuenta entera.",
        link: { texto: "Privacidad y datos", href: "/app/perfil/privacidad" },
      },
      {
        q: "¿Puedo proteger vita con un PIN?",
        a: "Sí. En Seguridad activás un PIN de 4 números que se pide al volver a abrir vita en ese dispositivo. El PIN queda guardado solo en tu celular.",
        link: { texto: "Seguridad", href: "/app/perfil/seguridad" },
      },
    ],
  },
];

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function PreguntasFrecuentes() {
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const nq = normalizar(busqueda.trim());

  const grupos = GRUPOS.map((g, gi) => ({
    titulo: g.titulo,
    items: g.items.map((p, i) => ({ p, id: `${gi}-${i}` })).filter(({ p }) => !nq || normalizar(`${p.q} ${p.a}`).includes(nq)),
  })).filter((g) => g.items.length > 0);
  const total = grupos.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <div className="flex items-center gap-2.5 rounded-full bg-card px-4 shadow-card focus-within:ring-2 focus-within:ring-ring/50">
        <VitaIcon name="search" size={17} className="shrink-0 text-subtle" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setAbierta(null);
          }}
          placeholder="Buscá tu duda"
          aria-label="Buscar en las preguntas frecuentes"
          className="min-w-0 flex-1 bg-transparent py-3.5 text-sm font-semibold outline-none"
        />
      </div>

      {grupos.length === 0 && (
        <div className="rounded-[20px] bg-card px-[18px] py-[22px] text-center text-[13.5px] font-semibold leading-[1.45] text-subtle shadow-card">
          No encontré nada con eso. Probá con otra palabra o escribinos.
        </div>
      )}

      {grupos.map((g) => (
        <section key={g.titulo}>
          <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">{g.titulo}</h2>
          <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {g.items.map(({ p, id }) => {
              const abierto = abierta === id || (!!nq && total === 1);
              return (
                <div key={id} className="[&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
                  <button
                    type="button"
                    aria-expanded={abierto}
                    onClick={() => setAbierta(abierto ? null : id)}
                    className="flex w-full items-center gap-3 px-4 py-[15px] text-left"
                  >
                    <span className="min-w-0 flex-1 text-pretty font-heading text-sm font-extrabold leading-[1.35] tracking-[-0.01em]">{p.q}</span>
                    <VitaIcon
                      name="chevron-down"
                      size={17}
                      className={cn("shrink-0 text-subtle transition-transform motion-reduce:transition-none", abierto && "rotate-180")}
                    />
                  </button>
                  {abierto && (
                    <div className="flex flex-col items-start gap-2 px-4 pb-[15px]">
                      <p className="text-pretty text-[13px] font-medium leading-[1.5] text-slate-brand">{p.a}</p>
                      {p.link && (
                        <Link href={p.link.href} className="text-[13px] font-extrabold text-teal-deep">
                          {p.link.texto} →
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-3 rounded-[20px] bg-card p-4 shadow-card">
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">¿No encontraste lo que buscabas?</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Respondemos en menos de 24 horas</div>
        </div>
        <a href={`mailto:${CORREO_SOPORTE}`} className="shrink-0 rounded-full bg-primary px-4 py-[11px] text-[13.5px] font-extrabold text-primary-foreground">
          Escribinos
        </a>
      </div>
    </>
  );
}
