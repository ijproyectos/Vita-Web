# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Vita-Web ("vita.ia") es una app de salud personal — medicamentos, turnos médicos, perfil de salud, y un asistente de chat con IA ("vita") que puede leer y modificar esos datos. Nació como la reconstrucción del *dominio* de [`ijproyectos/Vitapp`](https://github.com/ijproyectos/Vitapp) (Flutter + Go + Python, en etapa temprana) sobre la arquitectura de NutrIA (Next.js + Supabase + Anthropic API), pero la UI/UX real terminó viniendo de un tercer diseño propio del usuario — ver "Identidad visual y funcionalidad" abajo, es la fuente de verdad actual, no el Flutter original.

A diferencia de NutrIA (multi-tenant, profesional↔paciente), Vita-Web es **single-tenant por usuario** — cada persona ve y gestiona solo sus propios datos, sin ningún rol ni jerarquía.

## Project state (2026-09-14)

**Reconstrucción completa sobre el diseño "vita.ia"** (`pantallas/Vitaoriginal/vita (1)/`, un export JSX real con toda la lógica de navegación en `vita.ia.html`) — reemplazó dos iteraciones de diseño anteriores en esta misma sesión (el Flutter original y un bundle brutalista intermedio, ninguno de los dos vigente). `apps/web/` es Next.js 16 (Turbopack, App Router) — build y lint limpios.

**Principio de alcance seguido**: `vita.ia.html` (el harness del diseño) es explícito sobre qué interacciones son reales (navegan a una pantalla) y cuáles son placeholders (`showToast('...próximamente')`, o ni tienen `onClick`) — se replicó esa misma frontera, no se fabricó funcionalidad real donde el propio diseño no la definió (Gmail/Apple Health/Google Fit, notificaciones push, monitoreo de métricas de salud, exportar datos/eliminar cuenta, micrófono). Única desviación deliberada: "Cerrar sesión" se hizo real (el archivo original no lo cablea a nada, es un descuido del mock, no una decisión de producto — toda app real necesita poder cerrar sesión).

**Identidad visual "Clinical Sanctuary"** (`src/app/globals.css`, reemplaza la navy/celeste del pase anterior) — teal `#0891b2`, fondo `#f7f9fb`, tarjetas blancas con sombra suave (sin bordes), radio 20px, tipografía Manrope (headings, peso 800) + Inter (cuerpo), botones/inputs pill. Como el resto de la app ya usaba tokens CSS, se re-tiñó casi todo con el cambio en `globals.css` + `layout.tsx` (fonts).

**Estructura de la app** — bottom nav de 4 pestañas (Inicio/Rutina/Mi Salud/Perfil) + FAB central que abre el chat con vita como **overlay** (no una ruta — `src/app/app/_chat/`, carpeta privada de Next.js con guion bajo). `src/app/app/layout.tsx` gatea todo `/app/*` detrás de `perfiles.onboarding_completado_at` — si falta, redirige a `/onboarding/nombre`.

