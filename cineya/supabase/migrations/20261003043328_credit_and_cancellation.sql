-- Si las entradas tuvieran una restricción que impida repetir una butaca en la misma función,
-- al cancelar una compra no se podría volver a vender esa butaca. La ocupación real ya la
-- controla occupied_seats (que se libera al cancelar), así que esa restricción se elimina.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.tickets'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname)
        from pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      ) = array['seat_id', 'showtime_id']
  loop
    execute format('alter table public.tickets drop constraint %I', r.conname);
  end loop;

  for r in
    select i.indexrelid::regclass::text as nombre
    from pg_index i
    where i.indrelid = 'public.tickets'::regclass
      and i.indisunique
      and not i.indisprimary
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
      and (
        select array_agg(a.attname::text order by a.attname)
        from pg_attribute a
        where a.attrelid = i.indrelid and a.attnum = any(i.indkey::int2[])
      ) = array['seat_id', 'showtime_id']
  loop
    execute format('drop index %s', r.nombre);
  end loop;
end $$;

-- Estado de la compra, crédito devuelto y crédito usado
alter table purchases
  add column status text not null default 'active' check (status in ('active', 'cancelled')),
  add column cancelled_at timestamptz,
  add column credit_refunded numeric(10,2) not null default 0,
  add column credit_used numeric(10,2) not null default 0;

-- Ahora una compra también se puede pagar con crédito
alter table purchases drop constraint if exists purchases_payment_method_check;
alter table purchases
  add constraint purchases_payment_method_check check (payment_method in ('card', 'wallet', 'credit'));

-- Los puntos también se ajustan al cancelar: se quitan los ganados y se devuelven los gastados
alter table points_movements
  drop constraint points_movements_type_check,
  drop constraint points_movements_check;
alter table points_movements
  add constraint points_movements_type_check check (type in ('earned', 'redeemed', 'reversed', 'refunded')),
  add constraint points_movements_sign_check check (
    (type in ('earned', 'refunded') and points > 0) or (type in ('redeemed', 'reversed') and points < 0)
  );

-- Crédito de cada usuario: se suma al cancelar una compra y se resta al usarlo
create table credit_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  purchase_id uuid references purchases(id) on delete set null,
  type text not null check (type in ('cancellation', 'usage')),
  amount numeric(10,2) not null,
  description text not null,
  created_at timestamptz not null default now(),
  check ((type = 'cancellation' and amount > 0) or (type = 'usage' and amount < 0))
);

create index credit_movements_user_idx on credit_movements (user_id, created_at desc);

alter table credit_movements enable row level security;

create policy "Cada usuario ve sus movimientos de crédito" on credit_movements
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "El admin ve todos los movimientos de crédito" on credit_movements
  for select to authenticated
  using (public.is_admin());

-- Saldo de crédito del usuario actual
create function public.get_credit_balance()
returns numeric
language sql
stable
security definer set search_path = ''
as $$
  select coalesce(sum(amount), 0)
  from public.credit_movements
  where user_id = (select auth.uid());
$$;

revoke execute on function public.get_credit_balance() from public, anon;
grant execute on function public.get_credit_balance() to authenticated;

-- Cancela una compra (hasta 2 horas antes de la función) y devuelve su valor como crédito
create function public.cancel_purchase(p_purchase_id uuid)
returns numeric
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_purchase record;
  v_starts timestamptz;
