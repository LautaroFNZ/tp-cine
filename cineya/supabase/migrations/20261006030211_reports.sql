-- Reportes del admin. Todas las consultas son solo para administradores.

-- Facturación, compras y entradas por día (se incluyen los días sin ventas, en cero).
-- Las compras canceladas no cuentan. El día es el de Argentina.
create function public.report_daily_sales(p_from date, p_to date)
returns table (day date, purchases integer, tickets integer, revenue numeric)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_range';
  end if;
  if p_to - p_from > 366 then
    raise exception 'range_too_large';
  end if;

  return query
  select d.day::date,
         coalesce(v.purchases, 0),
         coalesce(v.tickets, 0),
         coalesce(v.revenue, 0)
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d(day)
  left join (
    select (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date as sale_day,
           count(*)::integer as purchases,
           sum(p.total) as revenue,
           sum((select count(*) from public.tickets t where t.purchase_id = p.id))::integer as tickets
    from public.purchases p
    where p.status = 'active'
      and (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
    group by 1
  ) v on v.sale_day = d.day::date
  order by d.day;
end;
$$;

-- Películas con más entradas vendidas en un período (sin compras canceladas)
create function public.report_top_movies(p_from date, p_to date, p_limit integer default 5)
returns table (movie_id uuid, title text, tickets_sold integer)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_range';
  end if;
  if p_to - p_from > 366 then
    raise exception 'range_too_large';
  end if;

  return query
  select m.id, m.title, count(*)::integer as tickets_sold
  from public.tickets t
  join public.purchases p on p.id = t.purchase_id
  join public.showtimes s on s.id = t.showtime_id
  join public.movies m on m.id = s.movie_id
  where p.status = 'active'
    and (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
  group by m.id, m.title
  order by tickets_sold desc, m.title
  limit greatest(1, least(p_limit, 20));
end;
$$;

-- Productos del candy bar más vendidos en un período, en unidades.
-- Cuentan los que van dentro de un combo; no cuentan los canjeados con puntos ni las compras canceladas.
create function public.report_top_products(p_from date, p_to date, p_limit integer default 5)
returns table (product_id uuid, name text, units_sold integer)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_range';
  end if;
  if p_to - p_from > 366 then
    raise exception 'range_too_large';
  end if;

  return query
  select pr.id, pr.name, sum(i.quantity)::integer as units_sold
  from public.purchase_items i
  join public.purchases p on p.id = i.purchase_id
  join public.products pr on pr.id = i.product_id
  where p.status = 'active'
    and i.points_spent = 0
    and (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
  group by pr.id, pr.name
  order by units_sold desc, pr.name
  limit greatest(1, least(p_limit, 20));
end;
$$;

revoke execute on function public.report_daily_sales(date, date) from public, anon;
revoke execute on function public.report_top_movies(date, date, integer) from public, anon;
revoke execute on function public.report_top_products(date, date, integer) from public, anon;
grant execute on function public.report_daily_sales(date, date) to authenticated;
grant execute on function public.report_top_movies(date, date, integer) to authenticated;
grant execute on function public.report_top_products(date, date, integer) to authenticated;