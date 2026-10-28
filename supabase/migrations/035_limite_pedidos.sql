-- Nota: escrita pero NO aplicada. Aplicar a mano con psql (no `db push`) y registrar en schema_migrations.
-- Límite de pedidos por usuario / por IP a /api/chat y /api/voz/* (anti-abuso de endpoints que gastan
-- plata). Distinto del límite diario de TOKENS (013, uso_ia_diario): este cuenta pedidos, no tokens.
--
-- Una fila por (clave, ventana_inicio): `clave` identifica a quién y qué se cuenta (p. ej.
-- 'chat:u:<usuario>:min', 'chat:ip:<hmac de la IP>:min'; la IP NUNCA se guarda cruda, se hashea con
-- HMAC igual que intentos_codigo) y `ventana_inicio` es el comienzo de la ventana fija (minuto UTC o día
-- calendario de Argentina). `cuenta` sube de a uno con contar_pedido().
--
-- RLS habilitada SIN policies, a propósito (como uso_ia_diario / intentos_codigo): solo service_role.
-- La app falla ABIERTO si esto no existe o falla (el límite diario de tokens sigue protegiendo el costo).
--
-- RETENCIÓN: las ventanas viejas no se usan más; el cron existente `dosis-vencidas`
-- (app/api/cron/dosis-vencidas, cliente admin sancionado) borra las filas con
-- `ventana_inicio` de más de 2 días en cada tick; si la tabla no existe, se degrada. Sin job nuevo.

create table limites_pedidos (
  clave text not null,
  ventana_inicio timestamptz not null,
  cuenta int not null default 0,
  primary key (clave, ventana_inicio)
);

alter table limites_pedidos enable row level security;
-- Deliberadamente sin policies: solo service_role (bypassa RLS).

-- Incremento atómico: crea la fila en 1 o suma 1, y devuelve la cuenta resultante. Una sola sentencia,
-- sin carrera entre leer y escribir.
create or replace function contar_pedido(p_clave text, p_ventana_inicio timestamptz)
returns int
language sql
security definer
set search_path = public
as $$
  insert into limites_pedidos (clave, ventana_inicio, cuenta)
  values (p_clave, p_ventana_inicio, 1)
  on conflict (clave, ventana_inicio)
  do update set cuenta = limites_pedidos.cuenta + 1
  returning cuenta;
$$;

revoke all on function contar_pedido(text, timestamptz) from public, anon, authenticated;
grant execute on function contar_pedido(text, timestamptz) to service_role;
