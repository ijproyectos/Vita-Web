# Database baseline: production inventory and local reconstruction

This work compares the deployed schema with the repository, then checks whether the repository can rebuild an isolated development database. It does not change production or copy patient records.

## 1. Collect production metadata

The owner runs [inventario-esquema.sql](../supabase/queries/inventario-esquema.sql) in the production project's Supabase SQL Editor:

1. Open a new SQL query and paste the entire file, including `begin read only` and `rollback`.
2. Run it as a role that can inspect the schema and migration history. The script does not change roles or privileges.
3. Export or copy the single `schema_inventory` JSON result. If the editor reports success without displaying the SELECT result, report that outcome and use a SQL client that preserves intermediate SELECT result sets. Keep the complete read-only transaction; do not split it across editor requests or remove its safety statements to obtain output.
4. Inspect the export before sharing it. It should contain object names, definitions of constraints/policies/indexes, grants, routine metadata and hashes, migration versions, and cron job names/schedules. It must not contain credentials, patient records, function source, migration statements, or cron commands.
5. Share the JSON result and any exact SQL error. Do not share connection strings, keys, access tokens, `.env` files, or table exports.

The query has a 20-second statement timeout and a 1-second lock timeout. Each main catalog section includes its total count, a truncation flag, and at most 2,000 items. Optional migration and cron sections use XML inside the JSON to avoid referencing absent tables during parsing. A 2,000-row optional result needs a follow-up count before calling it complete.

`unavailable` means the catalog is missing, has an unexpected shape, or cannot be read with the current privileges. It does not mean that no migrations or jobs exist. Cron RLS can also limit visible jobs. A successful export is metadata evidence, not proof that production matches every migration or that permissions work correctly.

The inventory deliberately omits routine source, view bodies, trigger arguments, role memberships and default ACLs. Routine definition hashes can help detect differences when collected under comparable PostgreSQL versions and settings; they cannot explain a difference. Inspect those objects separately only if the comparison requires them, with secrets removed.

Compare the output with migrations `001`–`030` in the current main baseline (`9fb7fb6`). Treat migrations from pending branches separately. A migration filename, a header saying “not applied,” or the presence of one table does not establish the deployed version. Record objects missing from either side and historical migrations whose effects were subsequently replaced.

## 2. Reconstruct an isolated development database

Supabase CLI 2.116.0 and Docker Desktop are available. A controlled reconstruction and SQL test run completed on 2026-10-27 using PostgreSQL 17.6; the production PostgreSQL version remains unverified. `psql` ran inside the local database container rather than from the host PATH. See the observed results below.

Before replay:

1. Start Docker Desktop and confirm the engine is reachable.
2. Prepare a separate local Supabase workspace with a distinct project identifier, disposable volumes and local-only endpoints. Do not link it to production or reuse production credentials.
3. Review extensions and migration ordering against the installed local PostgreSQL/Supabase stack.
4. Disable cron scheduling and external network effects before any migration runs. Migrations `009` and `018` schedule HTTP calls to the production app URL; replacing only the secret placeholder does not make that safe. Use an explicitly reviewed local replay plan, and record operational SQL omitted or overridden. Preserve the original historical migrations.
5. Check the local connection target before any reset, migration or fixture command. Avoid linked/remote push commands.

Replay the reviewed chain in order and stop at the first unexpected error. Record the migration, exact error and required prerequisite. An operational override means the result is a controlled schema reconstruction, not a literal replay of every historical side effect.

Create synthetic owner, caregiver-with-edit, caregiver-with-read and unrelated accounts locally. Run the SQL tests against the final reconstructed schema and report successes, failures and tests that could not run. Transaction rollback in a test is not a reason to run it in production.

Some tests describe an earlier schema. For example, the inventory test introduced with migration `014` expects an accepted caregiver to lack direct writes, while migration `021` grants those writes to role `editar`. Classify such expectations against the final role contract; do not change permissions merely to satisfy an outdated assertion.

The first report should identify:

- Production/repository metadata differences and visibility limits.
- Replay failures and exact operational overrides.
- SQL test results and obsolete expectations.
- Open decisions for dose identity/date, historical preservation and stock consistency.

Application lint/build is not a validation of this SQL. The initial inventory is a metadata-query/documentation unit; it introduces no application behavior or database migration. Production inventory and comparison remain pending owner-supplied metadata.

