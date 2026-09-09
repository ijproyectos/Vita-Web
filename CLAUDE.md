# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Vitapp es una app de salud personal — gestión de medicamentos con un asistente de chat con IA que puede leer y modificar esos datos. Es la reconstrucción del *dominio* de [`ijproyectos/Vitapp`](https://github.com/ijproyectos/Vitapp) (un monorepo Flutter + Go/Gin/GORM + Python FastAPI/LangGraph, en etapa temprana — auth completo pero casi ningún endpoint de dominio construido) sobre la misma arquitectura que [NutrIA](https://github.com/ijproyectos/nutreAPP): Next.js + Supabase (Postgres/Auth/RLS) + Anthropic API, deploy Netlify vía GitHub. Decisión explícita del usuario: no migrar código (Flutter/Go/Python), migrar el *modelo* a un stack distinto.

A diferencia de NutrIA (multi-tenant, profesional↔paciente), Vitapp es **single-tenant por usuario** — cada persona ve y gestiona solo sus propios datos, sin ningún rol ni jerarquía.

## Project state (2026-09-09)

**Auth + módulo Medicamentos + Chat con IA e historial real, con la identidad visual del Vitapp original** — alcance acordado explícitamente con el usuario antes de construir (ver "Decisiones" abajo). `apps/web/` es Next.js 16 (Turbopack, App Router) — build y lint limpios. shadcn/ui en estilo `base-nova` (`@base-ui/react`, no Radix — composición con `render`/`nativeButton`, no `asChild`), igual que NutrIA.

**Construido:**
- **Auth con Google** (`src/app/login/`, `src/app/auth/{callback,signout,auth-code-error}/`) — mismo patrón `@supabase/ssr` que NutrIA (`src/lib/supabase/{client,server}.ts`). Sin `middleware.ts`/`proxy.ts`: el guard es `requireUser()` (`src/lib/dal.ts`) llamado desde cada layout/page protegida — no hace falta un resolver de rol como en NutrIA porque no hay roles.
- **Medicamentos** (`src/app/app/medicamentos/`) — alta (dialog con hora/momento del día/dosis/condición/días recurrentes), lista de hoy con toggle "tomado", lista completa con eliminar, adherencia simple (% y racha de días últimos 7 días). Toda la lógica de negocio vive en `src/lib/medicamentos/nucleo.ts` — funciones puras que reciben el cliente Supabase + `usuarioId`, sin acoplarse a Server Actions ni al chat, para que ambos frontales (UI de formularios y tool-calling del asistente) nunca puedan desincronizarse.
- **Asistente de chat con IA, con historial real** (`src/app/app/chat/`, `src/app/api/chat/route.ts`, `src/lib/chat/nucleo.ts`) — reemplaza LangGraph+Gemma+MCP del proyecto original por el SDK de Anthropic directo (`claude-sonnet-5`, tool-calling nativo, mismo proceso Next.js, sin subproceso). Mantiene el **contrato SSE documentado en el `agent/README.md` original** (`{chunk}`, `{action}`, `{error}`, `[DONE]`, más un `{session}` nuevo — ver abajo) porque separa bien texto de acciones de UI. Tools portadas 1:1 desde ese README, acotadas a medicamentos: `list_today_medications`, `list_all_medications`, `add_medication`, `update_schedule`, `delete_schedule`, `mark_taken`, `mark_all_taken`, `show_today_medications`, `show_all_medications` — todas ejecutan contra `lib/medicamentos/nucleo.ts`, nunca lógica duplicada. Las tools hablan en inglés (mismo vocabulario que el README original — `morning`/`midday`/`night`, `monday`..`sunday`); `src/lib/ai/mapeo.ts` es la única frontera de traducción hacia el español de la DB/UI.
  - **Historial de sesiones** (`sesiones_chat`/`mensajes_chat`, `003_chat_historial.sql`) — replica `ChatProvider.historySessions`/`startNewSession()`/`clearHistory()` del original, persistido en vez de en memoria. `/api/chat` reconstruye el historial **desde la DB**, nunca confía en lo que mande el cliente; acumula todo el texto emitido a lo largo del intercambio (incluidas vueltas de tool-use) y lo guarda como un único mensaje del asistente al final, para que quede idéntico a la burbuja que ve el usuario.
  - **`sesionPerteneceAUsuario`** (`lib/chat/nucleo.ts`) — un `sesionId` entrante siempre se verifica antes de usarse: la policy de insert de `mensajes_chat` solo valida `usuario_id`, no que `sesion_id` sea del mismo usuario, así que un UUID ajeno/manipulado en `?sesion=` podría insertar un mensaje huérfano si no se chequeara antes. Si no matchea, se trata como si no hubiera llegado ninguno.
  - **`<ChatView key={sesionId ?? "nuevo"}>`** (`page.tsx`) — cambiar de sesión desde el drawer tiene que resetear el estado local (mensajes, input), pero asignar un `sesionId` nuevo a mitad de un intercambio en curso NO — remontar ahí perdería lo que se está transmitiendo. Por eso `router.replace` a la URL con `?sesion=` recién se dispara cuando el stream ya terminó (momento en que el remount es inofensivo, los mensajes ya están persistidos), nunca apenas llega el evento `{session}`.
