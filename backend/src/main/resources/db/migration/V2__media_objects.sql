-- ==============================================================================
-- GOPLANT DATABASE MIGRATION V2 — MEDIA OBJECTS (G5.5.2b)
-- ==============================================================================
-- Author: Antigravity Agent
-- Scope: Private Media Storage & Secure Image Upload Pipeline
-- Engine: PostgreSQL 16 (Flyway compatible with H2 PostgreSQL mode)
-- ==============================================================================

-- 1. BẢNG MEDIA_OBJECTS (Quản lý metadata tệp tin đa phương tiện trong Private Bucket)
CREATE TABLE IF NOT EXISTS media_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    bucket VARCHAR(100) NOT NULL,
    object_key VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    width INTEGER NULL,
    height INTEGER NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT media_objects_size_bytes_check CHECK (size_bytes >= 1 AND size_bytes <= 5242880),
    CONSTRAINT media_objects_status_check CHECK (status IN ('PENDING', 'READY', 'ATTACHED', 'DELETING', 'DELETED')),
    CONSTRAINT uq_media_objects_bucket_key UNIQUE (bucket, object_key)
);

-- 2. INDEXES (Tối ưu truy vấn danh sách media theo người dùng và trạng thái)
CREATE INDEX IF NOT EXISTS idx_media_objects_owner_created ON media_objects(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_objects_status ON media_objects(status);
