-- Metadata inventory for the Supabase SQL Editor. Run the whole file.
-- No application rows, function source, migration statements or cron commands.
-- Optional catalogs are returned as XML because their relations may not exist.
begin read only;
set local statement_timeout = '20s';
set local lock_timeout = '1s';

with objects as (
  select c.oid, c.relname, c.relkind, c.relowner, c.relacl,
         c.relrowsecurity, c.relforcerowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
), routines as (
  select p.* from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p', 'w')
), items(section, item) as (
  select 'relations', jsonb_build_object(
    'name', o.relname, 'kind', o.relkind,
    'owner', pg_catalog.pg_get_userbyid(o.relowner),
    'rls_enabled', o.relrowsecurity, 'rls_forced', o.relforcerowsecurity)
  from objects o
  union all
  select 'columns', jsonb_build_object(
    'relation', o.relname, 'position', a.attnum, 'name', a.attname,
    'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull, 'identity', a.attidentity,
    'generated', a.attgenerated,
    'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid))
  from objects o
  join pg_catalog.pg_attribute a on a.attrelid = o.oid
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped and o.relkind <> 'S'
  union all
  select 'constraints', jsonb_build_object(
    'relation', o.relname, 'name', c.conname, 'type', c.contype,
    'validated', c.convalidated, 'deferrable', c.condeferrable,
    'initially_deferred', c.condeferred,
    'definition', pg_catalog.pg_get_constraintdef(c.oid))
  from pg_catalog.pg_constraint c join objects o on o.oid = c.conrelid
  union all
  select 'indexes', jsonb_build_object(
    'relation', o.relname, 'name', x.relname,
    'unique', i.indisunique, 'valid', i.indisvalid, 'ready', i.indisready,
    'definition', pg_catalog.pg_get_indexdef(i.indexrelid))
  from pg_catalog.pg_index i
  join objects o on o.oid = i.indrelid
  join pg_catalog.pg_class x on x.oid = i.indexrelid
  union all
  select 'policies', jsonb_build_object(
    'schema', schemaname, 'relation', tablename, 'name', policyname,
    'permissive', permissive, 'roles', roles, 'command', cmd,
    'using', qual, 'with_check', with_check)
  from pg_catalog.pg_policies
  where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')
  union all
  select 'relation_grants', jsonb_build_object(
    'relation', o.relname,
    'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,
    'grantor', pg_catalog.pg_get_userbyid(a.grantor),
    'privilege', a.privilege_type, 'grantable', a.is_grantable)
  from objects o
  cross join lateral pg_catalog.aclexplode(coalesce(o.relacl,
    pg_catalog.acldefault(case when o.relkind = 'S' then 's'::"char" else 'r'::"char" end,
      o.relowner))) a
  union all
  select 'column_grants', jsonb_build_object(
    'relation', o.relname, 'column', c.attname,
    'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,
    'privilege', a.privilege_type, 'grantable', a.is_grantable)
  from objects o
  join pg_catalog.pg_attribute c on c.attrelid = o.oid
  cross join lateral pg_catalog.aclexplode(c.attacl) a
  where c.attnum > 0 and not c.attisdropped
  union all
  select 'triggers', jsonb_build_object(
    'relation', o.relname, 'name', t.tgname, 'enabled', t.tgenabled,
    'event_bits', t.tgtype, 'function', t.tgfoid::regprocedure::text,
    'argument_count', t.tgnargs)
  from pg_catalog.pg_trigger t join objects o on o.oid = t.tgrelid
  where not t.tgisinternal
  union all
  select 'routines', jsonb_build_object(
    'signature', p.oid::regprocedure::text, 'kind', p.prokind,
    'result', pg_catalog.pg_get_function_result(p.oid),
    'owner', pg_catalog.pg_get_userbyid(p.proowner), 'language', l.lanname,
    'security_definer', p.prosecdef, 'volatility', p.provolatile,
    'search_path', (select v from unnest(p.proconfig) v where v like 'search_path=%' limit 1),
    'definition_md5', md5(pg_catalog.pg_get_functiondef(p.oid)))
  from routines p join pg_catalog.pg_language l on l.oid = p.prolang
  union all
  select 'routine_grants', jsonb_build_object(
    'signature', p.oid::regprocedure::text,
    'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,
    'privilege', a.privilege_type, 'grantable', a.is_grantable)
  from routines p
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,
    pg_catalog.acldefault('f', p.proowner))) a
  union all
  select 'extensions', jsonb_build_object(
    'name', e.extname, 'version', e.extversion, 'schema', n.nspname)
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  union all
  select 'roles', jsonb_build_object(
    'name', rolname, 'superuser', rolsuper, 'inherit', rolinherit,
    'bypass_rls', rolbypassrls, 'can_login', rolcanlogin)
  from pg_catalog.pg_roles
  where rolname in ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin')
  union all
  select 'schema_grants', jsonb_build_object(
    'schema', n.nspname,
    'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,
    'privilege', a.privilege_type, 'grantable', a.is_grantable)
  from pg_catalog.pg_namespace n
  cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl,
    pg_catalog.acldefault('n', n.nspowner))) a
  where n.nspname in ('public', 'storage')
), numbered as (
  select section, item, row_number() over (partition by section order by item::text) as rn
  from items
), inventory as (
  select section, jsonb_build_object(
    'total', count(*), 'truncated', count(*) > 2000,
    'items', jsonb_agg(item order by rn) filter (where rn <= 2000)) as payload
  from numbered group by section
), optional_relations as materialized (
  select
    (select oid from pg_catalog.pg_namespace where nspname = 'supabase_migrations') as migration_schema,
    (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'supabase_migrations' and c.relname = 'schema_migrations') as migration_table,
    (select oid from pg_catalog.pg_namespace where nspname = 'cron') as cron_schema,
    (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'cron' and c.relname = 'job') as cron_table
), optional_catalogs as (
  select 'migration_versions' as section,
    case
      when r.migration_schema is null
        then jsonb_build_object('status', 'unavailable', 'reason', 'schema_not_found')
      when not has_schema_privilege(r.migration_schema, 'USAGE')
        then jsonb_build_object('status', 'unavailable', 'reason', 'schema_usage_missing')
      when r.migration_table is null
        then jsonb_build_object('status', 'unavailable', 'reason', 'relation_not_found')
      when not has_table_privilege(r.migration_table, 'SELECT')
        then jsonb_build_object('status', 'unavailable', 'reason', 'select_privilege_missing')
      when not exists (select 1 from pg_catalog.pg_attribute
        where attrelid = r.migration_table
          and attname = 'version' and not attisdropped)
        then jsonb_build_object('status', 'unavailable', 'reason', 'version_column_missing')
      else jsonb_build_object('status', 'available', 'format', 'xml', 'row_limit', 2000,
        'rows', query_to_xml(
          'select version from supabase_migrations.schema_migrations order by version limit 2000',
          false, true, '')::text)
    end as payload
  from optional_relations r
  union all
  select 'cron_jobs',
    case
      when r.cron_schema is null
        then jsonb_build_object('status', 'unavailable', 'reason', 'schema_not_found')
      when not has_schema_privilege(r.cron_schema, 'USAGE')
        then jsonb_build_object('status', 'unavailable', 'reason', 'schema_usage_missing')
      when r.cron_table is null
        then jsonb_build_object('status', 'unavailable', 'reason', 'relation_not_found')
      when not has_table_privilege(r.cron_table, 'SELECT')
        then jsonb_build_object('status', 'unavailable', 'reason', 'select_privilege_missing')
      when (select count(*) from pg_catalog.pg_attribute
        where attrelid = r.cron_table and not attisdropped
          and attname in ('jobid', 'jobname', 'schedule', 'active')) <> 4
        then jsonb_build_object('status', 'unavailable', 'reason', 'expected_columns_missing')
      else jsonb_build_object('status', 'available', 'format', 'xml', 'row_limit', 2000,
        'visibility', 'rows_visible_to_current_role_only',
        'rows', query_to_xml(
          'select jobid, jobname, schedule, active from cron.job order by jobid limit 2000',
          false, true, '')::text)
    end
  from optional_relations r
)
select jsonb_build_object(
  'inventory_format', 'vita-schema-metadata/v1',
  'collected_at', transaction_timestamp(),
  'postgres_version', current_setting('server_version'),
  'executing_role', current_user,
  'transaction_read_only', current_setting('transaction_read_only'),
  'scope', 'public metadata; storage.objects policies; optional migration and cron metadata',
  'limitations', jsonb_build_array(
    'No application rows or function source; definition hashes are comparison hints, not proof of equivalence.',
    'Optional catalogs and cron jobs can be filtered by permissions or RLS.',
    'Empty sections are absent from catalogs; optional sections report availability explicitly.',
    'View bodies, trigger arguments, role memberships and default ACLs require a later targeted inspection.',
    'Optional sections return at most 2000 rows; a full 2000-row result requires checking for truncation.'),
  'catalogs', coalesce((select jsonb_object_agg(section, payload) from inventory), '{}'::jsonb),
  'optional_catalogs', (select jsonb_object_agg(section, payload) from optional_catalogs)
) as schema_inventory;

rollback;
