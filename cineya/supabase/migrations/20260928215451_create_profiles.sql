create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  birth_date date,
  blood_type text check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  eye_color text,
  vacation_days integer check (vacation_days >= 0),
  role text not null default 'cliente' check (role in ('cliente','empleado','admin')),
  created_at timestamptz not null default now()
);

-- Cuando alguien se registra en Supabase Auth, se crea su perfil automáticamente
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, birth_date, blood_type, eye_color, vacation_days)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    (new.raw_user_meta_data ->> 'birth_date')::date,
    new.raw_user_meta_data ->> 'blood_type',
    new.raw_user_meta_data ->> 'eye_color',
    (new.raw_user_meta_data ->> 'vacation_days')::integer
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: cada usuario solo puede leer su propio perfil
alter table profiles enable row level security;

create policy "Cada usuario lee su propio perfil"
  on profiles for select
  to authenticated
  using ((select auth.uid()) = id);