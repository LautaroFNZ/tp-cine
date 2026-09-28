create table reviews (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references movies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 300),
  author_name text not null default 'Usuario',
  created_at timestamptz not null default now(),
  unique (movie_id, user_id)
);

-- El nombre visible del autor se arma en la base a partir de su perfil (nombre + inicial del apellido)
create function public.set_review_author()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  select coalesce(
    nullif(trim(coalesce(first_name, '') || ' ' || coalesce(left(last_name, 1) || '.', '')), ''),
    'Usuario'
  )
  into new.author_name
  from public.profiles
  where id = new.user_id;

  new.author_name := coalesce(new.author_name, 'Usuario');
  return new;
end;
$$;

create trigger reviews_set_author
  before insert or update on reviews
  for each row execute function public.set_review_author();

-- RLS
alter table reviews enable row level security;

create policy "Cualquiera puede leer reseñas"
  on reviews for select
  using (true);

create policy "Cada usuario crea su reseña"
  on reviews for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Cada usuario edita su reseña"
  on reviews for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);