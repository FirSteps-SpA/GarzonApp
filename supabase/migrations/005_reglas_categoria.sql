-- Migración 005 · Reglas de disponibilidad por categoría
-- Permite que una regla apunte a una categoría entera (aplica a ella y a todos
-- sus descendientes) en lugar de a un solo ítem.
-- Correr DESPUÉS de 002–004.

-- item_id deja de ser obligatorio (la regla puede ser por categoría).
alter table public.disponibilidad_items
  alter column item_id drop not null;

-- Nueva columna: objetivo categoría.
alter table public.disponibilidad_items
  add column if not exists categoria_id uuid references public.categorias_carta(id) on delete cascade;

-- Exactamente uno de los dos objetivos debe estar presente.
alter table public.disponibilidad_items
  drop constraint if exists chk_disponibilidad_objetivo;
alter table public.disponibilidad_items
  add constraint chk_disponibilidad_objetivo
  check ((item_id is not null)::int + (categoria_id is not null)::int = 1);

create index if not exists idx_disponibilidad_categoria_id
  on public.disponibilidad_items(categoria_id);
