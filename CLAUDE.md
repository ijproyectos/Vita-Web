# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Vitapp es una app de salud personal — gestión de medicamentos con un asistente de chat con IA que puede leer y modificar esos datos. Es la reconstrucción del *dominio* de [`ijproyectos/Vitapp`](https://github.com/ijproyectos/Vitapp) (un monorepo Flutter + Go/Gin/GORM + Python FastAPI/LangGraph, en etapa temprana — auth completo pero casi ningún endpoint de dominio construido) sobre la misma arquitectura que [NutrIA](https://github.com/ijproyectos/nutreAPP): Next.js + Supabase (Postgres/Auth/RLS) + Anthropic API, deploy Netlify vía GitHub. Decisión explícita del usuario: no migrar código (Flutter/Go/Python), migrar el *modelo* a un stack distinto.

A diferencia de NutrIA (multi-tenant, profesional↔paciente), Vitapp es **single-tenant por usuario** — cada persona ve y gestiona solo sus propios datos, sin ningún rol ni jerarquía.

## Project state (2026-09-04)

**Auth + módulo Medicamentos completo de punta a punta, con asistente de chat con IA** — alcance acordado explícitamente con el usuario antes de construir (ver "Decisiones" abajo). `apps/web/` es Next.js 16 (Turbopack, App Router) — build y lint limpios. shadcn/ui en estilo `base-nova` (`@base-ui/react`, no Radix — composición con `render`/`nativeButton`, no `asChild`), igual que NutrIA.

**Construido:**
- **Auth con Google** (`src/app/login/`, `src/app/auth/{callback,signout,auth-code-error}/`) — mismo patrón `@supabase/ssr` que NutrIA (`src/lib/supabase/{client,server}.ts`). Sin `middleware.ts`/`proxy.ts`: el guard es `requireUser()` (`src/lib/dal.ts`) llamado desde cada layout/page protegida — no hace falta un resolver de rol como en NutrIA porque no hay roles.
- **Medicamentos** (`src/app/app/medicamentos/`) — alta (dialog con hora/momento del día/dosis/condición/días recurrentes), lista de hoy con toggle "tomado", lista completa con eliminar, adherencia simple (% y racha de días últimos 7 días). Toda la lógica de negocio vive en `src/lib/medicamentos/nucleo.ts` — funciones puras que reciben el cliente Supabase + `usuarioId`, sin acoplarse a Server Actions ni al chat, para que ambos frontales (UI de formularios y tool-calling del asistente) nunca puedan desincronizarse.
- **Asistente de chat con IA** (`src/app/app/chat/`, `src/app/api/chat/route.ts`) — reemplaza LangGraph+Gemma+MCP del proyecto original por el SDK de Anthropic directo (`claude-sonnet-5`, tool-calling nativo, mismo proceso Next.js, sin subproceso). Mantiene el **contrato SSE documentado en el `agent/README.md` original** (`{chunk}`, `{action}`, `{error}`, `[DONE]`) porque separa bien texto de acciones de UI. Tools portadas 1:1 desde ese README, acotadas a medicamentos: `list_today_medications`, `list_all_medications`, `add_medication`, `update_schedule`, `delete_schedule`, `mark_taken`, `mark_all_taken`, `show_today_medications`, `show_all_medications` — todas ejecutan contra `lib/medicamentos/nucleo.ts`, nunca lógica duplicada. Las tools hablan en inglés (mismo vocabulario que el README original — `morning`/`midday`/`night`, `monday`..`sunday`); `src/lib/ai/mapeo.ts` es la única frontera de traducción hacia el español de la DB/UI.

**Pendiente / próximo paso real** (fuera de alcance de este primer pase, confirmado con el usuario — no construir sin pedirlo): turnos (appointments), métricas de salud, historial médico con archivos, login con Apple, la app Flutter/móvil (se decidió web-primero, con el modelo de datos pensado para exponer una API a una app móvil más adelante, pero esa API todavía no existe — hoy todo el acceso a datos es vía Supabase client + RLS, no hay una capa REST propia).

## Decisiones tomadas explícitamente con el usuario — no reabrir sin motivo

- **Web primero, no Flutter**: se descartó migrar o continuar la app Flutter original. Next.js responsive, con el esquema pensado para eventualmente exponer una API a una app móvil (no construida todavía).
- **Anthropic API en vez de LangGraph+Gemma**: consistencia con el resto del stack (NutrIA también usa Anthropic). El contrato SSE del agente original se conservó porque estaba bien diseñado, no por inercia.
- **Alcance inicial = auth + un solo módulo completo** (medicamentos, el que tenía más tools ya diseñadas en el agente original) en vez de un esqueleto de los 4 módulos a medio construir. Turnos/métricas quedan para cuando se pida ese siguiente módulo, replicando el mismo patrón (`lib/<módulo>/nucleo.ts` + Server Actions + tools de chat).
- **Repo separado** (`ijproyectos/Vita-Web`), no se tocó `ijproyectos/Vitapp` — ese repo queda intacto como referencia.
- **Mismo Google OAuth Client de NutrIA**, agregando el redirect URI de este proyecto nuevo en Google Cloud Console (en vez de crear un client aparte) — decisión explícita del usuario para no duplicar configuración.

## Infra — pendiente de acción del usuario (no verificable desde una sesión de Claude Code sin acceso a esos dashboards)

- [ ] Crear el proyecto Supabase (misma org que NutrIA) y aplicar `supabase/migrations/001_initial_schema.sql` + `002_rls_policies.sql` vía `psql`/pooler — mismo mecanismo que NutrIA, ver su `CLAUDE.md` para el comando exacto. **No asumir aplicada sin verificar contra la DB en vivo.**
- [ ] Agregar el redirect URI de este proyecto (`https://<ref>.supabase.co/auth/v1/callback`) al Google OAuth Client existente de NutrIA, en Google Cloud Console.
- [ ] Activar el provider de Google en Supabase Auth (Authentication → Providers) con el Client ID/Secret de ese mismo client.
- [ ] Crear el sitio Netlify (misma cuenta que NutrIA), conectar `ijproyectos/Vita-Web`, cargar las 4 env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`).

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
- `supabase/migrations/` — `001_initial_schema.sql`, `002_rls_policies.sql`.

## Notas para código futuro en este repo

- **Núcleo de dominio separado de la UI y del chat**: cualquier módulo nuevo (turnos, métricas) debería seguir el patrón de `lib/medicamentos/nucleo.ts` — funciones puras `(supabase, usuarioId, ...) => resultado`, consumidas tanto por Server Actions como por una tool de chat nueva en `lib/ai/tools.ts`. No implementar la misma operación dos veces.
- **Server Actions nunca lanzan** — devuelven `{status: "success"|"error", ...}` (ver `EstadoAccion` en `medicamentos/actions.ts`), mismo criterio que NutrIA. Cualquier campo dentro de un `<form action={fn}>` tiene que ser controlado (`value`/`onChange`), no `defaultValue` — React 19 resetea los campos no controlados al terminar la transición de la action.
- **Diálogos con `useActionState`**: montar el formulario solo cuando el diálogo está abierto (`{open && <Formulario/>}`) para que cada apertura arranque con estado limpio — mismo bug ya evitado en NutrIA (`TurnoFormDialog`).
- **`<Button render={...}>` con algo que no sea un `<button>` real** (ej. `<Link>`) necesita `nativeButton={false}` explícito, si no Base UI tira un console error en runtime.
