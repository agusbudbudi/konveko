-- Fase 2a: warehouse staff put finished pieces on racks.
-- Kept in its own migration: a new enum value cannot be used in the same
-- transaction that adds it.
alter type public.app_role add value if not exists 'gudang';
