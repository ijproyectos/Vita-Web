# Flujo de trabajo: ramas, revisión y producción

`main` es producción: Netlify publica automáticamente cada cambio que entra en `main`. Por eso nadie sube directo a `main`; todo entra por pull request revisado.

## Para colaboradores

1. Actualizá `main` y creá una rama por tarea:
   ```bash
   git checkout main && git pull
   git checkout -b feat/nombre-corto
   ```
2. Trabajá y commiteá con mensajes convencionales (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`).
3. Subí la rama y abrí el pull request contra `main`:
   ```bash
   git push -u origin feat/nombre-corto
   gh pr create --base main
   ```
4. Esperá:
   - el chequeo **verificar** en verde (lint, tipos y build);
   - el **deploy preview** de Netlify (link en el PR) para probar el cambio;
   - **1 aprobación**. Si tocás base de datos, auth, admin, notificaciones o deploy, la aprobación tiene que ser del dueño (ver `.github/CODEOWNERS`).
5. Si subís cambios nuevos después de una aprobación, hace falta aprobar de nuevo.
6. Cuando está todo en verde y aprobado, se mergea y Netlify publica.

## Reglas que aplica GitHub sobre `main` (ruleset "Proteger main")

| Regla | Qué significa |
|---|---|
| Pull request obligatorio | No se puede hacer `git push` directo a `main`. |
| 1 aprobación | Otra persona tiene que aprobar el PR. |
| Aprobación del dueño en rutas sensibles | Las rutas de `CODEOWNERS` necesitan a @ijproyectos. |
| Re-aprobar tras cambios | Un push nuevo invalida la aprobación anterior. |
| Conversaciones resueltas | No se mergea con comentarios abiertos. |
| Chequeo `verificar` en verde y rama al día | El CI tiene que pasar sobre el `main` actual. |
| Sin force push ni borrado | `main` no se reescribe ni se elimina. |
| Excepción | Solo el rol admin del repo puede saltear las reglas (emergencias). |

## Cómo aplicar el ruleset (una sola vez, como admin)

El ruleset está versionado en `.github/rulesets/main.json`. GitHub no lo aplica solo: hay que crearlo con la cuenta admin (`ijproyectos`). Recomendado: mergear primero el PR del CI para que el chequeo `verificar` ya exista.

```bash
gh auth login            # con la cuenta ijproyectos
gh api -X POST repos/ijproyectos/Vita-Web/rulesets --input .github/rulesets/main.json
```

Para cambiarlo después: editá el JSON y ejecutá
```bash
gh api repos/ijproyectos/Vita-Web/rulesets --jq '.[] | "\(.id) \(.name)"'   # buscar el id
gh api -X PUT repos/ijproyectos/Vita-Web/rulesets/<id> --input .github/rulesets/main.json
```

También se puede crear a mano en GitHub: Settings → Rules → Rulesets → New branch ruleset, con las mismas opciones de la tabla.

## Base de datos

- La base de producción de Supabase **no** se usa para desarrollar. Cada colaborador trabaja contra un proyecto de Supabase de desarrollo, con sus propias claves en `.env.local`.
- Las claves de producción (service role, contraseña de la base, `CRON_SECRET`) solo están en Netlify y las tiene el dueño.
- Las migraciones entran por PR (`supabase/migrations/`, requieren aprobación del dueño) y las aplica el dueño en producción.
