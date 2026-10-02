-- Categorías y productos del candy bar
create table product_categories (
  id serial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id integer not null references product_categories(id) on delete restrict,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table product_categories enable row level security;
alter table products enable row level security;

-- Categorías: todos leen, solo el admin escribe
create policy "Cualquiera ve las categorías" on product_categories
  for select using (true);
create policy "Solo el admin gestiona categorías" on product_categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Productos: el público solo ve los disponibles; el admin ve y gestiona todos
create policy "Cualquiera ve los productos disponibles" on products
  for select using (is_active);
create policy "Solo el admin gestiona productos" on products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Imágenes de productos: lectura pública, subida solo para el admin
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Solo el admin sube imágenes de productos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and public.is_admin());

create policy "Solo el admin modifica imágenes de productos" on storage.objects
  for update to authenticated
  using (bucket_id = 'products' and public.is_admin());

create policy "Solo el admin borra imágenes de productos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'products' and public.is_admin());