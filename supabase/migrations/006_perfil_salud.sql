-- Vitapp — perfil médico completo (ResumenSaludScreen.jsx / MiSaludScreen.jsx
-- / encuesta de onboarding). Aditiva sobre perfiles.

alter table perfiles
  add column fecha_nacimiento date,
  add column edad_rango text, -- grueso, de la encuesta de onboarding; se vuelve
                                -- redundante en cuanto se carga fecha_nacimiento
  add column genero text,
  add column grupo_sanguineo text,
  add column altura_cm numeric,
  add column peso_kg numeric,
  add column condiciones jsonb not null default '[]', -- [{label, tipo: 'permanente'|'temporal', desde}]
  add column alergias text[] not null default '{}',
  add column obra_social text,
  add column numero_afiliado text,
  add column contacto_emergencia_nombre text,
  add column contacto_emergencia_telefono text,
  add column onboarding_completado_at timestamptz;
