-- Memoria (fase 4) — tests de la migración 043 (consolidación nocturna con Message Batches y contradicciones).
--   1  RLS y permisos: lotes solo service_role; contradicciones solo lectura del dueño; el trabajador no es ejecutable por un usuario.
--   2  reservar_lote_consolidacion: custom_id opaco, una persona en un solo lote en vuelo, memoria apagada no se reserva.
--   3  aplicar_consolidacion: unión, destacados, contradicciones, idempotencia y snapshot vencido (lo cambiado/olvidado no revive).
--   4  Cascada (trigger): olvidar una unión borra sus ingredientes; olvidar un ingrediente borra la unión; cierra contradicciones.
--   5  resolver_contradiccion: a / b / ambas / ninguna, obsoleta y ajena.
--   6  Privacidad: olvidar todo / dejar de recordar descartan lo pendiente; los excluidos no viajan ni se aplican.
--
-- Script de psql escrito a mano, mismo estilo que memoria-resumen.sql: cada sección es su propia transacción y termina en ROLLBACK.
-- NO SE CORRIÓ al escribirlo (sin base de datos en la sesión de autoría): correrlo después de aplicar la 043.
-- Requisitos: migraciones hasta 043 aplicadas; dos cuentas REALES de auth.users (user_a, user_b); conectarse como `postgres`.
-- Los recuerdos de prueba usan claves `zz_*` y ids fijos `ffffffff-...`; los conteos son sobre esos ids, nunca sobre toda la
-- tabla (la cuenta de prueba puede tener recuerdos y mensajes previos).
-- Correr:
--   psql "<connection string>" -v user_a="'<uuid>'" -v user_b="'<uuid>'" -f supabase/tests/memoria-consolidacion.sql

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1 — RLS y permisos
-- ===========================================================================
begin;
  select set_config('t.a', :user_a, true), set_config('t.b', :user_b, true);
  update perfiles set memoria_activa = true where id in (:user_a, :user_b);
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto) values
    ('ffffffff-0000-0000-0000-0000000000a1', :user_a, 'yo', 'zz_a1', 'Uno'),
    ('ffffffff-0000-0000-0000-0000000000a2', :user_a, 'yo', 'zz_a2', 'Dos');
  insert into contradicciones_memoria (usuario_id, memoria_a, memoria_b, pregunta)
  values (:user_a, 'ffffffff-0000-0000-0000-0000000000a1', 'ffffffff-0000-0000-0000-0000000000a2', '¿Uno o dos?');

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from contradicciones_memoria where id is not null and memoria_a::text like 'ffffffff-%';
    if n <> 1 then raise exception 'FAIL: el dueño no ve su contradicción (%)', n; end if;
    raise notice 'PASS: el dueño lee su contradicción';
    begin
      update contradicciones_memoria set estado = 'resuelta' where memoria_a::text like 'ffffffff-%';
      raise exception 'FAIL: el dueño pudo actualizar directo';
    exception when insufficient_privilege then
      raise notice 'PASS: el dueño no escribe directo en contradicciones';
    end;
    begin
      perform count(*) from lotes_consolidacion;
      raise exception 'FAIL: un usuario leyó lotes_consolidacion';
    exception when insufficient_privilege then
      raise notice 'PASS: lotes_consolidacion no es accesible para un usuario';
    end;
    begin
      perform count(*) from lote_usuarios;
      raise exception 'FAIL: un usuario leyó lote_usuarios';
    exception when insufficient_privilege then
      raise notice 'PASS: lote_usuarios no es accesible para un usuario';
    end;
    begin
      perform candidatos_consolidacion(10, 3);
      raise exception 'FAIL: un usuario ejecutó candidatos_consolidacion';
    exception when insufficient_privilege then
      raise notice 'PASS: candidatos_consolidacion es solo del trabajador';
    end;
    begin
      perform aplicar_consolidacion(gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, '{}'::jsonb);
      raise exception 'FAIL: un usuario ejecutó aplicar_consolidacion';
    exception when insufficient_privilege then
      raise notice 'PASS: aplicar_consolidacion es solo del trabajador';
    end;
  end $$;
  reset role;

  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from contradicciones_memoria where memoria_a::text like 'ffffffff-%';
    if n <> 0 then raise exception 'FAIL: otro usuario ve una contradicción ajena (%)', n; end if;
    raise notice 'PASS: otro usuario no ve contradicciones ajenas';
  end $$;