begin
  if v_user is null then
    raise exception 'login_required';
  end if;

  -- Se bloquea la compra para que no se cancele dos veces a la vez
  select p.id, p.status, p.total, p.points_earned, p.points_spent,
         p.entry_validated_at, p.candy_delivered_at
  into v_purchase
  from public.purchases p
  where p.id = p_purchase_id and p.user_id = v_user
  for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;
  if v_purchase.status = 'cancelled' then
    raise exception 'already_cancelled';
  end if;
  if v_purchase.entry_validated_at is not null or v_purchase.candy_delivered_at is not null then
    raise exception 'already_used';
  end if;

  select s.starts_at into v_starts
  from public.tickets t
  join public.showtimes s on s.id = t.showtime_id
  where t.purchase_id = v_purchase.id
  limit 1;

  if v_starts is null then
    raise exception 'purchase_not_found';
  end if;
  if now() > v_starts - interval '2 hours' then
    raise exception 'too_late';
  end if;

  update public.purchases
  set status = 'cancelled',
      cancelled_at = now(),
      credit_refunded = v_purchase.total
  where id = v_purchase.id;

  -- Las butacas vuelven a estar disponibles
  delete from public.occupied_seats
  where ticket_id in (select id from public.tickets where purchase_id = v_purchase.id);

  -- No se devuelve dinero: el valor de la compra queda como crédito en la cuenta
  if v_purchase.total > 0 then
    insert into public.credit_movements (user_id, purchase_id, type, amount, description)
    values (v_user, v_purchase.id, 'cancellation', v_purchase.total, 'Cancelación de compra');
  end if;

  -- Puntos: se quitan los que ganó con la compra y se devuelven los que gastó
  if v_purchase.points_earned > 0 then
    insert into public.points_movements (user_id, purchase_id, type, points, description)
    values (v_user, v_purchase.id, 'reversed', -v_purchase.points_earned, 'Cancelación: puntos de la compra');
  end if;
  if v_purchase.points_spent > 0 then
    insert into public.points_movements (user_id, purchase_id, type, points, description)
    values (v_user, v_purchase.id, 'refunded', v_purchase.points_spent, 'Cancelación: puntos devueltos');
  end if;

  return v_purchase.total;
end;
$$;

revoke execute on function public.cancel_purchase(uuid) from public, anon;
grant execute on function public.cancel_purchase(uuid) to authenticated;

-- La compra completa ahora puede usar el crédito del usuario junto con otro método de pago
drop function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text, jsonb);

create function public.complete_purchase(
  p_showtime_id uuid,
  p_seat_ids uuid[],
  p_token uuid,
  p_items jsonb,
  p_payment_method text,
  p_coupon_code text default null,
  p_rewards jsonb default '[]'::jsonb,
  p_use_credit boolean default false
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
  v_total numeric;
  v_earned integer := 0;
  v_credit_balance numeric := 0;
  v_credit_used numeric := 0;
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

revoke execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text, jsonb, boolean) from public;
grant execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text, jsonb, boolean) to anon, authenticated;

-- Una compra cancelada no se puede validar ni retirar su candy
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

  select p.id, p.entry_validated_at, p.status into v_purchase
  from public.purchases p
  where p.code = v_code;

  if not found then
    raise exception 'purchase_not_found';
  end if;
  if v_purchase.status = 'cancelled' then
    raise exception 'cancelled';
  end if;
  if v_purchase.entry_validated_at is not null then
    raise exception 'already_used';
  end if;

  perform public.check_function_window(v_code);

  -- Se marca solo si todavía no estaba validada: si dos empleados lo intentan a la vez, gana uno
  update public.purchases
  set entry_validated_at = now(),
      entry_validated_by = (select auth.uid())
  where id = v_purchase.id and entry_validated_at is null and status = 'active'
  returning entry_validated_at into v_validated;

  if v_validated is null then
    raise exception 'already_used';
  end if;

  return v_validated;
end;
$$;

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

  select p.id, p.candy_delivered_at, p.status into v_purchase
  from public.purchases p
  where p.code = v_code;

  if not found then
    raise exception 'purchase_not_found';
  end if;
  if v_purchase.status = 'cancelled' then
    raise exception 'cancelled';
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
  where id = v_purchase.id and candy_delivered_at is null and status = 'active'
  returning candy_delivered_at into v_delivered;

  if v_delivered is null then
    raise exception 'already_delivered';
  end if;

  return v_delivered;
end;
$$;

-- La entrada informa si la compra fue cancelada y cuánto se pagó con crédito
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