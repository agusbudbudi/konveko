-- Fase 2 rework (doc/PRD Fase 2 - Reject dan rework.md): new enum values.
-- In their own migration because a value added with ALTER TYPE cannot be used
-- in the same transaction (views, checks and functions in the next migration use them).

alter type public.bundle_status add value if not exists 'batal';            -- rework bundle cancelled before any scan
alter type public.movement_type add value if not exists 'rework';           -- first movement of a rework bundle
alter type public.piece_status add value if not exists 'rework';            -- reject/damaged piece sent to a rework bundle
alter type public.piece_event_type add value if not exists 'rework';        -- piece taken into a rework bundle
alter type public.piece_event_type add value if not exists 'batal_rework';  -- rework bundle cancelled, piece back