rollback;

-- ===========================================================================
-- 2 — reservar_lote_consolidacion
-- ===========================================================================
begin;
  select set_config('t.a', :user_a, true), set_config('t.b', :user_b, true);
  update perfiles set memoria_activa = true where id = :user_a;
  update perfiles set memoria_activa = false where id = :user_b;
  do $$
  declare r record; n int; v_custom text; v_lote uuid;
  begin
    select * into r from reservar_lote_consolidacion(jsonb_build_array(
      jsonb_build_object('usuario_id', current_setting('t.a')::uuid, 'snapshot', '[]'::jsonb),
      jsonb_build_object('usuario_id', current_setting('t.b')::uuid, 'snapshot', '[]'::jsonb)));
    v_custom := r.o_custom_id;
    v_lote := r.o_lote_id;
    if v_custom !~ '^c_[0-9a-f]{32}$' then raise exception 'FAIL: custom_id no es opaco (%)', v_custom; end if;
    if position(replace(current_setting('t.a')::uuid::text, '-', '') in v_custom) > 0 or position(current_setting('t.a')::uuid::text in v_custom) > 0 then
      raise exception 'FAIL: el custom_id contiene el id de la persona';
    end if;
    raise notice 'PASS: custom_id opaco generado por la base';
    select count(*) into n from lote_usuarios where lote_id = v_lote;
    if n <> 1 then raise exception 'FAIL: reservó % personas y la otra tiene la memoria apagada', n; end if;
    raise notice 'PASS: la memoria apagada no se reserva';
    -- Una persona en un solo lote en vuelo.
    select count(*) into n from reservar_lote_consolidacion(jsonb_build_array(jsonb_build_object('usuario_id', current_setting('t.a')::uuid, 'snapshot', '[]'::jsonb)));
    if n <> 0 then raise exception 'FAIL: la misma persona entró en dos lotes en vuelo'; end if;
    if exists (select 1 from lotes_consolidacion l where l.id <> v_lote and l.usuarios = 0 and l.created_at > now() - interval '1 minute') then
      raise exception 'FAIL: quedó un lote vacío';
    end if;
    raise notice 'PASS: una persona en un solo lote en vuelo y sin lotes vacíos';
  end $$;
rollback;

