-- Devuelve los datos de una entrada a partir de su código (null si no existe).
-- No expone datos personales: ni el usuario ni su correo.
create function public.get_ticket(p_code text)
returns jsonb
language sql
stable
security definer set search_path = ''
as $$
  select jsonb_build_object(
    'code', p.code,
    'total', p.total,
    'created_at', p.created_at,
    'payment_method', p.payment_method,
    'entry_used', p.entry_validated_at is not null,
    'candy_delivered', p.candy_delivered_at is not null,
    'movie', m.title,
    'age_rating', m.age_rating,
    'room', r.name,
    'starts_at', s.starts_at,
    'ends_at', s.ends_at,
    'format', s.format,
    'language', s.language,
    'seats', (
      select jsonb_agg(
        jsonb_build_object('row', se.row_label, 'number', se.seat_number, 'type', se.seat_type, 'price', t.price)
        order by se.row_order, se.seat_number
      )
      from public.tickets t
      join public.seats se on se.id = t.seat_id
      where t.purchase_id = p.id
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', pr.name, 'quantity', i.quantity, 'unit_price', i.unit_price)
        order by pr.name
      )
      from public.purchase_items i
      join public.products pr on pr.id = i.product_id
      where i.purchase_id = p.id
    ), '[]'::jsonb)
  )
  from public.purchases p
  join lateral (
    select t.showtime_id from public.tickets t where t.purchase_id = p.id limit 1
  ) tk on true
  join public.showtimes s on s.id = tk.showtime_id
  join public.movies m on m.id = s.movie_id
  join public.rooms r on r.id = s.room_id
  where p.code = upper(trim(p_code));
$$;

revoke execute on function public.get_ticket(text) from public;
grant execute on function public.get_ticket(text) to anon, authenticated;