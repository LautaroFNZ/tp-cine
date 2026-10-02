-- Comprueba que hoy se puede usar el código: desde las 00:00 del día de la función
-- (hora de Argentina) hasta que la función termina.
create function public.check_function_window(p_code text)
returns void
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_zone constant text := 'America/Argentina/Buenos_Aires';
  v_start timestamptz;
  v_end timestamptz;
begin
  select s.starts_at, s.ends_at into v_start, v_end
  from public.purchases p
  join lateral (
    select t.showtime_id from public.tickets t where t.purchase_id = p.id limit 1
  ) tk on true
  join public.showtimes s on s.id = tk.showtime_id
  where p.code = p_code;

  if v_start is null then
    raise exception 'purchase_not_found';
  end if;

  -- Antes del día de la función
  if now() < (date_trunc('day', v_start at time zone v_zone) at time zone v_zone) then
    raise exception 'too_early';
  end if;

  -- Después de que terminó la función
  if now() > v_end then
    raise exception 'function_ended';
  end if;
end;
$$;

revoke execute on function public.check_function_window(text) from public, anon, authenticated;

-- Validar la entrada: ahora también respeta el día de la función
create or replace function public.validate_entry(p_code text)
returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(p_code));
  v_purchase record;
  v_validated timestamptz;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;

  select p.id, p.entry_validated_at into v_purchase
  from public.purchases p
  where p.code = v_code;

  if not found then
    raise exception 'purchase_not_found';
  end if;
  if v_purchase.entry_validated_at is not null then
    raise exception 'already_used';
  end if;

  perform public.check_function_window(v_code);

  -- Se marca solo si todavía no estaba validada: si dos empleados lo intentan a la vez, gana uno
  update public.purchases
  set entry_validated_at = now(),
      entry_validated_by = (select auth.uid())
  where id = v_purchase.id and entry_validated_at is null
  returning entry_validated_at into v_validated;

  if v_validated is null then
    raise exception 'already_used';
  end if;

  return v_validated;
end;
$$;

-- Entregar el candy: mismas reglas
create or replace function public.deliver_candy(p_code text)
returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(p_code));
  v_purchase record;
  v_delivered timestamptz;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;

  select p.id, p.candy_delivered_at into v_purchase
  from public.purchases p
  where p.code = v_code;

  if not found then
    raise exception 'purchase_not_found';
  end if;
  if not exists (select 1 from public.purchase_items i where i.purchase_id = v_purchase.id) then
    raise exception 'no_candy';
  end if;
  if v_purchase.candy_delivered_at is not null then
    raise exception 'already_delivered';
  end if;

  perform public.check_function_window(v_code);

  update public.purchases
  set candy_delivered_at = now(),
      candy_delivered_by = (select auth.uid())
  where id = v_purchase.id and candy_delivered_at is null
  returning candy_delivered_at into v_delivered;

  if v_delivered is null then
    raise exception 'already_delivered';
  end if;

  return v_delivered;
end;
$$;