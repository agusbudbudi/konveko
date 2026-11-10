-- Fase 2b (barang keluar, retur): new enum values.
-- In their own migration because a value added with ALTER TYPE cannot be used
-- in the same transaction (views, defaults, checks in the next migration use them).

alter type public.piece_status add value if not exists 'keluar';

alter type public.piece_event_type add value if not exists 'keluar';       -- shipped on an outbound document
alter type public.piece_event_type add value if not exists 'retur';        -- came back after 'keluar'
alter type public.piece_event_type add value if not exists 'dipesan';      -- added to a draft outbound document
alter type public.piece_event_type add value if not exists 'lepas_pesan';  -- removed from a draft, or the draft was cancelled