**Pantallas reales:**
- **Onboarding** (`src/app/onboarding/{nombre,chat}/`) — paso 1 nombre, paso 2 encuesta scripteada (guion fijo, **no pasa por Anthropic** — es una simulación de conversación con chips, mismo criterio que el diseño) que siembra `condiciones`/`edad_rango` reales en `perfiles` y marca `onboarding_completado_at`.
- **Login** (`src/app/login/`) — **solo Google** (decisión explícita del usuario — Apple necesitaría infraestructura nueva de Sign in with Apple, no se agregó el botón).
- **Home** (`src/app/app/page.tsx`) — card de perfil (real, linkea a Resumen de salud), progreso de hoy (anillo real de adherencia), próximos turnos (scroll horizontal), medicamentos de hoy con toggle, nudge a vita.
- **Rutina** (`src/app/app/rutina/`) — timeline unificado medicamentos+turnos agrupado por momento del día (mañana/mediodía/tarde/noche — el diseño agregó "tarde" como 4to momento, no existía antes), toggle Hoy/Próximos días, sheet "Agregar a tu rutina".
- **Agregar medicamento / Agregar turno** (`src/app/app/agregar-{medicamento,turno}/`) — forms completos fieles al diseño (frecuencia, momentos multi-select, con qué comida, duración / especialidad, fecha+hora con chips rápidos, recordatorio, acompañado). El shortcut "Agregar por voz con vita" **es real** — abre el chat y las tools `add_medication`/`add_appointment` ya existen, así que pedírselo a vita en texto libre funciona de verdad, no es decorativo como en el mock.
- **Resumen de salud** (`src/app/app/resumen-salud/`) — perfil médico completo, **un solo formulario con un solo botón "Guardar cambios"** (ya no guardado campo-por-campo — pedido explícito del usuario). Género/grupo sanguíneo/obra social son `<select>` (`lib/perfil/opciones.ts`), no texto libre — antes había que escribirlos a mano. Condiciones/alergias siguen siendo acciones de lista inmediatas (agregar/quitar), no entran en el submit del form. "Exportar datos"/"Eliminar cuenta": no wireados, igual que el archivo original.
- **Mi Salud** (`src/app/app/mi-salud/`) — condiciones/alergias reales (mismo dato que Resumen). **Estudios médicos, real** (`src/app/app/mi-salud/agregar-estudio/`, `lib/estudios/`) — foto por cámara o galería (`capture="environment"`), sube a un bucket privado de Storage y **Anthropic con visión extrae tipo/fecha/resumen/valores automáticamente** (`lib/estudios/extraer.ts`); si la extracción falla por lo que sea, el estudio se guarda igual con `estado='error'` y la foto nunca se pierde. "Monitoreo activo" (métricas) sigue "Próximamente" — vacunas/consultas también, ninguna de las dos tiene pantalla de alta en el diseño ni se pidió.
- **Perfil** (`src/app/app/perfil/`) — hero con stats reales (racha de adherencia, años con vita), Conexiones/Notificaciones/Privacidad decorativas (fieles al mock), Cerrar sesión real.
- **Chat con vita** (`src/app/app/_chat/vita-chat-overlay.tsx`) — mantiene TODO lo real ya construido (Anthropic `claude-sonnet-5`, tool-calling, historial de sesiones persistido en `sesiones_chat`/`mensajes_chat`) — el overlay está **siempre montado** en el layout (oculto vía `transform`, no un mount/unmount condicional) para conservar la conversación entre aperturas. El drawer de historial se mantuvo aunque el diseño no lo muestre. Tarjetas de acción enriquecidas (`mensaje-burbuja.tsx`). **Sumó tools de perfil** (`update_health_profile`/`add_condition`/`add_allergy`) y `list_today_appointments` — "Actualizar con vita"/"Contame qué cambió" (en Resumen de salud) y "Contame mi día" (sugerencia nueva del chat) ahora funcionan de verdad, antes abrían el chat pero vita no tenía cómo escribir nada del perfil ni ver los turnos de hoy. **Modo voz manos-libres** (botón de micrófono en la barra de mensaje, al lado de enviar — no en el header, se movió ahí a pedido explícito del usuario para no tener que ir a buscarlo): activa un ciclo escuchar→grabar→transcribir→responder→hablar que se repite solo hasta que el usuario lo apaga — VAD por umbral de amplitud en el cliente (`lib/voz/usar-grabacion-voz.ts`, Web Audio `AnalyserNode`, sin dependencia nueva) detecta cuándo el usuario deja de hablar, corta el turno grabado con `MediaRecorder` y lo manda a `POST /api/voz/transcribir` (auth Supabase igual que `/api/chat`, transcribe con Whisper vía Groq — endpoint compatible con el formato de OpenAI, `fetch` directo sin agregar ningún SDK — en `lib/voz/nucleo.ts`). Se eligió Groq y no OpenAI directo porque OpenAI pide créditos pagos desde el primer request y Groq tiene free tier sin tarjeta. El transcript entra por el mismo `enviar()` de siempre (no hay un segundo path de envío). La respuesta de vita **ya no se lee con la voz de sistema del navegador** (`window.speechSynthesis` sonaba robótica, sin pausas — pedido explícito del usuario) — ahora se sintetiza server-side con **Deepgram Aura-2** (`POST /api/voz/hablar`, voz `aura-2-antonia-es`: femenina, acento argentino — confirmado contra `GET /v1/models` de Deepgram, no contra la doc genérica, es la única de las 17 voces en español del catálogo con `accent: "Argentine"`; se probó primero `sirio-es` pensando que era neutra y resultó ser acento mexicano) y se reproduce como mp3 con `<audio>` (`lib/voz/hablar-cliente.ts`). Antes de sintetizar se sacan los emojis del texto (`quitarEmojis` en `lib/voz/nucleo.ts`) — el TTS los pronunciaba como palabras ("emoji de mano saludando"); no se tocan en la burbuja del chat, solo en lo que se manda a Deepgram. Se descartó Groq para esto porque su TTS (Orpheus) es solo inglés/árabe, sin español. El desbloqueo de audio para Safari/iOS (llamada sincrónica dentro del click, antes de cualquier `await`) sigue siendo necesario y ahora desbloquea un `<audio>` en vez de `speechSynthesis` — son dos flags de permiso independientes en WebKit. **Habla por oración, no espera la respuesta entera**: `enviar()` acumula el texto en streaming y llama a `extraerFrasesListas()` en cada chunk (`lib/voz/hablar-cliente.ts`) — apenas se completa una oración (termina en `. ! ? …`) se encola para sintetizar (el fetch a Deepgram arranca ya, en paralelo a lo que se esté reproduciendo) y reproducir en orden; lo que queda sin punto final al cerrar el stream se habla igual al final. Antes esperaba el texto completo y recién ahí generaba un solo bloque de audio — se sentía "trabada" (silencio largo, después un chorro entero) — pedido explícito del usuario de que "conteste antes" y suene más fluida. Degrada explícito, nunca rompe el chat: sin `GROQ_API_KEY`/`DEEPGRAM_API_KEY`, sin micrófono, o si el navegador no soporta `MediaRecorder`/`getUserMedia`, avisa por toast (o simplemente no reproduce audio) y el usuario sigue viendo la respuesta en texto normal.
- **Responsive**: `viewport-fit=cover` explícito (`layout.tsx`) — sin esto, los `env(safe-area-inset-*)` que ya usaba el chat resolvían a 0 en iOS Safari. Padding/offset de safe-area centralizado en `--safe-bottom`/`--safe-bottom-nav` (`globals.css`), consumido por el bottom nav y las 3 barras de guardar fijas. Login/Onboarding ganaron el mismo `max-w-md` que ya tenía `/app/*`. `overflow-x: hidden` en `html,body` como red de seguridad.

