-- Cada usuario puede ver los productos que compró, aunque después hayan sido ocultados
create policy "Cada usuario ve los productos que compró" on products
  for select to authenticated
  using (exists (
    select 1
    from public.purchase_items i
    join public.purchases p on p.id = i.purchase_id
    where i.product_id = products.id and p.user_id = (select auth.uid())
  ));