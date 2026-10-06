   -- Las películas más vendidas: cuenta las entradas de compras no canceladas
   create function public.get_top_movies(p_limit integer default 3)
   returns table (movie_id uuid, title text, image_url text, tickets_sold integer)
   language sql
   stable
   security definer set search_path = ''
   as $$
     select m.id, m.title, m.image_url, count(*)::integer as tickets_sold
     from public.tickets t
     join public.purchases p on p.id = t.purchase_id
     join public.showtimes s on s.id = t.showtime_id
     join public.movies m on m.id = s.movie_id
     where p.status = 'active' and m.is_active
     group by m.id, m.title, m.image_url
     order by tickets_sold desc, m.title
     limit greatest(1, least(p_limit, 10));
   $$;

   -- Es información pública (cualquiera la ve en la portada) y solo devuelve totales
   revoke execute on function public.get_top_movies(integer) from public;
   grant execute on function public.get_top_movies(integer) to anon, authenticated;