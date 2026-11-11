-- Excel import of master data (PRD: Import dan export master data).
--
-- The server reads and validates the workbook (lib/master-import.ts) and sends only the rows
-- that are new (no id) or changed (with id). This function applies them all in one
-- transaction: any failure rolls everything back. Admin only. Nothing is ever deleted.
--
-- p_payload: {"file": "konveko-master.xlsx",
--             "tables": {"product_variant": [{"id": null, "sheet": "Variant", "row": 2, "sku": ...}, ...], ...}}
--
-- Every changed field of an existing row goes to audit_log (old -> new); a new row is one
-- audit_log entry. Table and column names come from the whitelist below, never from input.

create function app.import_master(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_reason text := 'Import Excel ' || coalesce(nullif(trim(p_payload->>'file'), ''), '(tanpa nama)');
  v_fields constant jsonb := '{
    "product_variant": ["sku", "product_name", "size", "color", "is_active"],
    "fabric_roll":     ["code", "material", "color", "length_or_weight", "unit", "supplier"],
    "location":        ["code", "kind", "note", "is_active"],
    "holder":          ["type", "name", "phone", "is_active"],
    "reason":          ["type", "code", "label", "is_active"]
  }'::jsonb;
  v_key constant jsonb := '{"product_variant": "sku", "fabric_roll": "code", "location": "code", "holder": "name", "reason": "code"}'::jsonb;
  v_table text;
  v_cols text[];
  v_list text;
  v_rows jsonb;
  v_row jsonb;
  v_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_col text;
  v_diff integer;
  v_added integer;
  v_changed integer;
  v_where text;
  v_key_value text;
  v_result jsonb := '{}'::jsonb;
begin
  -- One exception handler for the whole import, not one per row: a per-row handler is a
  -- subtransaction per row, too slow for thousands of rows within the statement timeout.
  -- v_where keeps the sheet and row being written, so the message still points at it.
  perform app.require_role(u, 'admin', 'import master data');
  if jsonb_typeof(p_payload->'tables') is distinct from 'object' then
    raise exception 'File import kosong.' using detail = 'import_empty';
  end if;

  for v_table in select jsonb_object_keys(p_payload->'tables') loop
    if not v_fields ? v_table then
      raise exception 'Data % tidak bisa di-import.', v_table using detail = 'import_table';
    end if;
    v_cols := array(select jsonb_array_elements_text(v_fields->v_table));
    v_list := array_to_string(array(select quote_ident(c) from unnest(v_cols) c), ', ');
    v_rows := p_payload->'tables'->v_table;
    v_added := 0;
    v_changed := 0;

    for v_row in select * from jsonb_array_elements(v_rows) loop
      v_where := format('Sheet %s baris %s', v_row->>'sheet', v_row->>'row');
      v_key_value := v_row->>(v_key->>v_table);
        if v_row->>'id' is null then
          execute format(
            'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id',
            v_table, v_list, v_list, v_table)
          using v_row into v_id;
          insert into public.audit_log (entity, entity_id, field, old_value, new_value, reason, changed_by)
          values (v_table, v_id, 'created', null, v_row->>(v_key->>v_table), v_reason, u.id);
          v_added := v_added + 1;
        else
          v_id := (v_row->>'id')::uuid;
          execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_table)
          using v_id into v_old;
          if v_old is null then
            raise exception '%: data ini sudah tidak ada. Preview ulang.', v_where using detail = 'import_stale';
          end if;
          -- normalise types the way the column stores them (numeric scale, enums, booleans)
          execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I, $1) r', v_table)
          using v_row into v_new;

          v_diff := 0;
          foreach v_col in array v_cols loop
            if (v_old->v_col) is distinct from (v_new->v_col) then
              v_diff := v_diff + 1;
              insert into public.audit_log (entity, entity_id, field, old_value, new_value, reason, changed_by)
              values (v_table, v_id, v_col, v_old->>v_col, v_new->>v_col, v_reason, u.id);
            end if;
          end loop;

          if v_diff > 0 then
            execute format(
              'update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where t.id = $2',
              v_table, v_list, v_list, v_table)
            using v_row, v_id;
            v_changed := v_changed + 1;
          end if;
        end if;
    end loop;

    v_result := v_result || jsonb_build_object(v_table, jsonb_build_object('added', v_added, 'changed', v_changed));
  end loop;

  return v_result;
exception
  when unique_violation then
    raise exception '%: % sudah dipakai data lain.', v_where, v_key_value using detail = 'import_duplicate';
  when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception '%: isian tidak valid.', v_where using detail = 'import_invalid';
end $$;

create function public.import_master(p_payload jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.import_master(p_payload) $$;

revoke all on function app.import_master(jsonb), public.import_master(jsonb) from public, anon;
grant execute on function app.import_master(jsonb), public.import_master(jsonb) to authenticated;
