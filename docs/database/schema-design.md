# Thiết Kế Schema Cơ Sở Dữ Liệu — GoPlant

> **Giai đoạn:** 3 — Thiết kế dữ liệu và hợp đồng API  
> **Nhánh:** `feature/integrate-frontend-report`  
> **Ngày cập nhật:** 2026-10-31  
> **Target RDBMS:** PostgreSQL 15+ (Supabase PostgreSQL)  
> **Trạng thái:** Bản thiết kế — chưa chạy migration trên database thật

---

## 1. Quyết định thiết kế toàn cục

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Kiểu khóa chính | `UUID` (gen_random_uuid()) | Không lộ ID tuần tự, phân tán, tương thích JPA `@GeneratedValue` |
| Kiểu timestamp | `TIMESTAMPTZ` | Lưu UTC, tránh lỗi múi giờ khi client ở nhiều vùng |
| Kiểu enum | `VARCHAR` + CHECK CONSTRAINT | Dễ thêm giá trị mới mà không cần migration ALTER TYPE |
| Soft delete | Không áp dụng ở Giai đoạn 3 | Đơn giản hóa; có thể bổ sung `deleted_at` sau |
| Độ chính xác số thực | `NUMERIC` / `DOUBLE PRECISION` | Chỉ cho các chỉ số đo lường thực tế (chưa có ở Giai đoạn 3) |
| Ảnh / media | TEXT[] (mảng URL) | Lưu đường dẫn object storage (S3/Supabase Storage), không nhị phân |
| Extension cần bật | `pgcrypto` (uuid_generate_v4) hoặc built-in `gen_random_uuid()` | PostgreSQL 13+ có sẵn, không cần extension thêm |

---

## 2. Danh sách bảng

| # | Tên bảng | Mô tả | Trạng thái |
|---|---|---|---|
| 1 | `users` | Tài khoản người dùng | MVP |
| 2 | `roles` | Vai trò hệ thống (USER, ADMIN) | MVP |
| 3 | `user_roles` | Gán vai trò cho người dùng (n-n) | MVP |
| 4 | `plant_species` | Danh mục giống cây chuẩn | MVP |
| 5 | `user_favorite_species` | Giống cây yêu thích của người dùng | MVP |
| 6 | `gardens` | Khu vườn của người dùng | MVP |
| 7 | `user_plants` | Cây trồng cá nhân trong vườn | MVP |
| 8 | `care_schedules` | Lịch chăm sóc định kỳ | MVP |
| 9 | `care_logs` | Nhật ký thực hiện chăm sóc | MVP |
| 10 | `growth_journals` | Nhật ký phát triển cây | MVP |
| 11 | `cameras` | Thông tin camera giám sát | Backlog |

---

## 3. Data Dictionary

---

### 3.1. Bảng `users`

**Mô tả:** Lưu thông tin tài khoản người dùng. Mật khẩu được mã hóa bằng BCrypt. Không lưu mật khẩu hoặc token rõ ràng.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | Định danh duy nhất |
| `full_name` | VARCHAR(200) | NOT NULL | — | NOT NULL | Họ và tên hiển thị |
| `email` | VARCHAR(255) | NULL | NULL | UNIQUE (khi không NULL) | Email đăng nhập chính |
| `phone_number` | VARCHAR(20) | NULL | NULL | UNIQUE (khi không NULL) | SĐT đăng nhập (thay thế email) |
| `recovery_email` | VARCHAR(255) | NULL | NULL | — | Email khôi phục tài khoản (tùy chọn) |
| `password_hash` | VARCHAR(255) | NOT NULL | — | NOT NULL | BCrypt hash, KHÔNG lưu plain text |
| `preferred_device` | VARCHAR(10) | NULL | 'MOBILE' | CHECK IN ('MOBILE','PC') | Thiết bị ưu thích (từ màn hình đăng ký) |
| `status` | VARCHAR(20) | NOT NULL | 'ACTIVE' | CHECK IN ('ACTIVE','INACTIVE','BANNED') | Trạng thái tài khoản |
| `avatar_url` | TEXT | NULL | NULL | — | URL ảnh đại diện (object storage) |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | Thời điểm tạo tài khoản |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | Thời điểm cập nhật gần nhất |

