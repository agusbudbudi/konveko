-- Indexes for foreign keys that the reconciliation views and dashboards join on.
-- Remaining unindexed FKs (scanned_by, created_by, resolved_by, changed_by,
-- movement holder/reason refs, stock_ledger ref/batch) are only used when the
-- referenced row is deleted, which the app never does (records are deactivated).

create index bundle_variant_idx           on public.bundle (variant_id);           -- batch_variant_reconciliation
create index bundle_current_holder_idx    on public.bundle (current_holder_id);    -- wip_list
create index discrepancy_bundle_idx       on public.discrepancy (bundle_id);       -- batch_reconciliation.open_discrepancies
create index stock_ledger_bundle_idx      on public.stock_ledger (bundle_id);      -- stock per bundle
create index production_batch_roll_idx    on public.production_batch (fabric_roll_id);
