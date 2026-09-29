-- Precios configurables por el administrador (una sola fila)
create table pricing_settings (
  id boolean primary key default true check (id),
  base_price numeric(10,2) not null check (base_price >= 0),
  vip_surcharge numeric(10,2) not null check (vip_surcharge >= 0),
  updated_at timestamptz not null default now()
);

insert into pricing_settings (base_price, vip_surcharge) values (8000, 3000);

alter table pricing_settings enable row level security;

create policy "Cualquiera puede ver los precios" on pricing_settings
  for select using (true);

create policy "Solo el admin modifica los precios" on pricing_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Precios vigentes para una función. Si la película está en preventa, el precio base es el de preventa.
create function public.get_showtime_prices(p_showtime_id uuid)
returns table (base_price numeric, vip_surcharge numeric, is_presale boolean)
language sql
stable
set search_path = ''
as $$
  select
    case
      when m.presale_price is not null and m.presale_ends_at is not null and now() < m.presale_ends_at
        then m.presale_price
      else ps.base_price
    end,
    ps.vip_surcharge,
    (m.presale_price is not null and m.presale_ends_at is not null and now() < m.presale_ends_at)
  from public.showtimes s
  join public.movies m on m.id = s.movie_id
  cross join public.pricing_settings ps
  where s.id = p_showtime_id;
$$;

grant execute on function public.get_showtime_prices(uuid) to anon, authenticated;

-- buy_tickets ahora calcula el precio de cada entrada y el total de la compra
create or replace function public.buy_tickets(p_showtime_id uuid, p_seat_ids uuid[])
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_room_id uuid;
  v_starts timestamptz;
  v_base numeric;
  v_surcharge numeric;
  v_purchase_id uuid;
  v_ticket_id uuid;
  v_seat record;
  v_price numeric;
  v_total numeric := 0;
  v_valid integer;
begin
  select room_id, starts_at into v_room_id, v_starts
  from public.showtimes where id = p_showtime_id;

  if v_room_id is null then
    raise exception 'showtime_not_found';
  end if;
  if v_starts <= now() then
    raise exception 'showtime_started';
  end if;
  if p_seat_ids is null or cardinality(p_seat_ids) = 0 then
    raise exception 'no_seats';
  end if;

  select count(*) into v_valid
  from public.seats
  where id = any(p_seat_ids) and room_id = v_room_id;

  if v_valid <> cardinality(p_seat_ids) then
    raise exception 'invalid_seats';
  end if;

  select p.base_price, p.vip_surcharge into v_base, v_surcharge
  from public.get_showtime_prices(p_showtime_id) p;

  insert into public.purchases (user_id) values ((select auth.uid()))
  returning id into v_purchase_id;

  for v_seat in
    select id, seat_type from public.seats where id = any(p_seat_ids)
  loop
    v_price := v_base + case when v_seat.seat_type = 'vip' then v_surcharge else 0 end;

    insert into public.tickets (purchase_id, showtime_id, seat_id, price)
    values (v_purchase_id, p_showtime_id, v_seat.id, v_price)
    returning id into v_ticket_id;

    begin
      insert into public.occupied_seats (showtime_id, seat_id, ticket_id)
      values (p_showtime_id, v_seat.id, v_ticket_id);
    exception when unique_violation then
      raise exception 'seat_taken';
    end;

    v_total := v_total + v_price;
  end loop;

  update public.purchases set total = v_total where id = v_purchase_id;

  return v_purchase_id;
end;
$$;