-- Fase 2c stok opname (doc/PRD Fase 2c - Stok opname.md): new enum values.
-- In their own migration because a value added with ALTER TYPE cannot be used
-- in the same transaction.

alter type public.piece_event_type add value if not exists 'stok_awal';  -- piece created from an unlabeled count line
