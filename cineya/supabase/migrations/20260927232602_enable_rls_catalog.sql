-- Habilitar RLS en las tablas del catálogo
alter table movies enable row level security;
alter table genres enable row level security;
alter table movie_genres enable row level security;

-- Lectura pública (cualquiera puede ver el catálogo, logueado o no)
create policy "Cualquiera puede leer películas"
  on movies for select
  using (true);

create policy "Cualquiera puede leer géneros"
  on genres for select
  using (true);

create policy "Cualquiera puede leer relación película-género"
  on movie_genres for select
  using (true);