**Ràng buộc bổ sung:** `CHECK (email IS NOT NULL OR phone_number IS NOT NULL)` — bắt buộc ít nhất 1 trong 2 trường.

**Chỉ mục:**
```sql
CREATE UNIQUE INDEX idx_users_email ON users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_phone ON users (phone_number) WHERE phone_number IS NOT NULL;
```

---

### 3.2. Bảng `roles`

**Mô tả:** Bảng tham chiếu vai trò hệ thống. Dữ liệu cố định, không thay đổi trong runtime.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `name` | VARCHAR(50) | NOT NULL | — | UNIQUE, NOT NULL | Ví dụ: 'ROLE_USER', 'ROLE_ADMIN' |

**Dữ liệu khởi tạo:**
```sql
INSERT INTO roles (name) VALUES ('ROLE_USER'), ('ROLE_ADMIN');
```

---

### 3.3. Bảng `user_roles`

**Mô tả:** Quan hệ nhiều-nhiều giữa `users` và `roles`.

| Cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---|---|---|---|---|
| `user_id` | UUID | NOT NULL | FK → users.id ON DELETE CASCADE | |
| `role_id` | UUID | NOT NULL | FK → roles.id ON DELETE CASCADE | |

**Khóa chính:** `PRIMARY KEY (user_id, role_id)`

---

### 3.4. Bảng `plant_species`

**Mô tả:** Danh mục giống cây chuẩn do Admin quản lý. Ánh xạ đầy đủ từ `PlantProfile` TypeScript interface.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| `common_name` | VARCHAR(200) | NOT NULL | — | Tên thông thường |
| `scientific_name` | VARCHAR(200) | NOT NULL | — | Tên khoa học |
| `category` | VARCHAR(100) | NOT NULL | — | Nhóm cây: "Cây cảnh", "Rau củ", v.v. |
| `difficulty` | VARCHAR(50) | NULL | NULL | Mức độ chăm sóc |
| `light_requirement` | TEXT | NULL | NULL | Yêu cầu ánh sáng |
| `water_requirement` | TEXT | NULL | NULL | Yêu cầu nước |
| `environment` | TEXT | NULL | NULL | Điều kiện môi trường |
| `space_requirement` | TEXT | NULL | NULL | Không gian cần thiết |
| `mature_size` | VARCHAR(100) | NULL | NULL | Kích thước khi trưởng thành |
| `temperature_range` | VARCHAR(100) | NULL | NULL | Khoảng nhiệt độ phù hợp |
| `humidity_range` | VARCHAR(100) | NULL | NULL | Khoảng độ ẩm phù hợp |
| `growing_medium` | TEXT | NULL | NULL | Giá thể / đất trồng |
| `drainage` | VARCHAR(100) | NULL | NULL | Thoát nước |
| `soil_ph` | VARCHAR(50) | NULL | NULL | pH đất phù hợp |
| `sun_tolerance` | VARCHAR(100) | NULL | NULL | Chịu nắng |
| `origin` | TEXT | NULL | NULL | Xuất xứ địa lý |
| `overview` | TEXT | NULL | NULL | Tổng quan mô tả |
| `morphology` | TEXT | NULL | NULL | Đặc điểm hình thái |
| `lifespan` | VARCHAR(100) | NULL | NULL | Vòng đời |
| `flowering_season` | VARCHAR(100) | NULL | NULL | Mùa ra hoa |
| `usage_and_caution` | TEXT | NULL | NULL | Công dụng và lưu ý |
| `growth_rate` | VARCHAR(100) | NULL | NULL | Tốc độ phát triển |
| `watering_frequency` | VARCHAR(100) | NULL | NULL | Tần suất tưới nước |
| `nutrition` | TEXT | NULL | NULL | Chế độ dinh dưỡng |
| `thumbnail_url` | TEXT | NULL | NULL | Ảnh đại diện giống cây |
| `is_active` | BOOLEAN | NOT NULL | TRUE | Hiển thị hay ẩn giống cây |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | |

