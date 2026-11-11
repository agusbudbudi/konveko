-- History of an outbound document reads piece events by document; without this index that
-- is a scan over every piece event ever written.
create index piece_event_outbound_idx on public.piece_event (outbound_id, seq) where outbound_id is not null;