- **Identidad visual del Vitapp original** (`src/app/globals.css`) — paleta portada 1:1 desde `app/lib/theme/app_theme.dart` + `app/context/spec/UI_UX.md` del repo Flutter (navy `#2C3E50` primario, celeste `#42A5F5` acento, gris suave `#F0F2F5` fondo, burbujas `#005B96`/blanco). Como el resto de la app ya usaba tokens CSS (no colores hardcodeados), la mayoría se re-tiñó sola con este único cambio — solo hubo que tocar a mano el gradiente del logo de login, la barra superior de `/app/*` (pasa a navy, `AppBarTheme` del original) y las burbujas del chat (radio asimétrico + label "Asistente" + timestamp, replicando `chat_bubble.dart`).

**Pendiente / próximo paso real** (fuera de alcance de este primer pase, confirmado con el usuario — no construir sin pedirlo): turnos (appointments), métricas de salud, historial médico con archivos, login con Apple, la app Flutter/móvil (se decidió web-primero, con el modelo de datos pensado para exponer una API a una app móvil más adelante, pero esa API todavía no existe — hoy todo el acceso a datos es vía Supabase client + RLS, no hay una capa REST propia). Toggle de idioma/modo oscuro del AppBar original: no construido, el chat de Vita-Web no maneja tema ni locale — no inventar la feature sin que se pida.

## Decisiones tomadas explícitamente con el usuario — no reabrir sin motivo

- **Web primero, no Flutter**: se descartó migrar o continuar la app Flutter original. Next.js responsive, con el esquema pensado para eventualmente exponer una API a una app móvil (no construida todavía).
- **Anthropic API en vez de LangGraph+Gemma**: consistencia con el resto del stack (NutrIA también usa Anthropic). El contrato SSE del agente original se conservó porque estaba bien diseñado, no por inercia.
- **Alcance inicial = auth + un solo módulo completo** (medicamentos, el que tenía más tools ya diseñadas en el agente original) en vez de un esqueleto de los 4 módulos a medio construir. Turnos/métricas quedan para cuando se pida ese siguiente módulo, replicando el mismo patrón (`lib/<módulo>/nucleo.ts` + Server Actions + tools de chat).
- **Repo separado** (`ijproyectos/Vita-Web`), no se tocó `ijproyectos/Vitapp` — ese repo queda intacto como referencia.
- **Mismo Google OAuth Client de NutrIA**, agregando el redirect URI de este proyecto nuevo en Google Cloud Console (en vez de crear un client aparte) — decisión explícita del usuario para no duplicar configuración.
- **Identidad visual del Vitapp original aplicada a toda la app** (no solo al chat, que es la única pantalla que el original tiene realmente construida — no hay pantalla de Medicamentos en su Flutter, ese dominio vivía solo en el backend/agente) — mismo criterio que el rediseño de NutrIA: un solo cambio de tokens en `globals.css`, no un reskin pantalla por pantalla.
- **Historial de chat real** (sesiones + mensajes persistidos), no solo el look de las burbujas — el original lo tiene (`ChatProvider`), así que se replicó el comportamiento, no solo la estética.

## Infra

**Supabase está vivo**: proyecto **VitaAPP-WEB**, ref `jvmsmrdddyxgdnyrqhqe` (región `us-west-2`, plan Free, **org propia nueva, no la de NutrIA** — el usuario lo creó en otro perfil), URL `https://jvmsmrdddyxgdnyrqhqe.supabase.co`. Local ya está `supabase link`eado a este proyecto (`.git`-ignorado `supabase/.temp/`). `001_initial_schema.sql`, `002_rls_policies.sql` y `003_chat_historial.sql` **aplicadas y verificadas** contra la DB en vivo: `supabase migration list --linked` confirma local=remote en las tres, y una query de solo lectura por `psql` a través del pooler (`aws-0-us-west-2.pooler.supabase.com:5432`, user `postgres.jvmsmrdddyxgdnyrqhqe` — binario en `/opt/homebrew/Cellar/libpq/*/bin/psql`, no está en el PATH por defecto) confirma las 5 tablas con `rowsecurity = true` y las policies de `sesiones_chat`/`mensajes_chat`. Aplicado con `supabase db push --linked --password <db password>` — la CLI de Supabase no necesita `psql`/pooler para el push en sí (solo se usó acá para verificar), hace el push directo. **La contraseña de la DB no se guardó en ningún archivo** (a diferencia de NutrIA, que la tiene en `.env.local` a pedido explícito del usuario) — si hace falta de nuevo, pedírsela. **El Personal Access Token de la Management API usado en la sesión anterior venció/fue revocado** (un simple `GET` empezó a devolver `Unauthorized`) — si hace falta la Management API de nuevo, pedir uno nuevo, no asumir que el viejo sigue sirviendo.