**Chỉ mục:**
```sql
CREATE INDEX idx_species_category ON plant_species (category);
CREATE INDEX idx_species_name ON plant_species USING gin(to_tsvector('simple', common_name || ' ' || scientific_name));
```

---

### 3.5. Bảng `user_favorite_species` *(Bảng đề xuất thêm)*

**Mô tả:** Lưu danh sách giống cây yêu thích của từng người dùng. Được đề xuất thêm do frontend có `favorites: string[]` trong PlantDataContext.

| Cột | Kiểu dữ liệu | Nullable | Ràng buộc | Mô tả |
|---|---|---|---|---|
| `user_id` | UUID | NOT NULL | FK → users.id ON DELETE CASCADE | |
| `species_id` | UUID | NOT NULL | FK → plant_species.id ON DELETE CASCADE | |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | Thời điểm thêm yêu thích |

**Khóa chính:** `PRIMARY KEY (user_id, species_id)`

---

### 3.6. Bảng `gardens`

**Mô tả:** Khu vườn thuộc sở hữu của người dùng. Mỗi vườn có thể chứa nhiều cây trồng.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `owner_id` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | Chủ vườn |
| `name` | VARCHAR(200) | NOT NULL | — | NOT NULL | Tên khu vườn |
| `location` | TEXT | NOT NULL | — | NOT NULL | Địa chỉ hoặc mô tả vị trí |
| `space_type` | VARCHAR(50) | NULL | NULL | CHECK IN ('BAN_CONG','SAN_THUONG','TRONG_NHA','SAN_VUON','KHAC') | Loại không gian |
| `description` | TEXT | NULL | NULL | — | Mô tả khu vườn |
| `cover_image_url` | TEXT | NULL | NULL | — | Ảnh bìa khu vườn |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Chỉ mục:**
```sql
CREATE INDEX idx_gardens_owner ON gardens (owner_id);
```

---

### 3.7. Bảng `user_plants`

**Mô tả:** Cây trồng cá nhân của người dùng trong 1 khu vườn. Mỗi hàng đại diện 1 cây cụ thể đang được chăm sóc.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `owner_id` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | Chủ cây |
| `garden_id` | UUID | NOT NULL | — | FK → gardens.id ON DELETE CASCADE | Khu vườn chứa cây |
| `species_id` | UUID | NOT NULL | — | FK → plant_species.id ON RESTRICT | Giống cây |
| `display_name` | VARCHAR(200) | NOT NULL | — | NOT NULL | Tên hiển thị riêng của cây |
| `location` | VARCHAR(200) | NULL | NULL | — | Vị trí trong vườn (từ OwnedPlant.location) |
| `planted_at` | DATE | NULL | NULL | — | Ngày bắt đầu trồng / chăm sóc |
| `note` | TEXT | NULL | NULL | — | Ghi chú cá nhân |
| `health_status` | VARCHAR(50) | NOT NULL | 'UNKNOWN' | CHECK IN ('HEALTHY','NEEDS_ATTENTION','CRITICAL','UNKNOWN') | Tình trạng sức khỏe |
| `plant_code` | VARCHAR(50) | NULL | NULL | UNIQUE | Mã QR định danh (backlog) |
| `image_url` | TEXT | NULL | NULL | — | Ảnh chính của cây |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Chỉ mục:**
```sql
CREATE INDEX idx_user_plants_owner ON user_plants (owner_id);
CREATE INDEX idx_user_plants_garden ON user_plants (garden_id);
CREATE INDEX idx_user_plants_species ON user_plants (species_id);
```

---

### 3.8. Bảng `care_schedules`