## Decisiones tomadas explícitamente con el usuario — no reabrir sin motivo

- **El diseño `pantallas/Vitaoriginal/vita (1)/` es la fuente de verdad visual/funcional actual** — no el Flutter original ni el bundle brutalista intermedio, ambos explorados y descartados en esta misma sesión.
- **Login solo Google**, sin botón de Apple (necesitaría Sign in with Apple, infraestructura nueva).
- **Alcance fiel al propio mock**: no se construyó nada que el harness del diseño (`vita.ia.html`) deje como placeholder — ver la lista completa en "Fuera de alcance" abajo. Si se pide alguna de estas features, es una decisión de producto nueva, no "completar lo que faltaba".
- **Historial de chat real conservado** entre rediseños — pedido explícito la primera vez que se replanteó el diseño, sigue vigente.
- **`momento_dia` pasa a 4 valores** (se agregó `tarde`) — cambio de schema real, no solo de UI, porque el diseño nuevo agrupa la Rutina en 4 franjas horarias.
- **`frecuencia`/`duracion` siguen siendo descriptivas**, no gobiernan el scheduling real — eso lo sigue haciendo `hora_programada`+`dias_recurrentes`, igual que antes. El form nuevo simplifica lo que pide (sin selector de días de la semana) pero el motor de adherencia no perdió capacidad — sigue disponible para uso avanzado vía chat.
- **Estudios pasó de "fuera de alcance" a construido, a pedido explícito del usuario** (con extracción por IA, no solo la foto) — decisión tomada y confirmada antes de este pase, ver "Fuera de alcance" abajo (ya no incluye estudios, solo vacunas/consultas/monitoreo de métricas).

## Fuera de alcance (decisión, no olvido)

