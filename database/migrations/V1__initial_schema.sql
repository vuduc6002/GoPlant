-- ==============================================================================
-- GoPlant - Database Migration V1: Initial Schema (PostgreSQL)
-- File: V1__initial_schema.sql
-- Compatibility: PostgreSQL 14+, Supabase PostgreSQL, Flyway 10+
-- 
-- CAUTION / CẢNH BÁO:
-- BẢN THẢO THIẾT KẾ (DRAFT) - ĐẶC TẢ GIAI ĐOẠN 3.
-- KHÔNG ĐƯỢC TỰ ĐỘNG CHẠY FILE NÀY TRỰC TIẾP TRÊN CƠ SỞ DỮ LIỆU SUPABASE PRODUCTION
-- HOẶC DATABASE THẬT KHI CHƯA CÓ SỰ PHÊ DUYỆT CỦA ARCHITECT VÀ TEAM LEADER.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE DEFINITIONS (Thứ tự tạo theo phụ thuộc Khóa ngoại)
-- ==============================================================================

-- 2.1. ROLES (Vai trò phân quyền hệ thống)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE
);

-- 2.2. USERS (Tài khoản người dùng)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NULL,
    phone_number VARCHAR(20) NULL,
    recovery_email VARCHAR(255) NULL,
    password_hash VARCHAR(255) NOT NULL,
    preferred_device VARCHAR(10) DEFAULT 'MOBILE' CHECK (preferred_device IN ('MOBILE', 'PC')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'BANNED')),
    avatar_url TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_users_contact_present CHECK (email IS NOT NULL OR phone_number IS NOT NULL)
);

