-- Porcentaje del descuento de bienvenida, visible para cualquier visitante (lo usa el cartel de la portada)
create function public.get_welcome_discount()
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select welcome_discount_percent from public.pricing_settings limit 1;
$$;

revoke execute on function public.get_welcome_discount() from public;
grant execute on function public.get_welcome_discount() to anon, authenticated;