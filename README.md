# Vitapp

App de salud personal: gestión de medicamentos con un asistente de chat con IA. Reconstrucción del dominio de [`ijproyectos/Vitapp`](https://github.com/ijproyectos/Vitapp) (Flutter + Go + Python/LangGraph) sobre el mismo stack que [NutrIA](https://github.com/ijproyectos/nutreAPP): Next.js + Supabase + Anthropic API, deploy en Netlify.

## Stack

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS 4 + shadcn/ui (`base-nova`) sobre Supabase (Postgres, Auth con Google, Row Level Security) + Anthropic API (`claude-sonnet-5` para el chat).

## Estructura

```
apps/web/                # Next.js
supabase/migrations/      # SQL versionado, aplicado a mano vía psql
docs/                     # Modelo de datos
netlify.toml
```

## Desarrollo

```bash
cd apps/web
npm install
cp ../../.env.example .env.local   # completar con las credenciales reales
npm run dev
```

Ver `CLAUDE.md` para el estado detallado del proyecto y las decisiones tomadas.
