-- ==============================================================================
-- GOPLANT DATABASE MIGRATION V3 — MEDIA RECONCILIATION LEASES (G5.5.2b.2.1)
-- ==============================================================================
-- Author: Antigravity Agent
-- Scope: Atomic Media State Machine, Reconciliation Leases & Distributed Cleanup
-- Engine: PostgreSQL 16 (Flyway compatible with H2 PostgreSQL mode)
-- ==============================================================================

-- 1. CẬP NHẬT CHECK CONSTRAINT TRẠNG THÁI MEDIA (BỔ SUNG RECONCILING VÀ FAILED)
ALTER TABLE media_objects DROP CONSTRAINT IF EXISTS media_objects_status_check;
ALTER TABLE media_objects ADD CONSTRAINT media_objects_status_check 
    CHECK (status IN ('PENDING', 'RECONCILING', 'READY', 'ATTACHED', 'DELETING', 'DELETED', 'FAILED'));

-- 2. BỔ SUNG CÁC CỘT HỖ TRỢ LEASE, RETRY BACKOFF VÀ RECONCILIATION AUDIT
ALTER TABLE media_objects
    ADD COLUMN IF NOT EXISTS lease_token VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS error_detail VARCHAR(1000) NULL;