Ninguna de estas tiene un `onClick`/handler real en `vita.ia.html` tampoco:
- Integraciones Gmail / Apple Health / Google Fit (Perfil → Conexiones).
- Notificaciones push reales (los toggles de Perfil son decorativos, sin infraestructura de push conectada).
- Monitoreo de métricas de salud (presión/glucemia/peso) — sin tabla de datos ni pantalla de alta.
- Vacunas/consultas en Mi Salud — sin tabla de datos ni pantalla de alta (a diferencia de Estudios, que sí se construyó — ver "Project state").
- Exportar datos / eliminar cuenta.
- "Voy a ir acompañado" (turno) — se guarda el flag, no notifica a nadie.
- Rol Cuidador / vista de otra persona — no existe en este diseño (si aparece en un diseño futuro, es una decisión de producto nueva con RLS de lectura cruzada, no algo que se haya insinuado acá).

## Infra

**Supabase está vivo**: proyecto **VitaAPP-WEB**, ref `jvmsmrdddyxgdnyrqhqe` (región `us-west-2`, plan Free, org propia — no la de NutrIA), URL `https://jvmsmrdddyxgdnyrqhqe.supabase.co`. Local `supabase link`eado (`.git`-ignorado `supabase/.temp/`). **`001` a `007` aplicadas y verificadas** contra la DB en vivo (`supabase migration list --linked` confirma local=remote en las 7; verificado también por `psql` a través del pooler — `aws-0-us-west-2.pooler.supabase.com:5432`, user `postgres.jvmsmrdddyxgdnyrqhqe`, binario en `/opt/homebrew/Cellar/libpq/*/bin/psql` — que 7 tablas tienen `rowsecurity = true`, las columnas nuevas existen, y el bucket privado `estudios` + sus 3 policies de `storage.objects` están creados). Aplicado con `supabase db push --linked --password <db password>`. **La contraseña de la DB no se guarda en ningún archivo** — pedírsela al usuario cada vez que haga falta. El Personal Access Token de la Management API usado en sesiones anteriores venció — si hace falta esa vía de nuevo, pedir uno nuevo.

`.env.local` (raíz, gitignored, symlink en `apps/web/`) tiene `NEXT_PUBLIC_SUPABASE_URL` y las dos API keys (legacy JWT `anon`/`service_role`).

**Auth con Google activado y verificado**, `site_url`/`uri_allow_list` apuntando a `https://vitappweb.netlify.app`.

**Netlify está vivo**: sitio `vitappweb` (`site_id` `3c956a4d-b077-4ef4-a6e0-b6cef204ed44`, cuenta `ijsociety-exe`), conectado a `ijproyectos/Vita-Web` rama `main` (auto-deploy). `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY` y `DEEPGRAM_API_KEY` cargadas en Netlify (scope "All") — el chat con vita, la extracción automática de estudios y el modo voz (transcripción vía Groq, síntesis de voz vía Deepgram) ya tienen lo que necesitan en producción. `OPENAI_API_KEY` quedó cargada pero sin uso real (la cuenta de OpenAI del usuario no tiene créditos — el módulo de voz corre sobre Groq y Deepgram, no OpenAI).

**Pendiente, acción del usuario:**
- [ ] Agregar `DEEPGRAM_API_KEY` a `.env.local` (Claude no tiene permiso para escribir ese archivo — se cargó en Netlify pero falta en local; `GROQ_API_KEY` ya se agregó a mano en un pase anterior).
- [ ] Probar el login con Google y el recorrido completo de punta a punta en https://vitappweb.netlify.app/ (nunca se probó con un navegador real).

## Stack

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS 4 + Google Fonts Manrope/Inter + Lucide icons (vía `lib/vita-icons.tsx`, mapeo del set custom del diseño), sobre Supabase (Postgres, Auth, Row Level Security) + Anthropic API (`claude-sonnet-5`), hosted on Netlify (`netlify.toml`, `base = apps/web`). Sonner para toasts. shadcn/ui (`base-nova`, `@base-ui/react`) solo para `Sheet` (drawers/bottom sheets) — el resto de la UI de este pase es a medida, calcada del diseño.

## Running the app

