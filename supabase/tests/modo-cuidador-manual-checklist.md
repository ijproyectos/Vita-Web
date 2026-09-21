# Modo Cuidador — Manual test checklist (tasks 4.5–4.7)

This repo has no test runner (`package.json` has only `dev`/`build`/`start`/
`lint` — confirmed while writing this checklist). `esDosisVencida` and
`detectarDosisVencidas` live in files that start with `import "server-only"`,
which resolves only through Next's bundler (`next/dist/compiled/server-only`,
not a real `node_modules` package) — they cannot be `import`ed from a plain
Node script. These are therefore documented, hand-traced manual checks, not
an invented test framework.

Tasks 4.1–4.4 (RLS/RPC) have a real runnable `psql` script instead — see
`supabase/tests/modo-cuidador-rls.sql`. Task 4.7 (cron route auth) is a real
runnable `curl` check and was already executed once during this batch — see
"4.7" below for the exact commands and observed result.

## 4.5 — `esDosisVencida` / `horaEnAR` / `fechaEnUTC` (pure functions)

Source: `apps/web/src/lib/medicamentos/nucleo.ts`.

Trace `esDosisVencida(horaProgramada, ahoraHHMM, minutosGracia)` by hand — it
is `aMinutos(ahoraHHMM) - aMinutos(horaProgramada) >= minutosGracia`, pure
minute-of-day arithmetic, no dates:

| # | `horaProgramada` | `ahoraHHMM` | `minutosGracia` | Expected | Why |
|---|---|---|---|---|---|
| 1 | `08:00` | `08:29` | `30` | `false` | 29 min elapsed, under the 30 min grace |
| 2 | `08:00` | `08:30` | `30` | `true` | exactly the grace boundary, inclusive (`>=`) |
| 3 | `08:00` | `07:59` | `30` | `false` | "now" before the scheduled time, negative diff |

`horaEnAR`/`fechaEnUTC` boundary (the exact "load-bearing" gotcha documented
in `lib/notificaciones/nucleo.ts` and the design artifact) — Argentina is a
fixed `UTC-3` with no DST:

| # | Instant (UTC) | `horaEnAR()` | `fechaEnUTC()` | Note |
|---|---|---|---|---|
| 4 | `2026-01-15T23:05:00.000Z` | `20:05` | `2026-01-15` | AR wall-clock and UTC calendar day still agree |
| 5 | `2026-01-16T00:05:00.000Z` | `21:05` | `2026-01-16` | AR wall-clock is still "Jan 15, 21:05" but the UTC date already rolled to Jan 16 — this exact mismatch is why `detectarDosisVencidas` checks `fecha IN (hoyUTC, ayerUTC)` instead of only `hoyUTC` (see 4.6 below) |

**How to actually run these** (once this PR is on a deployed/dev environment
where Next can resolve `server-only`): add a temporary
`console.log(esDosisVencida("08:00","08:30",30))` (etc.) inside any existing
server code path already covered by manual E2E (task 4.8), run it, compare
against the table above, then remove the temporary log — do not leave debug
logging in committed code.

## 4.6 — `detectarDosisVencidas` dedupe + accepted-only notification

Source: `apps/web/src/lib/notificaciones/nucleo.ts` +
`apps/web/src/app/api/cron/dosis-vencidas/route.ts`. Requires migration 008
applied (task 1.4) and `RESEND_API_KEY`/`CRON_SECRET` loaded (task 3.8) —
**cannot be executed in this batch**, same blocker as 4.1–4.4.

Once deployed, verify with two accounts (an elder E and a caregiver C
already `aceptado`-linked to E, per `/app/perfil/cuidadores`):

1. **Exactly one email per missed dose** — create a medicamento for E with
   `hora_programada` a few minutes in the past (past the 30 min grace) and
   leave it unconfirmed. Call the cron route twice in a row (see the `curl`
   pattern in 4.7, with the real `CRON_SECRET`).
   - Expected: exactly one row in `alertas_dosis` for
     `(medicamento_id, fecha)`, exactly one email received by C. The second
     call's response JSON should show that dose counted under `omitidos`,
     not `alertados` (the `upsert(..., { ignoreDuplicates: true })` claim
     lost the race the second time, per the route's dedupe logic).
2. **Only accepted caregivers notified** — invite a second caregiver D but
   do NOT have D claim the invite (link stays `pendiente`). Repeat the
   missed-dose scenario. Expected: only C receives the email; D receives
   nothing (confirm via the Resend dashboard's recipient list for that
   send, not just the app's own count).
3. **AR/UTC boundary (design's documented gotcha)** — schedule a dose at
   `hora_programada` around `20:20` AR with `GRACIA_MIN=30` (vencida at
   `20:50` AR), confirm it (mark tomado) at exactly `20:50` AR, then trigger
   the cron at `21:05` AR (`00:05 UTC` next day). Expected: **no** email —
   `detectarDosisVencidas` must find the `medicamentos_tomas` row via the
   `fecha IN (hoyUTC, ayerUTC)` tolerance even though the toma's UTC `fecha`
   is the previous UTC day relative to the cron's `ahora`.

## 4.7 — Cron route auth (`x-cron-secret`)

Source: `apps/web/src/app/api/cron/dosis-vencidas/route.ts`. **This one WAS
executed for real during this apply batch** (dev server on `:3911`,
`CRON_SECRET=test-secret-123`, then killed):

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3911/api/cron/dosis-vencidas
# → 401 (no x-cron-secret header at all)

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3911/api/cron/dosis-vencidas \
  -H "x-cron-secret: wrong-value"
# → 401 (wrong secret, rejected by the timingSafeEqual length/byte check)

curl -s -X POST http://localhost:3911/api/cron/dosis-vencidas \
  -H "x-cron-secret: test-secret-123"
# → 200 {"detectadas":0,"alertados":0,"omitidos":0,"errores":0}
# (real query against the live medicamentos table via SUPABASE_SERVICE_ROLE_KEY
#  from .env.local — read-only, returned 0 candidates at the real time this
#  ran, so it never reached vinculos_cuidador/alertas_dosis at all; migration
#  008 is not yet applied to the live DB, consistent with task 1.4 still
#  pending)
```

"No query executed" on the unauthorized path is structurally guaranteed by
the route's control flow, not just observed once: `createAdminClient()` and
`detectarDosisVencidas()` are only called AFTER the `secretoValido(...)`
check returns `true` and the function has not already `return`ed the 401 —
there is no code path that reaches the Supabase client construction, let
alone a query, when the secret check fails.

**Re-run in production** after task 3.8 (`CRON_SECRET` loaded in Netlify)
against `https://vitappweb.netlify.app/api/cron/dosis-vencidas` before
enabling the migration 009 schedule, to confirm the same three outcomes
against the real deployed URL and the real `CRON_SECRET` value.
