-- Combos: entrada(s) + productos del candy bar a un precio fijo que define el admin
create table combos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null check (price > 0),
  tickets_included integer not null default 1 check (tickets_included between 1 and 10),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Qué productos trae cada combo y en qué cantidad
create table combo_items (
  combo_id uuid not null references combos(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 20),
  primary key (combo_id, product_id)
);

alter table combos enable row level security;
alter table combo_items enable row level security;

create policy "Cualquiera ve los combos disponibles" on combos
  for select using (is_active);
create policy "Solo el admin gestiona combos" on combos
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Cualquiera ve el contenido de los combos disponibles" on combo_items
  for select using (exists (
    select 1 from public.combos c where c.id = combo_items.combo_id and c.is_active
  ));
create policy "Solo el admin gestiona el contenido de los combos" on combo_items
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Combos comprados, con los datos que tenían al momento de comprar
create table purchase_combos (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  combo_id uuid references combos(id) on delete set null,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  tickets_included integer not null,
  created_at timestamptz not null default now()
);

alter table purchase_combos enable row level security;

create policy "Cada usuario ve los combos de sus compras" on purchase_combos
  for select to authenticated
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_combos.purchase_id and p.user_id = (select auth.uid())
  ));

-- Los productos de un combo se guardan como productos de la compra, marcados con su combo y precio 0,
-- así el candy bar los entrega igual que cualquier otro producto
alter table purchase_items
  add column purchase_combo_id uuid references purchase_combos(id) on delete cascade;

-- Lo que valían las entradas incluidas en los combos (el combo las reemplaza por su precio)
alter table purchases
  add column combo_credit numeric(10,2) not null default 0;

-- Crear o editar un combo con sus productos, en una sola transacción. Solo el admin.
create function public.save_combo(
  p_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_tickets integer,
  p_image_url text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_item jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'combo_without_items';
  end if;

  if p_id is null then
    insert into public.combos (name, description, price, tickets_included, image_url)
    values (trim(p_name), nullif(trim(p_description), ''), p_price, p_tickets, p_image_url)
    returning id into v_id;
  else
    update public.combos
    set name = trim(p_name),
        description = nullif(trim(p_description), ''),
        price = p_price,
        tickets_included = p_tickets,
        image_url = p_image_url
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'combo_not_found';
    end if;
    delete from public.combo_items where combo_id = v_id;
  end if;

  for v_item in select e from jsonb_array_elements(p_items) as e loop
    insert into public.combo_items (combo_id, product_id, quantity)
    values (v_id, (v_item ->> 'product_id')::uuid, (v_item ->> 'quantity')::integer);
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.save_combo(uuid, text, text, numeric, integer, text, jsonb) from public, anon;
grant execute on function public.save_combo(uuid, text, text, numeric, integer, text, jsonb) to authenticated;

-- La compra completa ahora también acepta combos
drop function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text, jsonb, boolean);

