-- Validación de los datos del perfil en la base: el formulario también valida,
-- pero se puede saltear llamando a la API directamente.
create function public.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date is not null
     and (new.birth_date > current_date or new.birth_date < date '1900-01-01') then
    raise exception 'invalid_birth_date';
  end if;

  if new.vacation_days is not null and new.vacation_days > 365 then
    raise exception 'invalid_vacation_days';
  end if;

  return new;
end;
$$;

create trigger profiles_validate
  before insert or update of birth_date, vacation_days on profiles
  for each row execute function public.validate_profile();