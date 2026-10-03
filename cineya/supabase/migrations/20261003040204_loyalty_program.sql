-- Movimientos de puntos: lo que cada usuario ganó y lo que canjeó
create table points_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  purchase_id uuid references purchases(id) on delete set null,
  type text not null check (type in ('earned', 'redeemed')),
  points integer not null,
  quantity integer not null default 1 check (quantity > 0),
  description text not null,
  created_at timestamptz not null default now(),
  check ((type = 'earned' and points > 0) or (type = 'redeemed' and points < 0))
);

create index points_movements_user_idx on points_movements (user_id, created_at desc);

alter table points_movements enable row level security;

-- Cada usuario solo ve sus movimientos. Nadie escribe directamente: solo lo hace la función de compra.
create policy "Cada usuario ve sus movimientos de puntos" on points_movements
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "El admin ve todos los movimientos de puntos" on points_movements
  for select to authenticated
  using (public.is_admin());

-- Recompensas que se pueden canjear: la entrada gratis y productos del candy bar.
-- El admin define cuántos puntos cuesta cada una.
create table rewards (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ticket', 'product')),
  product_id uuid references products(id) on delete cascade,
  points_cost integer not null check (points_cost > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'ticket' and product_id is null) or (kind = 'product' and product_id is not null)),
  unique (product_id)
);

-- Hay una sola recompensa de entrada gratis
create unique index rewards_one_ticket on rewards (kind) where kind = 'ticket';

alter table rewards enable row level security;

create policy "Cualquiera ve las recompensas disponibles" on rewards
  for select using (is_active);
create policy "Solo el admin gestiona recompensas" on rewards
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Datos de puntos en cada compra
alter table purchases
  add column reward_credit numeric(10,2) not null default 0,
  add column points_spent integer not null default 0,
  add column points_earned integer not null default 0;

alter table purchase_items
  add column points_spent integer not null default 0;

-- Saldo de puntos del usuario actual
create function public.get_points_balance()
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select coalesce(sum(points), 0)::integer
  from public.points_movements
  where user_id = (select auth.uid());
$$;

revoke execute on function public.get_points_balance() from public, anon;
grant execute on function public.get_points_balance() to authenticated;

-- Crea o actualiza una recompensa. Solo el admin.
create function public.save_reward(p_kind text, p_product_id uuid, p_points integer, p_active boolean)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if p_kind = 'ticket' then
    select id into v_id from public.rewards where kind = 'ticket';
  else
    select id into v_id from public.rewards where product_id = p_product_id;
  end if;

  if v_id is null then
    insert into public.rewards (kind, product_id, points_cost, is_active)
    values (p_kind, case when p_kind = 'ticket' then null else p_product_id end, p_points, p_active)
    returning id into v_id;
  else
    update public.rewards set points_cost = p_points, is_active = p_active where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_reward(text, uuid, integer, boolean) from public, anon;
grant execute on function public.save_reward(text, uuid, integer, boolean) to authenticated;

-- La compra completa ahora acepta canjes con puntos y suma los puntos ganados
drop function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text);

create function public.complete_purchase(
  p_showtime_id uuid,
  p_seat_ids uuid[],
  p_token uuid,
  p_items jsonb,
  p_payment_method text,
  p_coupon_code text default null,
  p_rewards jsonb default '[]'::jsonb
)
returns table (out_purchase_id uuid, out_code text)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_purchase_id uuid;
  v_item jsonb;
  v_product record;
  v_quantity integer;
  v_tickets_total numeric;
  v_items_total numeric := 0;
  v_reward record;
  v_base numeric;
  v_balance integer;
  v_points_line integer;
  v_points_total integer := 0;
  v_tickets_redeemed integer := 0;
  v_credit numeric := 0;
  v_subtotal numeric;
  v_earned integer := 0;
  d record;
