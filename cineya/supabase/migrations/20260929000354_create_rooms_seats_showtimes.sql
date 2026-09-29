-- Necesario para que la base impida que dos funciones se superpongan en una sala
create extension if not exists btree_gist with schema extensions;

-- Ayuda para las políticas: ¿el usuario logueado es admin?
create function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Salas
create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Butacas: una fila por butaca de cada sala
create table seats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  row_label text not null,
  row_order smallint not null,
  block smallint not null check (block in (1, 2, 3)),
  seat_number smallint not null,
  seat_type text not null check (seat_type in ('normal', 'accessible', 'vip')),
  unique (room_id, row_label, seat_number)
);

-- Al crear una sala se generan sus butacas automáticamente (todas las salas tienen la misma forma)
create function public.generate_room_seats()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.seats (room_id, row_label, row_order, block, seat_number, seat_type)
  select new.id, r.label, r.ord::smallint, s.block, s.num::smallint, r.seat_type
  from (
    select t.label, t.ord,
      case when t.label = 'I-J' then 'accessible'
           when t.label in ('R', 'S', 'T') then 'vip'
           else 'normal' end as seat_type,
      case when t.label = 'I-J' then array[2, 10, 2] else array[4, 20, 4] end as sizes
    from unnest(array['A','B','C','D','E','F','G','H','I-J','K','L','M','N','Ñ','O','P','Q','R','S','T'])
         with ordinality as t(label, ord)
  ) r
  cross join lateral (
    select n as num,
      case when n <= r.sizes[1] then 1
           when n <= r.sizes[1] + r.sizes[2] then 2
           else 3 end as block
    from generate_series(1, r.sizes[1] + r.sizes[2] + r.sizes[3]) as n
  ) s;
  return new;
end;
$$;

create trigger rooms_generate_seats
  after insert on rooms
  for each row execute function public.generate_room_seats();

-- Funciones (horarios de proyección)
create table showtimes (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references movies(id) on delete cascade,
  room_id uuid not null references rooms(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  blocked_until timestamptz not null,
  format text not null check (format in ('2D', '3D', '4D', '5D')),
  language text not null check (language in ('castellano', 'subtitulada')),
  created_at timestamptz not null default now(),
  -- La sala queda ocupada desde que empieza la función hasta 30 minutos después de que termina.
  -- La base rechaza cualquier función que se superponga con ese período en la misma sala.
  constraint showtimes_no_overlap
    exclude using gist (room_id with =, tstzrange(starts_at, blocked_until) with &&)
);

-- El fin de la función y el bloqueo de 30 minutos se calculan con la duración de la película
create function public.set_showtime_times()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_duration integer;
begin
  select duration_minutes into v_duration from public.movies where id = new.movie_id;
  new.ends_at := new.starts_at + make_interval(mins => v_duration);
  new.blocked_until := new.ends_at + interval '30 minutes';
  return new;
end;
$$;

create trigger showtimes_set_times
  before insert or update of movie_id, starts_at on showtimes
  for each row execute function public.set_showtime_times();

-- Programa una película en varios días a la misma hora y le asigna sala automáticamente.
-- p_weekdays: 1 = lunes ... 7 = domingo. Devuelve, por cada fecha, la sala asignada o 'sin_sala'.
create function public.schedule_showtimes(
  p_movie_id uuid,
  p_weekdays int[],
  p_time time,
  p_from date,
  p_to date,
  p_format text,
  p_language text
)
returns table (out_date date, out_room text, out_status text)
language plpgsql
set search_path = ''
as $$
declare
  v_day date;
  v_room record;
  v_assigned boolean;
begin
  for v_day in
    select g::date from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g
  loop
    if extract(isodow from v_day)::int = any(p_weekdays) then
      v_assigned := false;

      for v_room in select id, name from public.rooms order by name loop
        begin
          insert into public.showtimes (movie_id, room_id, starts_at, format, language)
          values (
            p_movie_id,
            v_room.id,
            (v_day + p_time) at time zone 'America/Argentina/Buenos_Aires',
            p_format,
            p_language
          );
          v_assigned := true;
          out_date := v_day;
          out_room := v_room.name;
          out_status := 'creada';
          return next;
          exit;
        exception when exclusion_violation then
          null; -- la sala está ocupada en ese horario: se prueba con la siguiente
        end;
      end loop;

      if not v_assigned then
        out_date := v_day;
        out_room := null;
        out_status := 'sin_sala';
        return next;
      end if;
    end if;
  end loop;
end;
$$;

-- RLS: todos leen; solo el admin modifica
alter table rooms enable row level security;
alter table seats enable row level security;
alter table showtimes enable row level security;

create policy "Cualquiera puede leer salas" on rooms for select using (true);
create policy "Cualquiera puede leer butacas" on seats for select using (true);
create policy "Cualquiera puede leer funciones" on showtimes for select using (true);

create policy "Solo el admin gestiona salas" on rooms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Solo el admin gestiona butacas" on seats
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Solo el admin gestiona funciones" on showtimes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Datos iniciales: 4 salas (las butacas se generan solas)
insert into rooms (name) values ('Sala 1'), ('Sala 2'), ('Sala 3'), ('Sala 4');