-- ===========================================================================
-- 3 — aplicar_consolidacion
-- ===========================================================================
begin;
  select set_config('t.a', :user_a, true), set_config('t.b', :user_b, true);
  update perfiles set memoria_activa = true where id = :user_a;
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, usos, destacado) values
    ('ffffffff-0000-0000-0000-0000000000b1', :user_a, 'yo', 'zz_te_1', 'Toma té de tilo', 2, true),
    ('ffffffff-0000-0000-0000-0000000000b2', :user_a, 'yo', 'zz_te_2', 'Toma té de tilo de noche', 1, false),
    ('ffffffff-0000-0000-0000-0000000000b3', :user_a, 'yo', 'zz_cafe_si', 'Toma café', 0, false),
    ('ffffffff-0000-0000-0000-0000000000b4', :user_a, 'yo', 'zz_cafe_no', 'Dejó el café', 0, false),
    ('ffffffff-0000-0000-0000-0000000000b5', :user_a, 'yo', 'zz_otro', 'Camina por las mañanas', 0, false);
  do $$
  declare
    v_lote uuid; v_snap jsonb; v_plan jsonb; r record; n int; v_union uuid;
  begin
    select jsonb_object_agg(m.id::text, m.updated_at) into v_snap from memorias m where m.id::text like 'ffffffff-0000-0000-0000-0000000000b%';
    select o_lote_id into v_lote from reservar_lote_consolidacion(jsonb_build_array(
      jsonb_build_object('usuario_id', current_setting('t.a')::uuid, 'snapshot', '[]'::jsonb)));

    v_plan := jsonb_build_object(
      'unir', jsonb_build_array(jsonb_build_object('ids', jsonb_build_array('ffffffff-0000-0000-0000-0000000000b1', 'ffffffff-0000-0000-0000-0000000000b2'), 'texto', 'Toma té de tilo de noche', 'clave', 'zz_te')),
      'destacados', jsonb_build_array('ffffffff-0000-0000-0000-0000000000b5'),
      'contradicciones', jsonb_build_array(jsonb_build_object('a', 'ffffffff-0000-0000-0000-0000000000b4', 'b', 'ffffffff-0000-0000-0000-0000000000b3', 'pregunta', '¿Tomás café o lo dejaste?')));
    select * into r from aplicar_consolidacion(v_lote, current_setting('t.a')::uuid, v_plan, v_snap);
    if r.o_estado <> 'aplicado' or r.o_unidos <> 1 or r.o_contradicciones <> 1 then
      raise exception 'FAIL: resultado inesperado (%, %, %)', r.o_estado, r.o_unidos, r.o_contradicciones;
    end if;
    raise notice 'PASS: aplica unión y contradicción';

    select m.id into v_union from memorias m where m.usuario_id = current_setting('t.a')::uuid and m.clave = 'zz_te' and m.estado = 'vigente';
    if v_union is null then raise exception 'FAIL: no nació la unión'; end if;
    select count(*) into n from memorias m where m.id::text in ('ffffffff-0000-0000-0000-0000000000b1', 'ffffffff-0000-0000-0000-0000000000b2')
       and m.estado = 'reemplazado' and m.reemplazada_por_id = v_union;
    if n <> 2 then raise exception 'FAIL: los ingredientes no quedaron reemplazados por la unión (%)', n; end if;
    if (select origen from memorias where id = v_union) <> 'consolidacion' then raise exception 'FAIL: origen de la unión'; end if;
    if (select usos from memorias where id = v_union) <> 3 then raise exception 'FAIL: la unión no suma los usos'; end if;
    if not (select destacado from memorias where id::text = 'ffffffff-0000-0000-0000-0000000000b5') then raise exception 'FAIL: no destacó'; end if;
    raise notice 'PASS: unión con usos sumados, ingredientes reemplazados y destacado';

    -- La contradicción nace canónica (a < b) y pendiente.
    select count(*) into n from contradicciones_memoria c where c.usuario_id = current_setting('t.a')::uuid and c.estado = 'pendiente' and c.memoria_a < c.memoria_b
       and c.memoria_a::text like 'ffffffff-%';
    if n <> 1 then raise exception 'FAIL: la contradicción no quedó canónica/pendiente (%)', n; end if;
    raise notice 'PASS: contradicción canónica y pendiente';

    -- Idempotente.
    select * into r from aplicar_consolidacion(v_lote, current_setting('t.a')::uuid, v_plan, v_snap);
    if r.o_estado <> 'ya_aplicado' then raise exception 'FAIL: un segundo aplicar repitió el trabajo (%)', r.o_estado; end if;
    raise notice 'PASS: aplicar es idempotente';
  end $$;
rollback;

