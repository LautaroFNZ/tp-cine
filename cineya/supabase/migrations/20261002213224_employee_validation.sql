-- ¿El usuario logueado es empleado o administrador?
create function public.is_staff()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('empleado', 'admin')
  );
$$;

-- Valida la entrada de una compra. Solo se puede una vez.
create function public.validate_entry(p_code text)
returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(p_code));
  v_validated timestamptz;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;

  -- Se marca solo si todavía no estaba validada: si dos empleados lo intentan a la vez, gana uno
  update public.purchases
  set entry_validated_at = now(),
      entry_validated_by = (select auth.uid())
  where code = v_code and entry_validated_at is null
  returning entry_validated_at into v_validated;

  if v_validated is null then
    if exists (select 1 from public.purchases where code = v_code) then
      raise exception 'already_used';
    end if;
    raise exception 'purchase_not_found';
  end if;

  return v_validated;
end;
$$;

-- Marca los productos del candy bar como retirados. Solo se puede una vez.
create function public.deliver_candy(p_code text)
returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(p_code));
  v_delivered timestamptz;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;

  update public.purchases p
  set candy_delivered_at = now(),
      candy_delivered_by = (select auth.uid())
  where p.code = v_code
    and p.candy_delivered_at is null
    and exists (select 1 from public.purchase_items i where i.purchase_id = p.id)
  returning p.candy_delivered_at into v_delivered;

  if v_delivered is null then
    if not exists (select 1 from public.purchases where code = v_code) then
      raise exception 'purchase_not_found';
    end if;
    if not exists (
      select 1 from public.purchases p
      join public.purchase_items i on i.purchase_id = p.id
      where p.code = v_code
    ) then
      raise exception 'no_candy';
    end if;
    raise exception 'already_delivered';
  end if;

  return v_delivered;
end;
$$;

revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.validate_entry(text) from public, anon;
revoke execute on function public.deliver_candy(text) from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.validate_entry(text) to authenticated;
grant execute on function public.deliver_candy(text) to authenticated;