-- Datos nuevos de la compra: código (para el QR), método de pago y estado de la validación
alter table purchases
  add column code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) unique,
  add column payment_method text check (payment_method in ('card', 'wallet')),
  add column entry_validated_at timestamptz,
  add column entry_validated_by uuid references profiles(id) on delete set null,
  add column candy_delivered_at timestamptz,
  add column candy_delivered_by uuid references profiles(id) on delete set null;

-- Productos de cada compra, con el precio que tenían al momento de comprar
create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

alter table purchase_items enable row level security;

create policy "Cada usuario ve los productos de sus compras" on purchase_items
  for select to authenticated
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_items.purchase_id and p.user_id = (select auth.uid())
  ));

-- Compra completa: butacas + productos, en una sola transacción
create function public.complete_purchase(
  p_showtime_id uuid,
  p_seat_ids uuid[],
  p_token uuid,
  p_items jsonb,
  p_payment_method text
)
returns table (out_purchase_id uuid, out_code text)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_purchase_id uuid;
  v_item jsonb;
  v_product record;
  v_quantity integer;
  v_items_total numeric := 0;
begin
  -- Reutiliza la compra de butacas (valida reserva, edad y precios)
  v_purchase_id := public.buy_tickets(p_showtime_id, p_seat_ids, p_token);

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

  update public.purchases
  set total = total + v_items_total,
      payment_method = p_payment_method
  where id = v_purchase_id;

  return query
    select p.id, p.code from public.purchases p where p.id = v_purchase_id;
end;
$$;

revoke execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text) from public;
grant execute on function public.complete_purchase(uuid, uuid[], uuid, jsonb, text) to anon, authenticated;