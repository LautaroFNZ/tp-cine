-- Visible en cartelera: el admin puede ocultar una película sin borrarla
alter table movies add column is_active boolean not null default true;

-- El admin gestiona películas, géneros y sus relaciones
create policy "Solo el admin gestiona películas" on movies
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Solo el admin gestiona géneros" on genres
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Solo el admin gestiona géneros de películas" on movie_genres
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Pósters: lectura pública, subida solo para el admin. Solo imágenes de hasta 2 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Solo el admin sube pósters" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posters' and public.is_admin());

create policy "Solo el admin modifica pósters" on storage.objects
  for update to authenticated
  using (bucket_id = 'posters' and public.is_admin());

create policy "Solo el admin borra pósters" on storage.objects
  for delete to authenticated
  using (bucket_id = 'posters' and public.is_admin());