begin;
  select set_config('t.a', :user_a, true), set_config('t.b', :user_b, true);
  -- Snapshot vencido: lo que cambió o se borró mientras corría el lote NO revive ni se une.
  update perfiles set memoria_activa = true where id = :user_a;
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto) values
    ('ffffffff-0000-0000-0000-0000000000c1', :user_a, 'yo', 'zz_c1', 'Uno'),
    ('ffffffff-0000-0000-0000-0000000000c2', :user_a, 'yo', 'zz_c2', 'Uno repetido'),
    ('ffffffff-0000-0000-0000-0000000000c3', :user_a, 'yo', 'zz_c3', 'Tres');
  do $$
  declare v_lote uuid; v_snap jsonb; r record; n int;
  begin
    select jsonb_object_agg(m.id::text, m.updated_at) into v_snap from memorias m where m.id::text like 'ffffffff-0000-0000-0000-0000000000c%';
    select o_lote_id into v_lote from reservar_lote_consolidacion(jsonb_build_array(jsonb_build_object('usuario_id', current_setting('t.a')::uuid, 'snapshot', '[]'::jsonb)));
    -- Mientras corría el lote: la persona corrige c1 (cambia su updated_at) y olvida c3.
    update memorias set texto = 'Uno corregido', updated_at = now() + interval '1 second' where id::text = 'ffffffff-0000-0000-0000-0000000000c1';
    update memorias set estado = 'borrado', texto = null where id::text = 'ffffffff-0000-0000-0000-0000000000c3';
    select * into r from aplicar_consolidacion(v_lote, current_setting('t.a')::uuid, jsonb_build_object(
      'unir', jsonb_build_array(jsonb_build_object('ids', jsonb_build_array('ffffffff-0000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c2'), 'texto', 'Uno', 'clave', 'zz_uno')),
      'destacados', jsonb_build_array('ffffffff-0000-0000-0000-0000000000c3'),
      'contradicciones', jsonb_build_array(jsonb_build_object('a', 'ffffffff-0000-0000-0000-0000000000c2', 'b', 'ffffffff-0000-0000-0000-0000000000c3', 'pregunta', 'p'))), v_snap);
    if r.o_unidos <> 0 or r.o_contradicciones <> 0 then raise exception 'FAIL: aplicó sobre un snapshot vencido (%, %)', r.o_unidos, r.o_contradicciones; end if;
    select count(*) into n from memorias m where m.id::text = 'ffffffff-0000-0000-0000-0000000000c3' and (m.estado <> 'borrado' or m.texto is not null or m.destacado);
    if n <> 0 then raise exception 'FAIL: un recuerdo borrado revivió'; end if;
    if exists (select 1 from memorias m where m.usuario_id = current_setting('t.a')::uuid and m.clave = 'zz_uno') then raise exception 'FAIL: se creó una unión con un ingrediente cambiado'; end if;
    raise notice 'PASS: snapshot vencido = se saltea; un borrado no revive';
  end $$;
rollback;

begin;
  select set_config('t.a', :user_a, true), set_config('t.b', :user_b, true);
  -- Memoria apagada mientras corría el lote: no se aplica nada.
  update perfiles set memoria_activa = true where id = :user_a;
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto) values
    ('ffffffff-0000-0000-0000-0000000000d1', :user_a, 'yo', 'zz_d1', 'Uno'),
    ('ffffffff-0000-0000-0000-0000000000d2', :user_a, 'yo', 'zz_d2', 'Uno de nuevo');
  do $$
  declare v_lote uuid; v_snap jsonb; r record;
  begin
    select jsonb_object_agg(m.id::text, m.updated_at) into v_snap from memorias m where m.id::text like 'ffffffff-0000-0000-0000-0000000000d%';
    select o_lote_id into v_lote from reservar_lote_consolidacion(jsonb_build_array(jsonb_build_object('usuario_id', current_setting('t.a')::uuid, 'snapshot', '[]'::jsonb)));
    update perfiles set memoria_activa = false where id = current_setting('t.a')::uuid;
    select * into r from aplicar_consolidacion(v_lote, current_setting('t.a')::uuid, jsonb_build_object('unir', jsonb_build_array(jsonb_build_object('ids', jsonb_build_array('ffffffff-0000-0000-0000-0000000000d1', 'ffffffff-0000-0000-0000-0000000000d2'), 'texto', 'Uno', 'clave', 'zz_d')), 'destacados', '[]'::jsonb, 'contradicciones', '[]'::jsonb), v_snap);
    if r.o_estado <> 'memoria_apagada' then raise exception 'FAIL: aplicó con la memoria apagada (%)', r.o_estado; end if;
    if exists (select 1 from memorias m where m.usuario_id = current_setting('t.a')::uuid and m.clave = 'zz_d') then raise exception 'FAIL: creó una unión con la memoria apagada'; end if;
    raise notice 'PASS: memoria apagada = no se aplica';
  end $$;