**Mô tả:** Lịch chăm sóc định kỳ cho 1 cây. Hỗ trợ nhiều tần suất lặp lại. Trạng thái OVERDUE được tính động tại tầng API, không lưu vào DB.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `user_plant_id` | UUID | NOT NULL | — | FK → user_plants.id ON DELETE CASCADE | Cây áp dụng lịch |
| `owner_id` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | Người tạo lịch |
| `task_type` | VARCHAR(100) | NOT NULL | — | NOT NULL | Loại công việc: 'WATERING', 'FERTILIZING', 'PRUNING', 'PEST_CHECK', 'MISTING', 'JOURNAL' |
| `task_label` | VARCHAR(200) | NULL | NULL | — | Nhãn tùy chỉnh (nếu khác task_type chuẩn) |
| `frequency` | VARCHAR(30) | NOT NULL | 'ONCE' | CHECK IN ('ONCE','DAILY','EVERY_OTHER_DAY','WEEKLY','CUSTOM') | Tần suất lặp lại |
| `interval_days` | INTEGER | NULL | NULL | CHECK > 0 (khi CUSTOM) | Số ngày giữa 2 lần (dùng khi frequency = CUSTOM) |
| `reminder_time` | TIME | NULL | NULL | — | Giờ nhắc nhở trong ngày |
| `start_date` | DATE | NOT NULL | CURRENT_DATE | NOT NULL | Ngày bắt đầu |
| `end_date` | DATE | NULL | NULL | — | Ngày kết thúc (NULL = không giới hạn) |
| `next_scheduled_at` | TIMESTAMPTZ | NOT NULL | — | NOT NULL | Thời điểm lần thực hiện kế tiếp |
| `status` | VARCHAR(20) | NOT NULL | 'PENDING' | CHECK IN ('PENDING','COMPLETED','SKIPPED','PAUSED','CANCELLED') | Trạng thái lịch |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Lưu ý nghiệp vụ OVERDUE:** Khi trả về API, Service sẽ so sánh `next_scheduled_at < NOW()` và `status = PENDING` để thêm trường `is_overdue: true` vào Response DTO.

**Ánh xạ từ CreateScheduleScreen:**
- `repeat = 'Mỗi ngày'` → `frequency = 'DAILY'`
- `repeat = 'Cách ngày'` → `frequency = 'EVERY_OTHER_DAY'`
- `repeat = 'Hàng tuần'` → `frequency = 'WEEKLY'`
- `repeat = 'Tùy chỉnh'` → `frequency = 'CUSTOM'`, `interval_days = N`

**Chỉ mục:**
```sql
CREATE INDEX idx_care_schedules_plant ON care_schedules (user_plant_id);
CREATE INDEX idx_care_schedules_owner ON care_schedules (owner_id);
CREATE INDEX idx_care_schedules_next ON care_schedules (next_scheduled_at) WHERE status = 'PENDING';
```

---

### 3.9. Bảng `care_logs`

**Mô tả:** Ghi nhận mỗi lần thực hiện (hoàn thành hoặc bỏ qua) 1 công việc chăm sóc. Có thể liên kết với `care_schedules` hoặc là ghi nhận thủ công (ad-hoc).

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `user_plant_id` | UUID | NOT NULL | — | FK → user_plants.id ON DELETE CASCADE | Cây được chăm sóc |
| `schedule_id` | UUID | NULL | NULL | FK → care_schedules.id ON DELETE SET NULL | Lịch tương ứng (NULL = ad-hoc) |
| `performed_by` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | Người thực hiện |
| `task_type` | VARCHAR(100) | NOT NULL | — | NOT NULL | Loại công việc (sao chép từ schedule hoặc nhập trực tiếp) |
| `status` | VARCHAR(20) | NOT NULL | — | CHECK IN ('COMPLETED','SKIPPED') | Kết quả |
| `note` | TEXT | NULL | NULL | — | Ghi chú sau khi chăm sóc |
| `image_urls` | TEXT[] | NULL | NULL | — | Mảng URL ảnh trước/sau chăm sóc |
| `performed_at` | TIMESTAMPTZ | NOT NULL | NOW() | NOT NULL | Thời điểm thực hiện |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Chỉ mục:**
```sql
CREATE INDEX idx_care_logs_plant ON care_logs (user_plant_id);
CREATE INDEX idx_care_logs_schedule ON care_logs (schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX idx_care_logs_performed_by ON care_logs (performed_by);
CREATE INDEX idx_care_logs_performed_at ON care_logs (performed_at DESC);
```

---

### 3.10. Bảng `growth_journals`

