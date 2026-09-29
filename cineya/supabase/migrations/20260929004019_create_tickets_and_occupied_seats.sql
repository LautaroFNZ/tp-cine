-- Compras (user_id queda vacío si compra alguien sin cuenta)
create table purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  total numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Entradas: una por butaca. Son privadas: cada usuario ve solo las suyas
create table tickets (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  showtime_id uuid not null references showtimes(id),
  seat_id uuid not null references seats(id),
  price numeric(10,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'cancelled', 'used')),
  created_at timestamptz not null default now()
);

-- Ocupación: tabla pública y mínima (solo dice qué butaca está tomada en cada función).
-- La clave primaria impide que la misma butaca se venda dos veces para la misma función.
create table occupied_seats (
  showtime_id uuid not null references showtimes(id),
  seat_id uuid not null references seats(id),
  ticket_id uuid not null references tickets(id) on delete cascade,
  primary key (showtime_id, seat_id)
);

-- Confirma butacas de forma atómica: crea la compra, las entradas y la ocupación, o no crea nada
create function public.buy_tickets(p_showtime_id uuid, p_seat_ids uuid[])
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_room_id uuid;
  v_starts timestamptz;
  v_purchase_id uuid;
  v_ticket_id uuid;
  v_seat_id uuid;
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

  -- Todas las butacas tienen que existir y pertenecer a la sala de la función
  select count(*) into v_valid
  from public.seats
  where id = any(p_seat_ids) and room_id = v_room_id;

  if v_valid <> cardinality(p_seat_ids) then
    raise exception 'invalid_seats';
  end if;

  insert into public.purchases (user_id) values ((select auth.uid()))
  returning id into v_purchase_id;

  foreach v_seat_id in array p_seat_ids loop
    insert into public.tickets (purchase_id, showtime_id, seat_id)
    values (v_purchase_id, p_showtime_id, v_seat_id)
    returning id into v_ticket_id;

    begin
      insert into public.occupied_seats (showtime_id, seat_id, ticket_id)
      values (p_showtime_id, v_seat_id, v_ticket_id);
    exception when unique_violation then
      raise exception 'seat_taken';
    end;
  end loop;

  return v_purchase_id;
end;
$$;

revoke execute on function public.buy_tickets(uuid, uuid[]) from public;
grant execute on function public.buy_tickets(uuid, uuid[]) to anon, authenticated;

-- RLS
alter table purchases enable row level security;
alter table tickets enable row level security;
alter table occupied_seats enable row level security;

create policy "Cada usuario ve sus compras" on purchases
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Cada usuario ve sus entradas" on tickets
  for select to authenticated
  using (exists (
    select 1 from public.purchases p
    where p.id = tickets.purchase_id and p.user_id = (select auth.uid())
  ));

create policy "Cualquiera ve la ocupación" on occupied_seats
  for select using (true);

-- Tiempo real: se publica solo la tabla de ocupación
alter publication supabase_realtime add table occupied_seats;