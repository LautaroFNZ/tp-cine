-- buy_tickets ahora valida la edad mínima de la película
create or replace function public.buy_tickets(p_showtime_id uuid, p_seat_ids uuid[])
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
  v_base numeric;
  v_surcharge numeric;
  v_purchase_id uuid;
  v_ticket_id uuid;
  v_seat record;
  v_price numeric;
  v_total numeric := 0;
  v_valid integer;
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
  if p_seat_ids is null or cardinality(p_seat_ids) = 0 then
    raise exception 'no_seats';
  end if;

  -- Restricción de edad: hay que tener sesión y cumplir la edad mínima
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

  select count(*) into v_valid
  from public.seats
  where id = any(p_seat_ids) and room_id = v_room_id;

  if v_valid <> cardinality(p_seat_ids) then
    raise exception 'invalid_seats';
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

  return v_purchase_id;
end;
$$;