rollback;

-- ===========================================================================
-- 4 — Cascada (trigger)
-- ===========================================================================
begin;
  select set_config('t.a', :user_a, true), set_config('t.b', :user_b, true);
  update perfiles set memoria_activa = true where id = :user_a;
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto) values
    ('ffffffff-0000-0000-0000-0000000000e1', :user_a, 'yo', 'zz_e1', 'Uno'),
    ('ffffffff-0000-0000-0000-0000000000e2', :user_a, 'yo', 'zz_e2', 'Uno otra vez');
  do $$
  declare v_lote uuid; v_snap jsonb; v_union uuid; n int;
  begin
    select jsonb_object_agg(m.id::text, m.updated_at) into v_snap from memorias m where m.id::text like 'ffffffff-0000-0000-0000-0000000000e%';
    select o_lote_id into v_lote from reservar_lote_consolidacion(jsonb_build_array(jsonb_build_object('usuario_id', current_setting('t.a')::uuid, 'snapshot', '[]'::jsonb)));
    perform aplicar_consolidacion(v_lote, current_setting('t.a')::uuid, jsonb_build_object('unir', jsonb_build_array(jsonb_build_object('ids', jsonb_build_array('ffffffff-0000-0000-0000-0000000000e1', 'ffffffff-0000-0000-0000-0000000000e2'), 'texto', 'Uno', 'clave', 'zz_e')), 'destacados', '[]'::jsonb, 'contradicciones', '[]'::jsonb), v_snap);
    select id into v_union from memorias where usuario_id = current_setting('t.a')::uuid and clave = 'zz_e' and estado = 'vigente';

    -- Borrar un ingrediente (p. ej. por "Borrar historial") arrastra a la unión y al otro ingrediente: no queda texto derivado.
    update memorias set estado = 'borrado', texto = null where id::text = 'ffffffff-0000-0000-0000-0000000000e1';
    select count(*) into n from memorias m where m.id in (v_union) and (m.estado <> 'borrado' or m.texto is not null);
    if n <> 0 then raise exception 'FAIL: la unión sobrevivió a que se borre un ingrediente'; end if;
    select count(*) into n from memorias m where m.id::text like 'ffffffff-0000-0000-0000-0000000000e%' and (m.estado <> 'borrado' or m.texto is not null);
    if n <> 0 then raise exception 'FAIL: quedó texto de la unión o de un ingrediente (%)', n; end if;
    raise notice 'PASS: borrar un ingrediente borra la unión y el resto de los ingredientes';
  end $$;
rollback;

