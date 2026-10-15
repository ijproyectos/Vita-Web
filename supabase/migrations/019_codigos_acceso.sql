-- 019 — Acceso por código (sin cuenta de Google) + throttling anti fuerza bruta.
--
-- Requisito: la persona que usa Modo Simple no necesita Gmail; entra con el
-- código que genera su cuidador. Dos tipos de código se aceptan en /login:
--   1) Código de VÍNCULO (6 dígitos, vinculos_cuidador.codigo): primer
--      acceso. La Server Action crea la cuenta (email placeholder
--      `cuidado-<uuid>@usuarios.soyvita.com.ar`) y reclama el vínculo.
--   2) Código de ACCESO (esta tabla): re-acceso de esa misma cuenta (otro
--      celular, cookies borradas). Lo genera el cuidador desde
--      /cuidar/[elderId], vale 15 min y se usa una sola vez.
--
-- codigos_acceso: solo se guarda el hash (sha256 hex de salt || código de 6
-- dígitos). El cuidador con vínculo ACEPTADO puede insertar/leer filas de
-- ese elder (RLS); no hay policy de update/delete: el consumo (usado_at) lo
-- hace el cliente service_role de la Server Action de login, que es el
-- único que tiene que validar un código sin sesión.
--
-- intentos_codigo: registro de intentos por IP hasheada (HMAC con secreto
-- del servidor) para limitar la fuerza bruta (6 dígitos = 1e6 combinaciones
-- y la acción es anónima). RLS habilitada SIN policies: solo service_role.

create table codigos_acceso (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references auth.users(id) on delete cascade,
  cuidador_id uuid not null references auth.users(id) on delete cascade,
  codigo_hash text not null,
  salt text not null,
  expira_at timestamptz not null,
  usado_at timestamptz,
  created_at timestamptz not null default now(),
  constraint codigos_acceso_sin_autoacceso check (elder_id <> cuidador_id)
);

create index idx_codigos_acceso_vigentes on codigos_acceso (expira_at) where usado_at is null;
create index idx_codigos_acceso_elder on codigos_acceso (elder_id);

alter table codigos_acceso enable row level security;

create policy codigos_acceso_insert_cuidador on codigos_acceso
  for insert to authenticated
  with check (
    codigos_acceso.cuidador_id = auth.uid()
    and exists (
      select 1 from vinculos_cuidador v
      where v.elder_id = codigos_acceso.elder_id
        and v.cuidador_id = auth.uid()
        and v.estado = 'aceptado'
    )
  );

create policy codigos_acceso_select_cuidador on codigos_acceso
  for select to authenticated
  using (
    codigos_acceso.cuidador_id = auth.uid()
    and exists (
      select 1 from vinculos_cuidador v
      where v.elder_id = codigos_acceso.elder_id
        and v.cuidador_id = auth.uid()
        and v.estado = 'aceptado'
    )
  );

-- Sin policies de update/delete a propósito (ver cabecera).

create table intentos_codigo (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  creado_at timestamptz not null default now()
);

create index idx_intentos_codigo_ip on intentos_codigo (ip_hash, creado_at desc);

alter table intentos_codigo enable row level security;
-- Sin policies: ni authenticated ni anon pueden leer ni escribir.
revoke all on intentos_codigo from anon, authenticated;
