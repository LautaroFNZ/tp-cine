-- Reservas temporales de butacas (5 minutos)
create table seat_holds (
  showtime_id uuid not null references showtimes(id) on delete cascade,
  seat_id uuid not null references seats(id) on delete cascade,
  holder_hash text not null,
  expires_at timestamptz not null,
  primary key (showtime_id, seat_id)
);

alter table seat_holds enable row level security;

create policy "Cualquiera ve las reservas" on seat_holds
  for select using (true);

alter publication supabase_realtime add table seat_holds;

-- Reglas comunes para reservar y comprar (función existente, sesión, edad)
create function public.check_purchase_rules(p_showtime_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_starts timestamptz;
  v_age_rating text;
  v_birth_date date;
begin
  select s.room_id, s.starts_at, m.age_rating
  into v_room_id, v_starts, v_age_rating
  from public.showtimes s
  join public.movies m on m.id = s.movie_id
  where s.id = p_showtime_id;

  if v_room_id is null then
    raise exception 'showtime_not_found';
  end if;
  if v_starts <= now() then
    raise exception 'showtime_started';
  end if;

  if v_age_rating <> 'none' then
    if v_user_id is null then
      raise exception 'login_required';
    end if;

    select birth_date into v_birth_date
    from public.profiles where id = v_user_id;

    if v_birth_date is null
       or extract(year from age(current_date, v_birth_date)) < v_age_rating::integer then
      raise exception 'age_restricted';
    end if;
  end if;

  return v_room_id;
end;
$$;

revoke execute on function public.check_purchase_rules(uuid) from public, anon, authenticated;

-- Reserva butacas por 5 minutos. Devuelve los segundos de reserva.
create function public.hold_seats(p_showtime_id uuid, p_seat_ids uuid[], p_token uuid)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  v_room_id uuid;
  v_hash text := md5(p_token::text);
  v_seconds constant integer := 300;
  v_seat_id uuid;
  v_valid integer;
begin
  v_room_id := public.check_purchase_rules(p_showtime_id);

  if p_seat_ids is null or cardinality(p_seat_ids) = 0 then
    raise exception 'no_seats';
  end if;

  select count(*) into v_valid
  from public.seats
  where id = any(p_seat_ids) and room_id = v_room_id;

  if v_valid <> cardinality(p_seat_ids) then
    raise exception 'invalid_seats';
  end if;

  -- Limpieza: reservas vencidas y las anteriores de este mismo visitante en esta función
  delete from public.seat_holds where expires_at <= now();
  delete from public.seat_holds where showtime_id = p_showtime_id and holder_hash = v_hash;

  if exists (
    select 1 from public.occupied_seats
    where showtime_id = p_showtime_id and seat_id = any(p_seat_ids)
  ) then
    raise exception 'seat_taken';
  end if;

  foreach v_seat_id in array p_seat_ids loop
    begin
      insert into public.seat_holds (showtime_id, seat_id, holder_hash, expires_at)
      values (p_showtime_id, v_seat_id, v_hash, now() + make_interval(secs => v_seconds));
    exception when unique_violation then
      raise exception 'seat_taken';
    end;
  end loop;

  return v_seconds;
end;
$$;

-- Libera las reservas de este visitante en una función
create function public.release_seats(p_showtime_id uuid, p_token uuid)
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.seat_holds
  where showtime_id = p_showtime_id and holder_hash = md5(p_token::text);
$$;

-- La compra ahora exige una reserva vigente de este visitante
drop function if exists public.buy_tickets(uuid, uuid[]);

create function public.buy_tickets(p_showtime_id uuid, p_seat_ids uuid[], p_token uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_hash text := md5(p_token::text);
  v_base numeric;
  v_surcharge numeric;
  v_purchase_id uuid;
  v_ticket_id uuid;
  v_seat record;
  v_price numeric;
  v_total numeric := 0;
  v_valid integer;
  v_held integer;
begin
  v_room_id := public.check_purchase_rules(p_showtime_id);

  if p_seat_ids is null or cardinality(p_seat_ids) = 0 then
    raise exception 'no_seats';
  end if;

  select count(*) into v_valid
  from public.seats
  where id = any(p_seat_ids) and room_id = v_room_id;

  if v_valid <> cardinality(p_seat_ids) then
    raise exception 'invalid_seats';
  end if;

  -- Todas las butacas tienen que estar reservadas por este visitante y con la reserva vigente
  select count(*) into v_held
  from public.seat_holds
  where showtime_id = p_showtime_id
    and seat_id = any(p_seat_ids)
    and holder_hash = v_hash
    and expires_at > now();

  if v_held <> cardinality(p_seat_ids) then
    raise exception 'hold_expired';
  end if;

  select p.base_price, p.vip_surcharge into v_base, v_surcharge
  from public.get_showtime_prices(p_showtime_id) p;

  insert into public.purchases (user_id) values (v_user_id)
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

  -- La reserva se convirtió en venta
  delete from public.seat_holds
  where showtime_id = p_showtime_id and holder_hash = v_hash;

  return v_purchase_id;
end;
$$;

grant execute on function public.hold_seats(uuid, uuid[], uuid) to anon, authenticated;
grant execute on function public.release_seats(uuid, uuid) to anon, authenticated;
grant execute on function public.buy_tickets(uuid, uuid[], uuid) to anon, authenticated;