-- 2.3. USER_ROLES (Quan hệ nhiều-nhiều người dùng - vai trò)
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 2.4. PLANT_SPECIES (Danh mục giống cây chuẩn do Admin quản trị)
CREATE TABLE IF NOT EXISTS plant_species (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    common_name VARCHAR(200) NOT NULL,
    scientific_name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    difficulty VARCHAR(50) NULL,
    light_requirement TEXT NULL,
    water_requirement TEXT NULL,
    environment TEXT NULL,
    space_requirement TEXT NULL,
    mature_size VARCHAR(100) NULL,
    temperature_range VARCHAR(100) NULL,
    humidity_range VARCHAR(100) NULL,
    growing_medium TEXT NULL,
    drainage VARCHAR(100) NULL,
    soil_ph VARCHAR(50) NULL,
    sun_tolerance VARCHAR(100) NULL,
    origin TEXT NULL,
    overview TEXT NULL,
    morphology TEXT NULL,
    lifespan VARCHAR(100) NULL,
    flowering_season VARCHAR(100) NULL,
    usage_and_caution TEXT NULL,
    growth_rate VARCHAR(100) NULL,
    watering_frequency VARCHAR(100) NULL,
    nutrition TEXT NULL,
    thumbnail_url TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.5. USER_FAVORITE_SPECIES (Giống cây yêu thích của người dùng)
CREATE TABLE IF NOT EXISTS user_favorite_species (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    species_id UUID NOT NULL REFERENCES plant_species(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, species_id)
);

-- 2.6. GARDENS (Không gian vườn cá nhân)
CREATE TABLE IF NOT EXISTS gardens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    location TEXT NOT NULL,
    space_type VARCHAR(50) DEFAULT 'BAN_CONG' CHECK (space_type IN ('BAN_CONG', 'SAN_THUONG', 'TRONG_NHA', 'SAN_VUON', 'KHAC')),
    description TEXT NULL,
    cover_image_url TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7. USER_PLANTS (Hồ sơ cây trồng cá nhân trong vườn)
CREATE TABLE IF NOT EXISTS user_plants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    species_id UUID NOT NULL REFERENCES plant_species(id) ON DELETE RESTRICT,
    display_name VARCHAR(200) NOT NULL,
    location VARCHAR(200) NULL,
    planted_at DATE NULL,
    note TEXT NULL,
    health_status VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN' CHECK (health_status IN ('HEALTHY', 'NEEDS_ATTENTION', 'CRITICAL', 'UNKNOWN')),
    plant_code VARCHAR(50) UNIQUE NULL,
    image_url TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.8. CARE_SCHEDULES (Lịch chăm sóc định kỳ cho cây)
CREATE TABLE IF NOT EXISTS care_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_plant_id UUID NOT NULL REFERENCES user_plants(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_type VARCHAR(100) NOT NULL CHECK (task_type IN ('WATERING', 'FERTILIZING', 'PRUNING', 'PEST_CHECK', 'MISTING', 'JOURNAL')),
    task_label VARCHAR(200) NULL,
    frequency VARCHAR(30) NOT NULL DEFAULT 'ONCE' CHECK (frequency IN ('ONCE', 'DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'CUSTOM')),
    interval_days INTEGER NULL CHECK (interval_days IS NULL OR interval_days > 0),
    reminder_time TIME NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NULL,
    next_scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED', 'PAUSED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.9. CARE_LOGS (Nhật ký thực hiện chăm sóc cây)
CREATE TABLE IF NOT EXISTS care_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_plant_id UUID NOT NULL REFERENCES user_plants(id) ON DELETE CASCADE,
    schedule_id UUID NULL REFERENCES care_schedules(id) ON DELETE SET NULL,
    performed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('COMPLETED', 'SKIPPED')),
    note TEXT NULL,
    image_urls TEXT[] NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.10. GROWTH_JOURNALS (Nhật ký theo dõi sinh trưởng và hình thái cây)
CREATE TABLE IF NOT EXISTS growth_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_plant_id UUID NOT NULL REFERENCES user_plants(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_type VARCHAR(50) NOT NULL DEFAULT 'GROWTH' CHECK (entry_type IN ('GROWTH', 'WATERING', 'FERTILIZING', 'PEST', 'OTHER')),
    health_status VARCHAR(50) NOT NULL DEFAULT 'HEALTHY' CHECK (health_status IN ('HEALTHY', 'NEEDS_ATTENTION', 'CRITICAL')),
    note TEXT NOT NULL,
    image_urls TEXT[] NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.11. CAMERAS (Thiết bị camera giám sát vườn - BACKLOG)
CREATE TABLE IF NOT EXISTS cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    garden_id UUID NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    location_desc TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'ERROR')),
    connection_note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 3. INDEXES (Tối ưu hiệu năng truy vấn và ràng buộc toàn vẹn)
-- ==============================================================================

-- 3.1. Users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone_number) WHERE phone_number IS NOT NULL;

-- 3.2. Plant Species
CREATE INDEX IF NOT EXISTS idx_species_category ON plant_species(category);
CREATE INDEX IF NOT EXISTS idx_species_active ON plant_species(is_active);

-- 3.3. Gardens
CREATE INDEX IF NOT EXISTS idx_gardens_owner_id ON gardens(owner_id);

-- 3.4. User Plants
CREATE INDEX IF NOT EXISTS idx_user_plants_owner_id ON user_plants(owner_id);
CREATE INDEX IF NOT EXISTS idx_user_plants_garden_id ON user_plants(garden_id);
CREATE INDEX IF NOT EXISTS idx_user_plants_species_id ON user_plants(species_id);

-- 3.5. Care Schedules
CREATE INDEX IF NOT EXISTS idx_care_schedules_plant_id ON care_schedules(user_plant_id);
CREATE INDEX IF NOT EXISTS idx_care_schedules_owner_id ON care_schedules(owner_id);
CREATE INDEX IF NOT EXISTS idx_care_schedules_pending ON care_schedules(next_scheduled_at) WHERE status = 'PENDING';

-- 3.6. Care Logs
CREATE INDEX IF NOT EXISTS idx_care_logs_plant_id ON care_logs(user_plant_id);
CREATE INDEX IF NOT EXISTS idx_care_logs_schedule_id ON care_logs(schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_care_logs_performed_by ON care_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_care_logs_performed_at ON care_logs(performed_at DESC);

-- 3.7. Growth Journals
CREATE INDEX IF NOT EXISTS idx_growth_journals_plant_id ON growth_journals(user_plant_id);
CREATE INDEX IF NOT EXISTS idx_growth_journals_recorded_at ON growth_journals(recorded_at DESC);

-- 3.8. Cameras
CREATE INDEX IF NOT EXISTS idx_cameras_garden_id ON cameras(garden_id);

-- ==============================================================================
-- 4. SEED DATA (Dữ liệu danh mục chuẩn ban đầu)
-- ==============================================================================

-- 4.1. Khởi tạo các vai trò chuẩn
INSERT INTO roles (name) VALUES 
    ('ROLE_USER'),
    ('ROLE_ADMIN')
ON CONFLICT (name) DO NOTHING;

-- 4.2. Khởi tạo 5 giống cây danh mục mặc định (đồng bộ từ PlantDataStore.tsx)
INSERT INTO plant_species (
    id, common_name, scientific_name, category, difficulty, light_requirement, water_requirement, is_active
) VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'Trầu bà lá xẻ', 'Monstera deliciosa', 'Cây cảnh', 'Dễ', 'Ánh sáng gián tiếp hoặc bóng râm bán phần', 'Tưới khi 2-3cm bề mặt đất khô ráo', TRUE),
    ('a0000000-0000-0000-0000-000000000002', 'Trầu bà cẩm thạch', 'Epipremnum aureum ''Marble Queen''', 'Cây cảnh', 'Rất dễ', 'Ánh sáng trung bình, tránh nắng gắt trực tiếp', 'Giữ ẩm vừa phải, không để ứ đọng', TRUE),
    ('a0000000-0000-0000-0000-000000000003', 'Trầu bà Thanh Xuân', 'Philodendron bipinnatifidum', 'Cây cảnh', 'Trung bình', 'Ánh sáng tán xạ tự nhiên, thông thoáng', 'Tưới 2-3 lần/tuần tùy độ ẩm không khí', TRUE),
    ('a0000000-0000-0000-0000-000000000004', 'Trầu bà Đế Vương đỏ', 'Philodendron ''Imperial Red''', 'Cây cảnh', 'Dễ', 'Ưa bóng bán phần hoặc ánh sáng đèn huỳnh quang', 'Tưới đều đặn lượng nước vừa đủ', TRUE),
    ('a0000000-0000-0000-0000-000000000005', 'Trầu bà Tay Phật', 'Philodendron pedatum', 'Cây cảnh', 'Trung bình', 'Ánh sáng lọc dịu nhẹ, độ ẩm cao', 'Phun sương giữ ẩm lá và đất thoát nước tốt', TRUE)
ON CONFLICT (id) DO NOTHING;