## Observed local results — 2026-10-27

Workspace: `/private/tmp/vita-db-baseline.FyyxEO`; project `vita-db-baseline`; database container `supabase_db_vita-db-baseline`; database port `55322`, API port `55321`. The unrelated `property-bot` project was not changed. The local Supabase PostgreSQL image is `17.6.1.165` and reports PostgreSQL 17.6.

Before replay, the database was detached from its ordinary Supabase network and attached only to Docker network `vita-db-baseline-isolated`, created with `--internal` and no gateway. `cron.launch_active_jobs` was set to `off` through the container's local administrator. The API services intentionally cannot reach this detached database: this is a schema/test sandbox, not yet an application development environment.

All 30 migration positions completed successfully. Files `001`–`030` ran unchanged except `009` and `018`: those two positions executed only explicit `CREATE EXTENSION IF NOT EXISTS` statements for `pg_cron` and `pg_net`. Their job scheduling/unscheduling and HTTP payloads were not executed. Final guards confirmed cron execution remained off and there were zero active jobs. This establishes controlled schema replay, not literal replay of operational side effects or equivalence with production.

The inventory query executed with `transaction_read_only = on` against both the empty and reconstructed local schema. After reconstruction it reported 29 public relations, 261 columns, 69 indexes, 91 policies, 18 routines and 119 constraints, without truncation. Cron metadata was available with no jobs. The migration ledger schema was absent because replay used original SQL through `psql`, not Supabase migration-ledger execution; no applied-version history was fabricated.

A limited-role run exposed and then verified a correction in the inventory query: optional relations are resolved through materialized catalog OIDs before checking schema privileges, avoiding an early `permission denied for schema cron`. The final query passed as both local `postgres` and `authenticated`; the latter explicitly reports `schema_usage_missing` for cron. Function definitions and cron commands were not exported.

The 17 existing SQL scripts ran in separate `psql -X -v ON_ERROR_STOP=1` sessions, with four synthetic local accounts and profiles. Scripts that failed stopped at their first error; later independent scripts still ran. No test or migration was changed to obtain a passing result.

| SQL test | Result | Observation |
| --- | --- | --- |
| `familia.sql` | PASS | 7 PASS notices |
| `inventario-pastillas.sql` | FAIL | Expected direct caregiver UPDATE to affect 0 rows; it affected 1. The expectation predates role `editar` in 021. |
| `acciones-agente.sql` | FAIL | Syntax error near `:` in a DO block after 2 PASS notices; psql variables are not expanded inside dollar-quoted blocks. |
| `mediciones.sql` | PASS | 6 PASS notices |
| `autovinculo.sql` | PASS | 3 PASS notices |
| `avisos-familia.sql` | PASS | 5 PASS notices |
| `avisos.sql` | PASS | 15 PASS notices |
| `codigos-acceso.sql` | PASS | 7 PASS notices |
| `consultas-vacunas.sql` | PASS | 5 PASS notices |
| `cuidadores-de-persona.sql` | PASS | 12 PASS notices |
| `enlaces-profesional.sql` | PASS | 17 PASS notices |
| `estudios-lugar.sql` | PASS | 1 PASS notice |
| `modo-cuidador-rls.sql` | FAIL | Expected caregiver medication UPDATE to affect 0 rows; it affected 1. The expectation predates role `editar` in 021. |
| `modo-simple-prefs.sql` | PASS | 11 PASS notices |
| `perfil-campos.sql` | PASS | 4 PASS notices |
| `push-recordatorios.sql` | PASS | 9 PASS notices; synthetic endpoint rows only, no push delivery |
| `rutina-detalles.sql` | PASS | 6 PASS notices |

Total: **14 passed, 3 failed, 0 skipped**. These results validate only the executed SQL scenarios on this local stack. They do not establish application concurrency, real notification delivery, browser behavior, production parity or the correctness of unexecuted assertions after a script's first failure. The manual browser checklist was not run.

Evidence lives in the temporary workspace: `replay-summary.json`, `sql-tests-summary.json`, per-migration/per-test stdout and stderr, `inventory-before.json`, `inventory-after.json`, and `inventory-authenticated.json`. Startup logs can contain generated local credentials and must not be shared wholesale. The temporary runners and synthetic fixtures are local evidence, not production migration records.
