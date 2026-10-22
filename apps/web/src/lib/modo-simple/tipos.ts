// Tipos y defaults de la configuración del modo simple (migración 029). Sin
// `server-only`: los usa la pantalla de la persona y el configurador (cliente).

export const POSPONER_OPCIONES = [15, 30, 60] as const;
export type MinutosPosponer = (typeof POSPONER_OPCIONES)[number];

export type PrefsModoSimple = {
  ver_turnos: boolean;
  ver_mediciones: boolean;
  charlar: boolean;
  ayuda: boolean;
  voz: boolean;
  voz_lenta: boolean;
  posponer: boolean;
  posponer_min: MinutosPosponer;
  /** A quién llama Ayuda. Ambos null = el contacto de emergencia del perfil. */
  llamar_nombre: string | null;
  llamar_telefono: string | null;
};

export const PREFS_POR_DEFECTO: PrefsModoSimple = {
  ver_turnos: true,
  ver_mediciones: true,
  charlar: true,
  ayuda: true,
  voz: true,
  voz_lenta: false,
  posponer: true,
  posponer_min: 15,
  llamar_nombre: null,
  llamar_telefono: null,
};

export const CLAVES_BOOLEANAS_MS = ["ver_turnos", "ver_mediciones", "charlar", "ayuda", "voz", "voz_lenta", "posponer"] as const;
export type ClaveBooleanaMS = (typeof CLAVES_BOOLEANAS_MS)[number];

export type ParcheModoSimple = Partial<PrefsModoSimple>;

/** Velocidad de reproducción de "voz más lenta" (pitch preservado donde el navegador lo permite). */
export const VELOCIDAD_VOZ_LENTA = 0.8;

export function esMinutosPosponer(v: unknown): v is MinutosPosponer {
  return typeof v === "number" && (POSPONER_OPCIONES as readonly number[]).includes(v);
}