`.env.local` (raíz, gitignored, symlink en `apps/web/`) ya tiene `NEXT_PUBLIC_SUPABASE_URL` y las dos API keys (legacy JWT `anon`/`service_role`, no las nuevas `sb_publishable_`/`sb_secret_` — por compatibilidad con `@supabase/supabase-js@^2.112` que ya usa NutrIA).

**Auth con Google, activado y verificado** (vía Management API, `GET .../config/auth`): `external_google_enabled = true`, Client ID cargado en el dashboard de Supabase por el usuario (mismo OAuth Client de Google Cloud que usa NutrIA — no un client nuevo, redirect URI de este proyecto ya agregado ahí). `site_url` estaba en `http://localhost:3000` (default de un proyecto nuevo) — corregido a `https://vitappweb.netlify.app`, y `uri_allow_list` ganó `https://vitappweb.netlify.app/**,http://localhost:3000/**` (sin esto el `redirectTo` de `signInWithOAuth` en producción hubiera sido rechazado). **No probado un login real de punta a punta todavía** — eso requiere un navegador con una cuenta de Google, pendiente de que el usuario lo pruebe en https://vitappweb.netlify.app/.

**Netlify está vivo**: sitio `vitappweb` (`site_id` `3c956a4d-b077-4ef4-a6e0-b6cef204ed44`, cuenta `ijsociety-exe`), conectado por el usuario vía la UI de Netlify a `ijproyectos/Vita-Web` rama `main` (auto-deploy). Las 3 env vars de Supabase cargadas vía Management API (contexto `all`) y confirmado un deploy `ready` con ellas ya presentes — `https://vitappweb.netlify.app/` responde 200 y redirige a `/login` (antes tiraba 500 por faltar las env vars). `ANTHROPIC_API_KEY` **deliberadamente no cargada** — decisión explícita del usuario de no sumar el chat con IA por ahora; sin esa var, `/app/chat` fallaría si se usa (el resto de la app no depende de Anthropic).

**Pendiente, acción del usuario:**
- [ ] Probar el login con Google de punta a punta en https://vitappweb.netlify.app/ (nunca se probó con un navegador real).
- [ ] `ANTHROPIC_API_KEY` — cuando se decida sumar el chat, pasarla para cargarla en `.env.local` y en Netlify.

## Stack

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS 4 + shadcn/ui (`base-nova`) + Lucide icons, sobre Supabase (Postgres, Auth, Row Level Security) + Anthropic API (`claude-sonnet-5`), hosted on Netlify (`netlify.toml`, `base = apps/web`). Sonner para toasts.

## Running the app

```bash
cd apps/web
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

**Next.js 16**: revisar `apps/web/node_modules/next/dist/docs/` antes de escribir código de App Router que no sea un tweak chico — hay breaking changes reales respecto al training data (ver `apps/web/AGENTS.md`, generado por el propio `next dev`).

## Docs map

- `docs/data-model.md` — tablas, columnas, RLS, qué queda fuera del modelo original.
- `supabase/migrations/` — `001_initial_schema.sql`, `002_rls_policies.sql`, `003_chat_historial.sql`.
- Identidad visual: fuente de verdad es `app/lib/theme/app_theme.dart` + `app/context/spec/UI_UX.md` del repo `ijproyectos/Vitapp` (no un mockup ni un `.dc.html` como NutrIA) — si hace falta reconfirmar un color/radio, mirar ahí, no inventar.

## Notas para código futuro en este repo

- **Núcleo de dominio separado de la UI y del chat**: cualquier módulo nuevo (turnos, métricas) debería seguir el patrón de `lib/medicamentos/nucleo.ts` — funciones puras `(supabase, usuarioId, ...) => resultado`, consumidas tanto por Server Actions como por una tool de chat nueva en `lib/ai/tools.ts`. No implementar la misma operación dos veces.
- **Server Actions nunca lanzan** — devuelven `{status: "success"|"error", ...}` (ver `EstadoAccion` en `medicamentos/actions.ts`), mismo criterio que NutrIA. Cualquier campo dentro de un `<form action={fn}>` tiene que ser controlado (`value`/`onChange`), no `defaultValue` — React 19 resetea los campos no controlados al terminar la transición de la action.
- **Diálogos con `useActionState`**: montar el formulario solo cuando el diálogo está abierto (`{open && <Formulario/>}`) para que cada apertura arranque con estado limpio — mismo bug ya evitado en NutrIA (`TurnoFormDialog`).
- **`<Button render={...}>` con algo que no sea un `<button>` real** (ej. `<Link>`) necesita `nativeButton={false}` explícito, si no Base UI tira un console error en runtime.