-- ===========================================================================
-- 5 — resolver_contradiccion
-- ===========================================================================
begin;
  select set_config('t.a', :user_a, true), set_config('t.b', :user_b, true);
  update perfiles set memoria_activa = true where id in (:user_a, :user_b);
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto) values
    ('ffffffff-0000-0000-0000-0000000000f1', :user_a, 'yo', 'zz_f1', 'Toma café'),
    ('ffffffff-0000-0000-0000-0000000000f2', :user_a, 'yo', 'zz_f2', 'Dejó el café'),
    ('ffffffff-0000-0000-0000-0000000000f3', :user_a, 'yo', 'zz_f3', 'Sale a caminar'),
    ('ffffffff-0000-0000-0000-0000000000f4', :user_a, 'yo', 'zz_f4', 'No sale de casa');
  insert into contradicciones_memoria (id, usuario_id, memoria_a, memoria_b, pregunta) values
    ('ffffffff-0000-0000-0000-00000000f001', :user_a, 'ffffffff-0000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-0000000000f2', '¿Café?'),
    ('ffffffff-0000-0000-0000-00000000f002', :user_a, 'ffffffff-0000-0000-0000-0000000000f3', 'ffffffff-0000-0000-0000-0000000000f4', '¿Caminatas?');

  -- Otro usuario no puede resolver la contradicción ajena.
  select set_config('request.jwt.claims', json_build_object('sub', :user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r text;
  begin
    select o_resultado into r from resolver_contradiccion('ffffffff-0000-0000-0000-00000000f001', 'a');
    if r <> 'no_encontrada' then raise exception 'FAIL: otro usuario resolvió una contradicción ajena (%)', r; end if;
    raise notice 'PASS: una contradicción ajena no se puede resolver';
  end $$;
  reset role;

  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r text; n int;
  begin
    begin
      perform resolver_contradiccion('ffffffff-0000-0000-0000-00000000f001', 'cualquiera');
      raise exception 'FAIL: aceptó un valor inválido';
    exception when sqlstate '22023' then
      raise notice 'PASS: valor inválido rechazado';
    end;

    -- 'a': vale el primero; el segundo queda reemplazado (historial) apuntando al que vale, y no se pierde su texto.
    select o_resultado into r from resolver_contradiccion('ffffffff-0000-0000-0000-00000000f001', 'a');
    if r <> 'ok' then raise exception 'FAIL: resolver a devolvió %', r; end if;
    select count(*) into n from memorias m where m.id::text = 'ffffffff-0000-0000-0000-0000000000f2' and m.estado = 'reemplazado'
       and m.reemplazada_por_id::text = 'ffffffff-0000-0000-0000-0000000000f1' and m.texto is not null;
    if n <> 1 then raise exception 'FAIL: el perdedor no quedó como historial'; end if;
    if (select estado from memorias where id::text = 'ffffffff-0000-0000-0000-0000000000f1') <> 'vigente' then raise exception 'FAIL: el ganador dejó de estar vigente'; end if;
    if (select pregunta from contradicciones_memoria where id::text = 'ffffffff-0000-0000-0000-00000000f001') <> '' then raise exception 'FAIL: quedó la pregunta'; end if;
    raise notice 'PASS: resolver a';

    -- Ya cerrada.
    select o_resultado into r from resolver_contradiccion('ffffffff-0000-0000-0000-00000000f001', 'b');
    if r <> 'no_encontrada' then raise exception 'FAIL: resolvió dos veces (%)', r; end if;
    raise notice 'PASS: una contradicción cerrada no se vuelve a resolver';

    -- 'ninguna': se olvidan las dos (sin texto) y se invalida el resumen.
    select o_resultado into r from resolver_contradiccion('ffffffff-0000-0000-0000-00000000f002', 'ninguna');
    if r <> 'ok' then raise exception 'FAIL: resolver ninguna devolvió %', r; end if;
    select count(*) into n from memorias m where m.id::text in ('ffffffff-0000-0000-0000-0000000000f3', 'ffffffff-0000-0000-0000-0000000000f4') and (m.estado <> 'borrado' or m.texto is not null);
    if n <> 0 then raise exception 'FAIL: ninguna no olvidó los dos recuerdos'; end if;
    raise notice 'PASS: resolver ninguna olvida los dos';
  end $$;
  reset role;
rollback;

begin;
  select set_config('t.a', :user_a, true), set_config('t.b', :user_b, true);
  -- 'ambas' no toca los recuerdos y 'obsoleta' si uno ya no está vigente.
  update perfiles set memoria_activa = true where id = :user_a;
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto) values
    ('ffffffff-0000-0000-0000-000000000091', :user_a, 'yo', 'zz_g1', 'Uno'),
    ('ffffffff-0000-0000-0000-000000000092', :user_a, 'yo', 'zz_g2', 'Dos');
  insert into contradicciones_memoria (id, usuario_id, memoria_a, memoria_b, pregunta)
  values ('ffffffff-0000-0000-0000-00000000f003', :user_a, 'ffffffff-0000-0000-0000-000000000091', 'ffffffff-0000-0000-0000-000000000092', '¿?');
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare r text; n int;
  begin
    select o_resultado into r from resolver_contradiccion('ffffffff-0000-0000-0000-00000000f003', 'ambas');
    select count(*) into n from memorias m where m.id::text like 'ffffffff-0000-0000-0000-00000000009%' and m.estado = 'vigente';
    if r <> 'ok' or n <> 2 then raise exception 'FAIL: ambas tocó los recuerdos (%, %)', r, n; end if;
    raise notice 'PASS: resolver ambas deja los dos vigentes';
  end $$;
  reset role;
rollback;

-- ===========================================================================
-- 6 — Privacidad: lo pendiente se descarta y los excluidos no viajan
-- ===========================================================================
begin;
  select set_config('t.a', :user_a, true), set_config('t.b', :user_b, true);
  update perfiles set memoria_activa = true where id = :user_a;
  insert into sesiones_chat (id, usuario_id) values ('ffffffff-0000-0000-0000-0000000000d9', :user_a);
  insert into mensajes_chat (id, usuario_id, sesion_id, role, contenido, excluido_memoria)
  values ('ffffffff-0000-0000-0000-0000000000d8', :user_a, 'ffffffff-0000-0000-0000-0000000000d9', 'user', 'Dato olvidado', true);
  insert into memorias (id, usuario_id, sobre_tipo, clave, texto, mensaje_origen_id) values
    ('ffffffff-0000-0000-0000-000000000081', :user_a, 'yo', 'zz_h1', 'De un mensaje excluido', 'ffffffff-0000-0000-0000-0000000000d8'),
    ('ffffffff-0000-0000-0000-000000000082', :user_a, 'yo', 'zz_h2', 'Normal'),
    ('ffffffff-0000-0000-0000-000000000083', :user_a, 'yo', 'zz_h3', 'Otro normal');
  do $$
  declare n int;
  begin
    select count(*) into n from recuerdos_para_consolidar(current_setting('t.a')::uuid, 200) r where r.o_id::text like 'ffffffff-0000-0000-0000-00000000008%';
    if n <> 2 then raise exception 'FAIL: viajan recuerdos de un mensaje excluido (%)', n; end if;
    raise notice 'PASS: los recuerdos de mensajes excluidos no viajan';
  end $$;

  -- Pedido en vuelo + contradicción pendiente, y la persona usa "Olvidar todo".
  insert into contradicciones_memoria (id, usuario_id, memoria_a, memoria_b, pregunta)
  values ('ffffffff-0000-0000-0000-00000000f004', :user_a, 'ffffffff-0000-0000-0000-000000000082', 'ffffffff-0000-0000-0000-000000000083', '¿?');
  select o_lote_id from reservar_lote_consolidacion(jsonb_build_array(jsonb_build_object('usuario_id', :user_a, 'snapshot', '[]'::jsonb))) \gset
  select set_config('request.jwt.claims', json_build_object('sub', :user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) as borrados from olvidar_todo_memoria() \gset
  reset role;
  do $$
  declare n int;
  begin
    select count(*) into n from lote_usuarios u where u.usuario_id = current_setting('t.a')::uuid and u.estado = 'enviado';
    if n <> 0 then raise exception 'FAIL: quedó un pedido en vuelo tras olvidar todo (%)', n; end if;
    select count(*) into n from contradicciones_memoria c where c.usuario_id = current_setting('t.a')::uuid and c.estado = 'pendiente';
    if n <> 0 then raise exception 'FAIL: quedó una contradicción pendiente tras olvidar todo (%)', n; end if;
    select count(*) into n from contradicciones_memoria c where c.id::text = 'ffffffff-0000-0000-0000-00000000f004' and c.pregunta <> '';
    if n <> 0 then raise exception 'FAIL: quedó texto de la pregunta'; end if;
    raise notice 'PASS: olvidar todo descarta pedidos en vuelo y contradicciones';
  end $$;
rollback;