```bash
cd apps/web
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

**Next.js 16**: revisar `apps/web/node_modules/next/dist/docs/` antes de escribir código de App Router que no sea un tweak chico — hay breaking changes reales respecto al training data (ver `apps/web/AGENTS.md`, generado por el propio `next dev`).

## Docs map

- `docs/data-model.md` — tablas, columnas, RLS.
- `supabase/migrations/` — `001` a `007`.
- **Identidad visual y funcionalidad**: fuente de verdad es `pantallas/Vitaoriginal/vita (1)/` (12 archivos `.jsx` + `styles.css` + `vita.ia.html`, no está en el repo — vive fuera de `apps/web`, en la raíz del proyecto). Si hace falta reconfirmar un color/copy/flujo, mirar ahí, no inventar ni asumir que sigue siendo el Flutter original o el diseño brutalista de un pase anterior (ambos descartados).

## Notas para código futuro en este repo

- **Núcleo de dominio separado de la UI y del chat**: `lib/medicamentos/nucleo.ts`, `lib/turnos/nucleo.ts`, `lib/perfil/nucleo.ts` — funciones puras `(supabase, usuarioId, ...) => resultado`, consumidas tanto por Server Actions como por tools de chat en `lib/ai/tools.ts`. No implementar la misma operación dos veces.
- **`lib/rutina/momento.ts`** — `momentoDelDia(hora)` deriva mañana/mediodía/tarde/noche desde una hora "HH:MM"; usado tanto por medicamentos (el form nuevo no pide momento_dia directo, lo infiere) como por turnos (que no tienen columna propia, se agrupan en la Rutina con este mismo criterio).
- **`useChatOverlay()`** (`lib/chat/overlay-context.tsx`) — para abrir el chat con vita desde cualquier pantalla (`abrir(mensajeOpcionalDeVita)`). El mensaje opcional se agrega como si vita lo preguntara, nunca se auto-envía nada en nombre del usuario (evita una llamada a la API sin que el usuario haya tocado nada).
- **Server Actions nunca lanzan** — devuelven `{status: "success"|"error", ...}` (`EstadoAccion` en `rutina/actions.ts`). Cualquier campo dentro de un `<form action={fn}>` tiene que ser controlado, no `defaultValue`.
- **`setState` síncrono en el cuerpo de un `useEffect` dispara `react-hooks/set-state-in-effect`** — patrón usado para resolverlo en este repo: si el estado solo necesita "no volver a pedir esto", usar un `useRef` en vez de `useState` (no es reactivo, no cae en la regla); si el estado SÍ es visible en el render (ej. "escribiendo…"), inicializarlo con el valor correcto en el `useState` inicial y mover cualquier "reactivación" al event handler que dispara el cambio (nunca al cuerpo del efecto) — ver `_chat/vita-chat-overlay.tsx` y `onboarding/chat/encuesta.tsx` para los dos casos reales.
- **Asignar a un ref durante el render** (`ref.current = x` fuera de un handler/efecto) dispara `react-hooks/refs` — solo asignar refs dentro de event handlers o efectos.
- **`Date.now()`/`Math.random()` en el cuerpo de un Server Component** disparan el lint de pureza — usar `new Date()` en su lugar (sí lo tolera).
- **`<Button render={...}>` con algo que no sea un `<button>` real** (ej. `<Link>`) necesita `nativeButton={false}` explícito.
- **Un `<option>` "Otra" con texto libre nunca debe usar ese mismo texto como `value`** — si el dato viejo (de antes de existir el picker) resultara ser literalmente igual al label de esa opción, el form la interpreta como "elegiste Otra, especificá" y vacía el campo de texto libre, borrando el dato al guardar. Usar un `value` interno que no pueda colisionar (`OTRA_PREPAGA` en `lib/perfil/opciones.ts` es el ejemplo real).
- **Un valor extraído por IA que va directo a una columna tipada** (`date`, `numeric`, etc.) siempre se valida/parsea antes del insert, nunca se manda tal cual — el schema de zod de la tool solo le pide el formato al modelo en la descripción, no lo garantiza. Si el insert falla por eso, se pierde toda la extracción (y un archivo ya subido queda huérfano) por un solo campo con formato raro. Ver `fechaValidaOnull` en `lib/estudios/nucleo.ts`.
- **Nunca asumir el `mediaType`/mime type real de un archivo subido por el usuario** — si no está en la lista de tipos que soporta la API (ej. HEIC de iPhone), declinar explícito en vez de mandarlo igual etiquetado como otra cosa (ver `TIPOS_SOPORTADOS` en `lib/estudios/extraer.ts`).
