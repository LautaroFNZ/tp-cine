-- Descuento de bienvenida: porcentaje que el admin puede cambiar cuando quiera
alter table pricing_settings
  add column welcome_discount_percent integer not null default 20
  check (welcome_discount_percent between 0 and 100);

-- Cupones que crea el admin. Si tienen edad mínima, solo los pueden usar usuarios de esa edad en adelante.
create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and length(code) between 3 and 20),
  discount_percent integer not null check (discount_percent between 1 and 100),
  min_age integer check (min_age is null or min_age between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cada usuario puede usar un mismo cupón una sola vez
create table coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  purchase_id uuid references purchases(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (coupon_id, user_id)
);

alter table coupons enable row level security;
alter table coupon_redemptions enable row level security;

create policy "Solo el admin gestiona cupones" on coupons
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Solo el admin ve los usos de cupones" on coupon_redemptions
  for select to authenticated
  using (public.is_admin());

-- Datos del descuento en cada compra
alter table purchases
  add column subtotal numeric(10,2),
  add column discount_amount numeric(10,2) not null default 0,
  add column discount_label text,
  add column coupon_id uuid references coupons(id) on delete set null;

update purchases set subtotal = total where subtotal is null;

-- Calcula el mejor descuento del usuario actual para un subtotal. No modifica nada.
-- p_purchase_id sirve para excluir de "primera compra" la compra que se está armando.
create function public.compute_discount(p_coupon_code text, p_subtotal numeric, p_purchase_id uuid default null)
returns table (out_percent integer, out_label text, out_amount numeric, out_coupon_id uuid)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text := upper(trim(coalesce(p_coupon_code, '')));
  v_welcome integer := 0;
  v_coupon_id uuid;
  v_coupon_code text;
  v_coupon_percent integer;
  v_coupon_min_age integer;
  v_birth date;
begin
  out_percent := 0;
  out_label := null;
  out_coupon_id := null;

  -- Bienvenida: automática, solo en la primera compra de un usuario registrado
  if v_user is not null and not exists (
    select 1 from public.purchases
    where user_id = v_user and id is distinct from p_purchase_id
  ) then
    select welcome_discount_percent into v_welcome from public.pricing_settings limit 1;
    v_welcome := coalesce(v_welcome, 0);
  end if;

  -- Cupón: se valida todo antes de aplicarlo
  if v_code <> '' then
    select id, code, discount_percent, min_age
    into v_coupon_id, v_coupon_code, v_coupon_percent, v_coupon_min_age
    from public.coupons
    where code = v_code and is_active;

    if v_coupon_id is null then
      raise exception 'coupon_invalid';
    end if;
    if v_user is null then
      raise exception 'coupon_login_required';
    end if;
    if v_coupon_min_age is not null then
      select birth_date into v_birth from public.profiles where id = v_user;
      if v_birth is null or extract(year from age(current_date, v_birth)) < v_coupon_min_age then
        raise exception 'coupon_age';
      end if;
    end if;
    if exists (
      select 1 from public.coupon_redemptions
      where coupon_id = v_coupon_id and user_id = v_user
    ) then
      raise exception 'coupon_used';
    end if;
  end if;

  -- Los descuentos no se suman: se aplica el más conveniente
  if v_coupon_id is not null and v_coupon_percent >= v_welcome then
    out_percent := v_coupon_percent;
    out_label := 'Cupón ' || v_coupon_code;
    out_coupon_id := v_coupon_id;
  elsif v_welcome > 0 then
    out_percent := v_welcome;
    out_label := 'Bienvenida';
  end if;

  out_amount := round(p_subtotal * out_percent / 100.0, 2);
  return next;
end;
$$;

-- Vista previa para la pantalla de pago (con la misma lógica que la compra real)
create function public.preview_discount(p_coupon_code text, p_subtotal numeric)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  d record;
begin
  select * into d from public.compute_discount(p_coupon_code, p_subtotal, null);
  return jsonb_build_object(
    'percent', d.out_percent,
    'label', d.out_label,
    'amount', d.out_amount,
    'coupon_applied', d.out_coupon_id is not null
  );
end;
$$;

-- La compra completa ahora acepta un cupón y calcula el descuento en la base
drop function public.complete_purchase(uuid, uuid[], uuid, jsonb, text);

create function public.complete_purchase(
  p_showtime_id uuid,
  p_seat_ids uuid[],
  p_token uuid,
  p_items jsonb,
  p_payment_method text,
  p_coupon_code text default null
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
  v_subtotal numeric;
  d record;
begin
  -- Reutiliza la compra de butacas (valida reserva, edad y precios)
  v_purchase_id := public.buy_tickets(p_showtime_id, p_seat_ids, p_token);

  select total into v_tickets_total from public.purchases where id = v_purchase_id;

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

  v_subtotal := v_tickets_total + v_items_total;
  select * into d from public.compute_discount(p_coupon_code, v_subtotal, v_purchase_id);

  update public.purchases
  set subtotal = v_subtotal,
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

  return query
    select p.id, p.code from public.purchases p where p.id = v_purchase_id;
end;
$$;

-- La entrada ahora informa también el subtotal y el descuento
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
        jsonb_build_object('name', pr.name, 'quantity', i.quantity, 'unit_price', i.unit_price)
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

revoke execute on function public.compute_discount(text, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.preview_discount(text, numeric) from public;
revoke execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text) from public;
grant execute on function public.preview_discount(text, numeric) to anon, authenticated;
grant execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text, text) to anon, authenticated;