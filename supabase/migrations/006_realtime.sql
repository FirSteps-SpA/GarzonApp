-- Migración 006 · Habilitar Realtime (Fase 7)
-- Agrega las tablas a la publicación `supabase_realtime` para que emitan
-- eventos de postgres_changes a los clientes suscritos.
-- Realtime respeta RLS: cada cliente solo recibe filas que puede leer (SELECT).

alter publication supabase_realtime add table public.estados_mesa;
alter publication supabase_realtime add table public.items_carta;
alter publication supabase_realtime add table public.categorias_carta;
alter publication supabase_realtime add table public.disponibilidad_items;
