-- Alertas de estreno: una fila por usuario y película
create table release_alerts (
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  movie_id uuid not null references movies(id) on delete cascade,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create index release_alerts_movie_idx on release_alerts (movie_id);

alter table release_alerts enable row level security;

-- Cada usuario gestiona solo sus alertas
create policy "Cada usuario gestiona sus alertas de estreno" on release_alerts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Reglas comunes para reservar y comprar: ahora la venta abre 7 días antes del estreno
create or replace function public.check_purchase_rules(p_showtime_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_starts timestamptz;
  v_age_rating text;
  v_release date;
  v_birth_date date;
begin
  select s.room_id, s.starts_at, m.age_rating, m.release_date
  into v_room_id, v_starts, v_age_rating, v_release
  from public.showtimes s
  join public.movies m on m.id = s.movie_id
  where s.id = p_showtime_id;

  if v_room_id is null then
    raise exception 'showtime_not_found';
  end if;
  if v_starts <= now() then
    raise exception 'showtime_started';
  end if;

  -- La venta abre 7 días antes del estreno (fecha de Argentina)
  if (now() at time zone 'America/Argentina/Buenos_Aires')::date < v_release - 7 then
    raise exception 'sale_not_open';
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