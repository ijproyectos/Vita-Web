# AGENTS.md

Estándares de arquitectura, pruebas y estilo para este repositorio. Complementa a `CLAUDE.md` (que documenta qué es el producto y su estado) — este archivo documenta *cómo* se escribe código acá, independientemente del pase o feature en curso.

Alcance: `apps/web/` (Next.js 16). El `apps/web/AGENTS.md` que vas a ver en ese directorio es distinto — lo regenera `next dev` automáticamente con avisos de breaking changes de Next.js 16, no lo edites a mano ni lo confundas con este.

## Arquitectura

- **Datos por usuario + Familia como única excepción aprobada**: cada fila pertenece a una cuenta (`usuario_id`). La única vista cruzada permitida es Familia/Modo cuidador (migraciones 008→021): un cuidador con vínculo `aceptado` lee los datos de la persona que cuida y, con rol `editar`, los modifica — siempre vía RLS (`es_cuidador_de` / `puede_editar_de`), nunca con el cliente admin. Cualquier OTRA forma de "un usuario ve datos de otro" es una decisión de producto nueva.
- **Cliente admin (`lib/supabase/admin.ts`, `service_role`) solo en usos sancionados**: cron de dosis vencidas, `recordarDosisAlElder` (después de validar el vínculo con la sesión), `crearPerfilGestionado`, y el acceso por código (`lib/acceso-codigo/nucleo.ts`: `entrarConCodigoAction` en `/login` y `verCodigoAction`, la vista previa "¿Sos vos?" de solo lectura, también usada desde `/onboarding/inicio`). La vista previa está throttled por `intentos_codigo`, nunca consume el código, replica los chequeos del login y devuelve solo primer nombre de la persona, primer nombre del cuidador y cantidad de medicamentos. También los escritores de contabilidad de sistema (tablas con RLS sin policies): `registrarUsoIA`, `registrarRespuestaChat` (`registros_chat`) y `verificarLimitePedidos` (`limites_pedidos`), siempre DESPUÉS de autenticar la sesión y con el `usuario_id` tomado de ella, nunca del cliente. También `pedirAyudaAFamilia` (`lib/notificaciones/pedido-ayuda.ts`: escribe el aviso y el push de los cuidadores DESPUÉS de validarlos con la sesión vía `listar_mis_cuidadores`). También `avisarTurnoAcompanado` (`lib/notificaciones/turno-acompanado.ts`: avisa a los cuidadores aceptados cuando un turno queda con "Voy a ir acompañado", DESPUÉS de que la sesión pudo leer el turno recién escrito). Y el worker del resumen de memoria (`/api/cron/memoria`, `lib/memoria/resumen.ts`): código de sistema detrás de `x-cron-secret` que procesa la cola de todos los usuarios y respeta `memoria_activa`, los mensajes excluidos y el límite diario. Cualquier otro uso es una decisión nueva.
- **Núcleo de dominio separado de UI y del chat**: la lógica de negocio real vive en `lib/<dominio>/nucleo.ts` (`medicamentos`, `turnos`, `perfil`, `estudios`) como funciones puras `(supabase, usuarioId, ...) => resultado`. Tanto los Server Actions como las tools de chat (`lib/ai/tools.ts`) consumen ese mismo núcleo. **Nunca implementar la misma operación de negocio dos veces** (una vez para el form, otra para el chat) — si una tool de chat necesita hacer algo que ya existe como acción de UI, se extrae a `nucleo.ts` y se llama desde los dos lados.
- **Server Actions nunca lanzan** (`throw`): devuelven un objeto de estado discriminado (`{status: "success" | "error", ...}`, ver `EstadoAccion` en `rutina/actions.ts`) y el componente decide qué mostrar. Cualquier campo dentro de un `<form action={fn}>` debe ser controlado, no `defaultValue`.
- **Server Components por default**; `"use client"` solo donde hace falta interactividad (forms, overlays, hooks de estado). No convertir un árbol entero a client component para resolver un problema local.
- Rutas en `src/app/` (App Router), lógica de dominio y clientes de Supabase en `src/lib/`, UI en `src/components/` (`ui/` para primitivas shadcn, `vita/` para lo específico del diseño).
- Alias de import `@/*` → `src/*`. Preferirlo sobre rutas relativas largas.
- **Next.js 16 es reciente y rompe con el training data del modelo**: antes de escribir código de App Router que no sea un cambio trivial, revisar `apps/web/node_modules/next/dist/docs/`.

## Pruebas