create function public.complete_purchase(
  p_showtime_id uuid,
  p_seat_ids uuid[],
  p_token uuid,
  p_items jsonb,
  p_payment_method text,
  p_coupon_code text default null,
  p_rewards jsonb default '[]'::jsonb,
  p_use_credit boolean default false,
  p_combos jsonb default '[]'::jsonb
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
  v_base numeric;
  v_reward record;
  v_balance integer;
  v_points_line integer;
  v_points_total integer := 0;
  v_tickets_redeemed integer := 0;
  v_credit numeric := 0;
  v_combo record;
  v_purchase_combo_id uuid;
  v_component record;
  v_combos_total numeric := 0;
  v_absorbed integer := 0;
  v_combo_credit numeric := 0;
  v_subtotal numeric;
  v_total numeric;
  v_earned integer := 0;
  v_credit_balance numeric := 0;
  v_credit_used numeric := 0;
  d record;
begin
  -- Reutiliza la compra de butacas (valida reserva, edad y precios)
  v_purchase_id := public.buy_tickets(p_showtime_id, p_seat_ids, p_token);

  select total into v_tickets_total from public.purchases where id = v_purchase_id;
  select base_price into v_base from public.get_showtime_prices(p_showtime_id);

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

  -- Combos: cada uno reemplaza el precio base de las entradas que incluye
  if jsonb_array_length(coalesce(p_combos, '[]'::jsonb)) > 0 then
    for v_item in
      select e from jsonb_array_elements(p_combos) as e
    loop
      v_quantity := (v_item ->> 'quantity')::integer;
      if v_quantity is null or v_quantity <= 0 then
        raise exception 'invalid_quantity';
      end if;

      select id, name, price, tickets_included into v_combo
      from public.combos
      where id = (v_item ->> 'combo_id')::uuid and is_active;

      if not found then
        raise exception 'combo_unavailable';
      end if;

      -- Si algún producto del combo dejó de estar disponible, el combo tampoco lo está
      if exists (
        select 1 from public.combo_items ci
        join public.products pr on pr.id = ci.product_id
        where ci.combo_id = v_combo.id and not pr.is_active
      ) then
        raise exception 'combo_unavailable';
      end if;

      insert into public.purchase_combos (purchase_id, combo_id, name, quantity, unit_price, tickets_included)
      values (v_purchase_id, v_combo.id, v_combo.name, v_quantity, v_combo.price, v_combo.tickets_included)
      returning id into v_purchase_combo_id;

      for v_component in
        select ci.product_id, ci.quantity from public.combo_items ci where ci.combo_id = v_combo.id
      loop
        insert into public.purchase_items (purchase_id, product_id, quantity, unit_price, purchase_combo_id)
        values (v_purchase_id, v_component.product_id, v_component.quantity * v_quantity, 0, v_purchase_combo_id);
      end loop;

      v_combos_total := v_combos_total + v_combo.price * v_quantity;
      v_absorbed := v_absorbed + v_combo.tickets_included * v_quantity;
    end loop;

    -- Los combos y las entradas gratis comparten el cupo de butacas elegidas
    if v_absorbed + v_tickets_redeemed > cardinality(p_seat_ids) then
      raise exception 'combo_exceeds_seats';
    end if;
    v_combo_credit := v_base * v_absorbed;
  end if;

  v_subtotal := v_tickets_total - v_credit - v_combo_credit + v_items_total + v_combos_total;
  select * into d from public.compute_discount(p_coupon_code, v_subtotal, v_purchase_id);
  v_total := v_subtotal - d.out_amount;

  -- Crédito de la cuenta: se usa todo lo que haga falta (hasta el total) y el resto se paga con el método elegido
  if p_use_credit and v_user is not null and v_total > 0 then
    perform pg_advisory_xact_lock(hashtext(v_user::text));

    select coalesce(sum(amount), 0) into v_credit_balance
    from public.credit_movements where user_id = v_user;

    v_credit_used := greatest(0, least(v_credit_balance, v_total));
    if v_credit_used > 0 then
      insert into public.credit_movements (user_id, purchase_id, type, amount, description)
      values (v_user, v_purchase_id, 'usage', -v_credit_used, 'Pago de compra con crédito');
    end if;
  end if;

  -- 1 punto por cada peso que el usuario efectivamente pagó
  if v_user is not null then
    v_earned := floor(v_total)::integer;
  end if;

  update public.purchases
  set subtotal = v_subtotal,
      reward_credit = v_credit,
      combo_credit = v_combo_credit,
      points_spent = v_points_total,
      points_earned = v_earned,
      discount_amount = d.out_amount,
      discount_label = d.out_label,
      coupon_id = d.out_coupon_id,
      total = v_total,
      credit_used = v_credit_used,
      payment_method = case
        when v_credit_used > 0 and v_credit_used >= v_total then 'credit'
        else p_payment_method
      end
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

revoke execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text, jsonb, boolean, jsonb) from public;
grant execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text, jsonb, boolean, jsonb) to anon, authenticated;

-- La entrada muestra también los combos y lo que se descontó por las entradas incluidas
create or replace function public.get_ticket(p_code text)
returns jsonb
language sql
stable
security definer set search_path = ''
as $$
  select jsonb_build_object(
    'code', p.code,
    'status', p.status,
    'total', p.total,
    'subtotal', coalesce(p.subtotal, p.total),
    'reward_credit', p.reward_credit,
    'combo_credit', p.combo_credit,
    'credit_used', p.credit_used,
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
      where i.purchase_id = p.id and i.purchase_combo_id is null
    ), '[]'::jsonb),
    'combos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', pc.name,
          'quantity', pc.quantity,
          'unit_price', pc.unit_price,
          'includes', coalesce((
            select jsonb_agg(
              jsonb_build_object('name', pr2.name, 'quantity', i2.quantity)
              order by pr2.name
            )
            from public.purchase_items i2
            join public.products pr2 on pr2.id = i2.product_id
            where i2.purchase_combo_id = pc.id
          ), '[]'::jsonb)
        )
        order by pc.name
      )
      from public.purchase_combos pc
      where pc.purchase_id = p.id
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