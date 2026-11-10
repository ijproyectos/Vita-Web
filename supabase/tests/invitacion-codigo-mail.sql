-- Topes por mail del código de entrada de invitaciones (054). Correr con psql -1
-- contra una base con la 054 aplicada; todo se revierte al final.
begin;
do $$
declare
  v_elder uuid := gen_random_uuid(); v_elder2 uuid := gen_random_uuid();
  v1 uuid; v2 uuid; r text; ok boolean; i int;
begin
  insert into auth.users (id, email) values (v_elder, 'elder-' || v_elder || '@example.com'); insert into auth.users (id, email) values (v_elder2, 'elder-' || v_elder2 || '@example.com');
  insert into vinculos_cuidador (elder_id, email_invitado) values (v_elder, 'x@example.com') returning id into v1;
  insert into vinculos_cuidador (elder_id, email_invitado) values (v_elder2, 'x@example.com') returning id into v2;

  -- Fallos por mail suman entre invitaciones y reenvíos.
  r := guardar_codigo_mail_invitacion(v1, 'h1', 'X@example.com');
  if r <> 'ok' then raise exception 'FAIL: primer envío (%)', r; end if;
  for i in 1..5 loop
    perform verificar_codigo_mail_invitacion(v1, 'mal', 'x@example.com');
  end loop;
  update codigos_mail_invitacion set enviado_at = now() - interval '2 minutes' where vinculo_id = v1;
  r := guardar_codigo_mail_invitacion(v1, 'h2', 'x@example.com');
  if r <> 'ok' then raise exception 'FAIL: reenvío (%)', r; end if;
  for i in 1..5 loop
    perform verificar_codigo_mail_invitacion(v1, 'mal', 'x@example.com');
  end loop;
  r := guardar_codigo_mail_invitacion(v2, 'h3', 'x@example.com');
  ok := verificar_codigo_mail_invitacion(v2, 'h3', 'x@example.com');
  if ok then raise exception 'FAIL: dejó verificar pasados 10 fallos del mail'; end if;
  ok := verificar_codigo_mail_invitacion(v1, 'h2', 'x@example.com');
  if ok then raise exception 'FAIL: el código correcto pasó con el mail bloqueado'; end if;
  raise notice 'PASS: 10 fallos por mail bloquean aunque se reenvíe o cambie la invitación';

  -- Tope de 5 envíos por hora por mail.
  delete from limites_mail_invitacion where email = 'x@example.com';
  for i in 1..5 loop
    update codigos_mail_invitacion set enviado_at = now() - interval '2 minutes';
    r := guardar_codigo_mail_invitacion(v1, 'k' || i, 'x@example.com');
    if r <> 'ok' then raise exception 'FAIL: envío % (%)', i, r; end if;
  end loop;
  update codigos_mail_invitacion set enviado_at = now() - interval '2 minutes';
  r := guardar_codigo_mail_invitacion(v2, 'k6', 'x@example.com');
  if r <> 'tope' then raise exception 'FAIL: sexto envío (%)', r; end if;
  raise notice 'PASS: 5 envíos por hora por mail';

  -- Consumo de un solo uso.
  delete from limites_mail_invitacion where email = 'x@example.com';
  update codigos_mail_invitacion set enviado_at = now() - interval '2 minutes', expira_at = now() + interval '5 minutes', hash = 'z', intentos = 0 where vinculo_id = v1;
  if not verificar_codigo_mail_invitacion(v1, 'z', 'x@example.com') then raise exception 'FAIL: código correcto rechazado'; end if;
  if not consumir_codigo_mail_invitacion(v1, 'z') then raise exception 'FAIL: no consumió'; end if;
  if consumir_codigo_mail_invitacion(v1, 'z') then raise exception 'FAIL: se consumió dos veces'; end if;
  raise notice 'PASS: consumo de un solo uso';
end $$;
rollback;