**Estado real**: el repo tiene **Vitest** (desde el PR #17): tests unitarios colocados junto al código (`*.test.ts`), sin DB ni red. El CI (`.github/workflows/ci.yml`, check `verificar`) corre en cada PR:

```bash
npm run lint    # eslint (eslint-config-next: core-web-vitals + typescript)
npx tsc --noEmit
npm test        # vitest run
npm run build   # build de producción
```

Todo debe quedar limpio antes de dar una tarea por terminada. Toda lógica pura nueva (helpers de `lib/`, clasificadores, cálculos de fecha) lleva su test.

Si una tarea agrega lógica de negocio no trivial en `lib/*/nucleo.ts` y el usuario pide (o acepta la propuesta de) tests automatizados:
- **Unit tests para `nucleo.ts`**: son funciones puras con el cliente de Supabase inyectado como parámetro, así que se prestan a Vitest con un mock/fake de ese cliente sin necesidad de una DB real. Es la pieza con mejor relación esfuerzo/cobertura de todo el repo.
- **E2E para flujos críticos** (login, onboarding, agregar medicamento/turno): Playwright, contra una instancia real o de staging de Supabase, no contra mocks — el valor ahí es probar RLS y el flujo completo.

No instalar un framework de testing "de paso" dentro de una tarea no relacionada — es una decisión de stack, se propone y se acuerda aparte.

## Estilo

- TypeScript en modo `strict` (`tsconfig.json`). No introducir `any` para esquivar un error de tipos — si el tipo real es difícil de expresar, es señal de que el diseño de esa función necesita revisarse.
- Iconos: importar desde `lib/vita-icons.tsx` (mapeo curado del set de Lucide que usa el diseño), no `lucide-react` directo en componentes de pantalla.
- Estilos con Tailwind CSS 4 y los tokens centralizados en `globals.css` — no hardcodear colores; si un color no está tokenizado, se agrega el token ahí, no inline.
- Excepciones: `lib/email/marca.ts` es la ÚNICA copia en hex de los tokens (los clientes de correo y el manifest de la PWA no soportan variables CSS) — cualquier color de email o de `app/manifest.ts` sale de ese archivo. Además, `public/google-g.svg` (logo de marca de un tercero: Google fija sus colores) y `app/icon.svg` (favicon estático, no puede importar nada) lleva los hex del isotipo con un comentario que apunta a `globals.css`.
- shadcn/ui solo se usa para `Sheet` (drawers/bottom sheets). El resto de la UI es a medida, calcada de `pantallas/V7/design v0 vita/` — no reemplazar un componente custom por un equivalente de una librería sin que sea pedido explícito.
- `<Button render={...}>` con algo que no sea un `<button>` real (ej. `<Link>`) necesita `nativeButton={false}` explícito.

### Reglas de lint/hooks específicas de este repo (ya golpeadas antes, no re-descubrir)

- **`react-hooks/set-state-in-effect`**: si el estado solo evita "no volver a pedir esto", usar `useRef` en vez de `useState` (no es reactivo, no dispara la regla). Si el estado SÍ es visible en el render, inicializarlo con el valor correcto en el `useState` inicial y mover cualquier reactivación al event handler que dispara el cambio, nunca al cuerpo del efecto. Ver `_chat/vita-chat-overlay.tsx` y `onboarding/chat/encuesta.tsx`.
- **`react-hooks/refs`**: nunca asignar `ref.current = x` en el cuerpo del render — solo dentro de handlers o efectos.
- **Pureza en Server Components**: no usar `Date.now()`/`Math.random()` en el cuerpo de un Server Component; usar `new Date()` (sí lo tolera el linter).
- **`<option>` "Otra" con texto libre**: nunca usar el label de esa opción como su `value`. Si un dato viejo coincide literalmente con ese label, el form lo interpreta como "elegiste Otra" y vacía el campo, borrando el dato al guardar. Usar un `value` interno que no pueda colisionar (ver `OTRA_PREPAGA` en `lib/perfil/opciones.ts`).
- **Valores extraídos por IA hacia columnas tipadas** (`date`, `numeric`, etc.): siempre parsear/validar antes del insert — el schema de Zod de una tool solo le pide el formato al modelo en la descripción, no lo garantiza. Ver `fechaValidaOnull` en `lib/estudios/nucleo.ts`.
- **Mime type de archivos subidos por el usuario**: nunca asumirlo. Si no está en la lista de tipos soportados por la API (ej. HEIC de iPhone), declinar explícito en vez de mandarlo etiquetado como otra cosa (ver `TIPOS_SOPORTADOS` en `lib/estudios/extraer.ts`).

## Alcance del producto (no es solo estilo de código)

Este repo sigue una regla explícita de alcance: si el prototipo V7 (`pantallas/V7/design v0 vita/VitaApp.dc.html`) deja una interacción como placeholder (sin `onClick`, o un `showToast('...próximamente')`), no se construye funcionalidad real detrás sin que sea pedido explícito — ver "Fuera de alcance" en `CLAUDE.md`. Esto aplica también a código generado por un agente: no rellenar un placeholder del diseño "porque se puede", es una decisión de producto del usuario, no una tarea técnica pendiente.