begin
  -- Reutiliza la compra de butacas (valida reserva, edad y precios)
  v_purchase_id := public.buy_tickets(p_showtime_id, p_seat_ids, p_token);

  select total into v_tickets_total from public.purchases where id = v_purchase_id;

  -- Productos que se pagan
  for v_item in
    select e from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as e
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'invalid_quantity';
    end if;

    -- El precio sale de la base, y el producto tiene que estar disponible
    select id, price into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid and is_active;

    if not found then
      raise exception 'product_unavailable';
    end if;

    insert into public.purchase_items (purchase_id, product_id, quantity, unit_price)
    values (v_purchase_id, v_product.id, v_quantity, v_product.price);

    v_items_total := v_items_total + v_product.price * v_quantity;
  end loop;

  -- Canjes con puntos: solo para usuarios registrados
  if jsonb_array_length(coalesce(p_rewards, '[]'::jsonb)) > 0 then
    if v_user is null then
      raise exception 'login_required_points';
    end if;

    -- Un canje por vez por usuario: evita gastar dos veces los mismos puntos
    perform pg_advisory_xact_lock(hashtext(v_user::text));

    select coalesce(sum(points), 0) into v_balance
    from public.points_movements where user_id = v_user;

    select base_price into v_base from public.get_showtime_prices(p_showtime_id);

    for v_item in
      select e from jsonb_array_elements(p_rewards) as e
    loop
      v_quantity := (v_item ->> 'quantity')::integer;
      if v_quantity is null or v_quantity <= 0 then
        raise exception 'invalid_quantity';
      end if;

      select r.id, r.kind, r.product_id, r.points_cost, pr.name as product_name, pr.is_active as product_active
      into v_reward
      from public.rewards r
      left join public.products pr on pr.id = r.product_id
      where r.id = (v_item ->> 'reward_id')::uuid and r.is_active;

      if not found then
        raise exception 'reward_unavailable';
      end if;

      v_points_line := v_reward.points_cost * v_quantity;
      v_points_total := v_points_total + v_points_line;

      if v_reward.kind = 'ticket' then
        v_tickets_redeemed := v_tickets_redeemed + v_quantity;

        insert into public.points_movements (user_id, purchase_id, type, points, quantity, description)
        values (v_user, v_purchase_id, 'redeemed', -v_points_line, v_quantity, 'Entrada gratis');
      else
        if not v_reward.product_active then
          raise exception 'reward_unavailable';
        end if;

        -- El producto canjeado va a la compra sin costo, para que el candy bar lo entregue
        insert into public.purchase_items (purchase_id, product_id, quantity, unit_price, points_spent)
        values (v_purchase_id, v_reward.product_id, v_quantity, 0, v_points_line);

        insert into public.points_movements (user_id, purchase_id, type, points, quantity, description)
        values (v_user, v_purchase_id, 'redeemed', -v_points_line, v_quantity, v_reward.product_name);
      end if;
    end loop;

    -- No se pueden canjear más entradas que butacas elegidas, ni gastar más puntos de los que hay
    if v_tickets_redeemed > cardinality(p_seat_ids) then
      raise exception 'reward_exceeds_seats';
    end if;
    if v_points_total > v_balance then
      raise exception 'insufficient_points';
    end if;

    -- Cada entrada gratis reemplaza el precio base (el recargo VIP se paga aparte)
    v_credit := v_base * v_tickets_redeemed;
  end if;

  v_subtotal := v_tickets_total - v_credit + v_items_total;
  select * into d from public.compute_discount(p_coupon_code, v_subtotal, v_purchase_id);

  -- 1 punto por cada peso que el usuario efectivamente pagó
  if v_user is not null then
    v_earned := floor(v_subtotal - d.out_amount)::integer;
  end if;

  update public.purchases
  set subtotal = v_subtotal,
      reward_credit = v_credit,
      points_spent = v_points_total,
      points_earned = v_earned,
      discount_amount = d.out_amount,
      discount_label = d.out_label,
      coupon_id = d.out_coupon_id,
      total = v_subtotal - d.out_amount,
      payment_method = p_payment_method
  where id = v_purchase_id;

  if d.out_coupon_id is not null then
    begin
      insert into public.coupon_redemptions (coupon_id, user_id, purchase_id)
      values (d.out_coupon_id, v_user, v_purchase_id);
    exception when unique_violation then
      raise exception 'coupon_used';
    end;
  end if;

  if v_earned > 0 then
    insert into public.points_movements (user_id, purchase_id, type, points, description)
    values (v_user, v_purchase_id, 'earned', v_earned, 'Compra');
  end if;

  return query
    select p.id, p.code from public.purchases p where p.id = v_purchase_id;
end;
$$;

revoke execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text, jsonb) from public;
grant execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text, jsonb) to anon, authenticated;

-- La entrada informa también lo que se canjeó con puntos
create or replace function public.get_ticket(p_code text)
returns jsonb
language sql
stable
security definer set search_path = ''
as $$
  select jsonb_build_object(
    'code', p.code,
    'total', p.total,
    'subtotal', coalesce(p.subtotal, p.total),
    'reward_credit', p.reward_credit,
    'discount_amount', p.discount_amount,
    'discount_label', p.discount_label,
    'created_at', p.created_at,
    'payment_method', p.payment_method,
    'entry_used', p.entry_validated_at is not null,
    'candy_delivered', p.candy_delivered_at is not null,
    'movie', m.title,
    'age_rating', m.age_rating,
    'room', r.name,
    'starts_at', s.starts_at,
    'ends_at', s.ends_at,
    'format', s.format,
    'language', s.language,
    'seats', (
      select jsonb_agg(
        jsonb_build_object('row', se.row_label, 'number', se.seat_number, 'type', se.seat_type, 'price', t.price)
        order by se.row_order, se.seat_number
      )
      from public.tickets t
      join public.seats se on se.id = t.seat_id
      where t.purchase_id = p.id
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', pr.name, 'quantity', i.quantity, 'unit_price', i.unit_price, 'points', i.points_spent)
        order by pr.name
      )
      from public.purchase_items i
      join public.products pr on pr.id = i.product_id
      where i.purchase_id = p.id
    ), '[]'::jsonb)
  )
  from public.purchases p
  join lateral (
    select t.showtime_id from public.tickets t where t.purchase_id = p.id limit 1
  ) tk on true
  join public.showtimes s on s.id = tk.showtime_id
  join public.movies m on m.id = s.movie_id
  join public.rooms r on r.id = s.room_id
  where p.code = upper(trim(p_code));
$$;