-- Géneros
create table genres (
  id serial primary key,
  name text not null unique
);

-- Películas
create table movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  synopsis text not null,
  image_url text not null,
  duration_minutes integer not null,
  age_rating text not null default 'none' check (age_rating in ('none', '13', '18')),
  release_date date not null,
  presale_price numeric(10,2),
  presale_ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- Relación película-género (una película puede tener varios géneros)
create table movie_genres (
  movie_id uuid not null references movies(id) on delete cascade,
  genre_id integer not null references genres(id) on delete cascade,
  primary key (movie_id, genre_id)
);