**Mô tả:** Nhật ký phát triển — ghi nhận tình trạng cây theo thời gian, hỗ trợ ảnh đính kèm.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `user_plant_id` | UUID | NOT NULL | — | FK → user_plants.id ON DELETE CASCADE | Cây được ghi nhận |
| `author_id` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | Người viết nhật ký |
| `entry_type` | VARCHAR(50) | NOT NULL | 'GROWTH' | CHECK IN ('GROWTH','WATERING','FERTILIZING','PEST','OTHER') | Loại ghi nhận |
| `health_status` | VARCHAR(50) | NOT NULL | 'HEALTHY' | CHECK IN ('HEALTHY','NEEDS_ATTENTION','CRITICAL') | Tình trạng cây |
| `note` | TEXT | NOT NULL | — | NOT NULL | Nội dung ghi nhận (bắt buộc) |
| `image_urls` | TEXT[] | NULL | NULL | — | Mảng URL ảnh minh họa |
| `recorded_at` | TIMESTAMPTZ | NOT NULL | NOW() | NOT NULL | Thời điểm ghi nhận |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Chỉ mục:**
```sql
CREATE INDEX idx_growth_journals_plant ON growth_journals (user_plant_id);
CREATE INDEX idx_growth_journals_recorded ON growth_journals (recorded_at DESC);
```

---

### 3.11. Bảng `cameras` *(Backlog)*

**Mô tả:** Thông tin camera giám sát trong khu vườn. Giai đoạn 3 chỉ lưu metadata; không thiết kế streaming.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `garden_id` | UUID | NOT NULL | — | FK → gardens.id ON DELETE CASCADE | Khu vườn gắn camera |
| `owner_id` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | |
| `name` | VARCHAR(200) | NOT NULL | — | NOT NULL | Tên định danh camera |
| `location_desc` | TEXT | NULL | NULL | — | Mô tả vị trí đặt camera |
| `status` | VARCHAR(20) | NOT NULL | 'OFFLINE' | CHECK IN ('ONLINE','OFFLINE','ERROR') | Trạng thái kết nối |
| `connection_note` | TEXT | NULL | NULL | — | Ghi chú kết nối (KHÔNG lưu credentials) |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

> [!CAUTION]
> Không lưu URL stream, username, password camera dưới dạng plain text vào database. Nếu cần, phải mã hóa riêng và không commit vào source code.

---

## 4. Sơ đồ quan hệ (tóm tắt)

```
users (1) ──────────────── (n) user_roles (n) ──── (1) roles
users (1) ──────────────── (n) gardens
users (1) ──────────────── (n) user_plants
users (1) ──────────────── (n) user_favorite_species (n) ── (1) plant_species
gardens (1) ────────────── (n) user_plants
gardens (1) ────────────── (n) cameras [Backlog]
plant_species (1) ───────── (n) user_plants
user_plants (1) ─────────── (n) care_schedules
user_plants (1) ─────────── (n) care_logs
user_plants (1) ─────────── (n) growth_journals
care_schedules (1) ──────── (n) care_logs (nullable FK)
```

*(Xem chi tiết trong `docs/database/erd.mmd`)*

---

## 5. Chính sách xóa cascade

| Bảng cha | Bảng con | Hành động khi xóa cha |
|---|---|---|
| `users` | `user_roles`, `gardens`, `user_plants`, `care_schedules`, `care_logs`, `growth_journals`, `cameras`, `user_favorite_species` | CASCADE |
| `gardens` | `user_plants`, `cameras` | CASCADE |
| `user_plants` | `care_schedules`, `care_logs`, `growth_journals` | CASCADE |
| `care_schedules` | `care_logs` (schedule_id) | SET NULL (care_log giữ lại làm lịch sử) |
| `plant_species` | `user_plants` | RESTRICT (không cho xóa giống đang có cây đang trồng) |
| `plant_species` | `user_favorite_species` | CASCADE |
| `roles` | `user_roles` | CASCADE |

---

*Tài liệu này là phần của Giai đoạn 3 — chỉ dùng cho thiết kế, chưa triển khai trên database thật.*
