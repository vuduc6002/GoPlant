# Thiết Kế Schema Cơ Sở Dữ Liệu — GoPlant

> **Giai đoạn:** 3.1 — Đồng bộ thiết kế dữ liệu, ERD và SQL  
> **Nhánh:** `feature/integrate-frontend-report`  
> **Ngày cập nhật:** 2026-11-08  
> **Target RDBMS:** PostgreSQL 14+ (Supabase PostgreSQL, Flyway 10+)  
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
| Bảo vệ quyền sở hữu dữ liệu | Composite Foreign Key `(parent_id, owner_id)` | Ngăn chặn hoàn toàn tham chiếu chéo dữ liệu giữa các người dùng ở tầng CSDL |

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
| 8 | `care_schedules` | Lịch chăm sóc định kỳ (định nghĩa & vòng đời) | MVP |
| 9 | `care_logs` | Nhật ký thực hiện chăm sóc (kết quả thực thi) | MVP |
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

**Ràng buộc bổ sung:** `CONSTRAINT chk_users_contact_present CHECK (email IS NOT NULL OR phone_number IS NOT NULL)` — bắt buộc ít nhất 1 trong 2 trường.

**Chỉ mục:**
```sql
CREATE UNIQUE INDEX idx_users_email_unique ON users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_phone_unique ON users (phone_number) WHERE phone_number IS NOT NULL;
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
INSERT INTO roles (name) VALUES ('ROLE_USER'), ('ROLE_ADMIN') ON CONFLICT (name) DO NOTHING;
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
CREATE INDEX idx_species_active ON plant_species (is_active);
CREATE INDEX idx_plant_species_search_gin ON plant_species USING gin (to_tsvector('simple', common_name || ' ' || scientific_name));
```

> **Ghi chú tìm kiếm toàn văn:** Biểu thức `to_tsvector('simple', common_name || ' ' || scientific_name)` là hàm `IMMUTABLE` trong PostgreSQL, thống nhất với câu lệnh truy vấn tìm kiếm `WHERE to_tsvector('simple', common_name || ' ' || scientific_name) @@ plainto_tsquery('simple', :keyword)`.

---

### 3.5. Bảng `user_favorite_species` *(Bảng bổ sung nghiệp vụ Frontend)*

**Mô tả:** Lưu danh sách giống cây yêu thích của từng người dùng. Đồng bộ với state `favorites: string[]` trên React Native.

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
| `space_type` | VARCHAR(50) | NULL | 'BAN_CONG' | CHECK IN ('BAN_CONG','SAN_THUONG','TRONG_NHA','SAN_VUON','KHAC') | Loại không gian |
| `description` | TEXT | NULL | NULL | — | Mô tả khu vườn |
| `cover_image_url` | TEXT | NULL | NULL | — | Ảnh bìa khu vườn |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Ràng buộc bảo vệ dữ liệu:**
```sql
CONSTRAINT uq_gardens_id_owner UNIQUE (id, owner_id);
```
*(Cho phép các bảng con tham chiếu cặp `(garden_id, owner_id)` để đảm bảo quyền sở hữu)*

**Chỉ mục:**
```sql
CREATE INDEX idx_gardens_owner_id ON gardens (owner_id);
```

---

### 3.7. Bảng `user_plants`

**Mô tả:** Cây trồng cá nhân của người dùng trong 1 khu vườn. Khóa ngoại kép `(garden_id, owner_id)` đảm bảo cây chỉ có thể được đặt vào vườn mà người dùng đó sở hữu.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `owner_id` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | Chủ cây |
| `garden_id` | UUID | NOT NULL | — | Composite FK → gardens(id, owner_id) | Khu vườn chứa cây |
| `species_id` | UUID | NOT NULL | — | FK → plant_species.id ON DELETE RESTRICT | Giống cây |
| `display_name` | VARCHAR(200) | NOT NULL | — | NOT NULL | Tên hiển thị riêng của cây |
| `location` | VARCHAR(200) | NULL | NULL | — | Vị trí trong vườn (từ OwnedPlant.location) |
| `planted_at` | DATE | NULL | NULL | — | Ngày bắt đầu trồng / chăm sóc |
| `note` | TEXT | NULL | NULL | — | Ghi chú cá nhân |
| `health_status` | VARCHAR(50) | NOT NULL | 'UNKNOWN' | CHECK IN ('HEALTHY','NEEDS_ATTENTION','CRITICAL','UNKNOWN') | Tình trạng sức khỏe |
| `plant_code` | VARCHAR(50) | NULL | NULL | UNIQUE | Mã QR định danh (backlog) |
| `image_url` | TEXT | NULL | NULL | — | Ảnh chính của cây |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Ràng buộc bảo vệ dữ liệu:**
```sql
CONSTRAINT uq_user_plants_id_owner UNIQUE (id, owner_id);
CONSTRAINT fk_user_plants_garden_owner FOREIGN KEY (garden_id, owner_id) REFERENCES gardens(id, owner_id) ON DELETE CASCADE;
```

**Chỉ mục:**
```sql
CREATE INDEX idx_user_plants_owner_id ON user_plants (owner_id);
CREATE INDEX idx_user_plants_garden_id ON user_plants (garden_id);
CREATE INDEX idx_user_plants_species_id ON user_plants (species_id);
```

---

### 3.8. Bảng `care_schedules`

**Mô tả:** Quản lý định nghĩa và vòng đời lịch chăm sóc. Khóa ngoại kép `(user_plant_id, owner_id)` bảo đảm lịch luôn gắn đúng với cây thuộc quyền sở hữu của người dùng.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `user_plant_id` | UUID | NOT NULL | — | Composite FK → user_plants(id, owner_id) | Cây áp dụng lịch |
| `owner_id` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | Người tạo lịch |
| `task_type` | VARCHAR(100) | NOT NULL | — | CHECK IN ('WATERING','FERTILIZING','PRUNING','PEST_CHECK','MISTING','JOURNAL') | Loại công việc |
| `task_label` | VARCHAR(200) | NULL | NULL | — | Nhãn tùy chỉnh |
| `frequency` | VARCHAR(30) | NOT NULL | 'ONCE' | CHECK IN ('ONCE','DAILY','EVERY_OTHER_DAY','WEEKLY','CUSTOM') | Tần suất lặp lại |
| `interval_days` | INTEGER | NULL | NULL | CHECK chk_care_schedules_interval | Số ngày lặp (chỉ áp dụng khi CUSTOM) |
| `reminder_time` | TIME | NULL | NULL | — | Giờ nhắc nhở trong ngày |
| `start_date` | DATE | NOT NULL | CURRENT_DATE | NOT NULL | Ngày bắt đầu |
| `end_date` | DATE | NULL | NULL | — | Ngày kết thúc |
| `next_scheduled_at` | TIMESTAMPTZ | NOT NULL | — | NOT NULL | Thời điểm lần thực hiện kế tiếp |
| `status` | VARCHAR(20) | NOT NULL | 'ACTIVE' | CHECK IN ('ACTIVE','PAUSED','COMPLETED','CANCELLED') | Vòng đời lịch |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Ràng buộc bảo vệ dữ liệu:**
```sql
CONSTRAINT fk_care_schedules_plant_owner FOREIGN KEY (user_plant_id, owner_id) REFERENCES user_plants(id, owner_id) ON DELETE CASCADE;
CONSTRAINT chk_care_schedules_interval CHECK (
    (
        frequency = 'CUSTOM'
        AND interval_days IS NOT NULL
        AND interval_days > 0
    )
    OR
    (
        frequency <> 'CUSTOM'
        AND interval_days IS NULL
    )
);
```

**Quy chuẩn vòng đời lịch chăm sóc (`care_schedules`) và kết quả thực hiện (`care_logs`):**
1. `care_schedules` chỉ lưu trạng thái vòng đời của lịch:
   - `ACTIVE`: Lịch đang hoạt động bình thường, các lần đến hạn được xác định qua `next_scheduled_at`.
   - `PAUSED`: Người dùng tạm dừng nhắc nhở.
   - `COMPLETED`: Trạng thái kết thúc — áp dụng cho lịch một lần (`frequency = 'ONCE'`) sau khi đã hoàn thành hoặc kết thúc.
   - `CANCELLED`: Lịch đã bị hủy bỏ.
2. Trạng thái `SKIPPED` **không** thuộc vòng đời `care_schedules` mà thuộc về kết quả của từng lượt thực thi trong `care_logs`.
3. Khi người dùng thực hiện một lượt lịch:
   - Nếu bấm **Hoàn thành**: Hệ thống tạo bản ghi `care_logs` với `status = 'COMPLETED'`.
   - Nếu bấm **Bỏ qua**: Hệ thống tạo bản ghi `care_logs` với `status = 'SKIPPED'`.
   - Với lịch lặp (`DAILY`, `EVERY_OTHER_DAY`, `WEEKLY`, `CUSTOM`): Sau khi tạo `care_log`, hệ thống tự động cộng dồn thời gian để tính `next_scheduled_at` cho chu kỳ tiếp theo; trạng thái lịch vẫn duy trì là `ACTIVE`.
   - Với lịch một lần (`ONCE`): Sau khi tạo `care_log`, trạng thái lịch chuyển sang `COMPLETED` (kết thúc vòng đời).
4. Xác định **Quá hạn (OVERDUE)**: Không lưu vào cột CSDL mà tính toán động tại tầng API Service (`next_scheduled_at < NOW()` và `status = 'ACTIVE'`).

**Chỉ mục:**
```sql
CREATE INDEX idx_care_schedules_plant_id ON care_schedules (user_plant_id);
CREATE INDEX idx_care_schedules_owner_id ON care_schedules (owner_id);
CREATE INDEX idx_care_schedules_active ON care_schedules (next_scheduled_at) WHERE status = 'ACTIVE';
```

---

### 3.9. Bảng `care_logs`

**Mô tả:** Ghi nhận kết quả của từng lần thực hiện công việc chăm sóc cây (`COMPLETED` hoặc `SKIPPED`). Hỗ trợ cả công việc thực hiện theo lịch (`schedule_id` có giá trị) và công việc thủ công ad-hoc (`schedule_id = NULL`). Khóa ngoại kép `(user_plant_id, performed_by)` đảm bảo người thực hiện phải sở hữu cây được chăm sóc.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `user_plant_id` | UUID | NOT NULL | — | Composite FK → user_plants(id, owner_id) | Cây được chăm sóc |
| `performed_by` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | Người thực hiện |
| `schedule_id` | UUID | NULL | NULL | FK → care_schedules.id ON DELETE SET NULL | Lịch tương ứng (NULL = ad-hoc) |
| `task_type` | VARCHAR(100) | NOT NULL | — | NOT NULL | Loại công việc |
| `status` | VARCHAR(20) | NOT NULL | — | CHECK IN ('COMPLETED','SKIPPED') | Kết quả thực thi |
| `note` | TEXT | NULL | NULL | — | Ghi chú sau khi chăm sóc |
| `image_urls` | TEXT[] | NULL | NULL | — | Mảng URL ảnh minh chứng |
| `performed_at` | TIMESTAMPTZ | NOT NULL | NOW() | NOT NULL | Thời điểm thực hiện |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Ràng buộc bảo vệ dữ liệu:**
```sql
CONSTRAINT fk_care_logs_plant_performed_by FOREIGN KEY (user_plant_id, performed_by) REFERENCES user_plants(id, owner_id) ON DELETE CASCADE;
```

**Quy tắc kiểm soát quan hệ giữa Care Logs và Schedules:**
1. **Trường hợp `schedule_id = NULL`:** Đại diện cho lượt chăm sóc thủ công ad-hoc (ngoài lịch). Người dùng có thể ghi nhận hoạt động chăm sóc cây bất cứ lúc nào mà không cần thiết lập lịch trước.
2. **Trường hợp `schedule_id != NULL`:** Lịch được tham chiếu bắt buộc phải thuộc cùng cây trồng (`user_plant_id`) và cùng chủ sở hữu. Quy tắc kiểm tra chéo này được xác thực chặt chẽ tại tầng Service (Spring Boot) trong Giai đoạn 4 trước khi lưu bản ghi.
3. **Bảo toàn lịch sử chăm sóc:** Khóa ngoại `schedule_id` thiết lập `ON DELETE SET NULL`. Khi người dùng xóa một lịch chăm sóc định kỳ, các nhật ký `care_logs` trước đó vẫn được bảo toàn nguyên vẹn với `schedule_id = NULL` để phục vụ theo dõi lịch sử sinh trưởng của cây.

**Chỉ mục:**
```sql
CREATE INDEX idx_care_logs_plant_id ON care_logs (user_plant_id);
CREATE INDEX idx_care_logs_schedule_id ON care_logs (schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX idx_care_logs_performed_by ON care_logs (performed_by);
CREATE INDEX idx_care_logs_performed_at ON care_logs (performed_at DESC);
```

---

### 3.10. Bảng `growth_journals`

**Mô tả:** Nhật ký phát triển — ghi nhận tình trạng cây theo thời gian, hỗ trợ mảng URL hình ảnh. Khóa ngoại kép `(user_plant_id, author_id)` đảm bảo người viết nhật ký phải sở hữu cây được ghi nhận.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `user_plant_id` | UUID | NOT NULL | — | Composite FK → user_plants(id, owner_id) | Cây được ghi nhận |
| `author_id` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | Người viết nhật ký |
| `entry_type` | VARCHAR(50) | NOT NULL | 'GROWTH' | CHECK IN ('GROWTH','WATERING','FERTILIZING','PEST','OTHER') | Loại ghi nhận |
| `health_status` | VARCHAR(50) | NOT NULL | 'HEALTHY' | CHECK IN ('HEALTHY','NEEDS_ATTENTION','CRITICAL') | Tình trạng cây |
| `note` | TEXT | NOT NULL | — | NOT NULL | Nội dung ghi nhận |
| `image_urls` | TEXT[] | NULL | NULL | — | Mảng URL ảnh minh họa |
| `recorded_at` | TIMESTAMPTZ | NOT NULL | NOW() | NOT NULL | Thời điểm ghi nhận |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Ràng buộc bảo vệ dữ liệu:**
```sql
CONSTRAINT fk_growth_journals_plant_author FOREIGN KEY (user_plant_id, author_id) REFERENCES user_plants(id, owner_id) ON DELETE CASCADE;
```

**Chỉ mục:**
```sql
CREATE INDEX idx_growth_journals_plant_id ON growth_journals (user_plant_id);
CREATE INDEX idx_growth_journals_recorded_at ON growth_journals (recorded_at DESC);
```

---

### 3.11. Bảng `cameras` *(Backlog)*

**Mô tả:** Thông tin camera giám sát trong khu vườn. Giai đoạn 3 chỉ lưu metadata; không thiết kế streaming. Khóa ngoại kép `(garden_id, owner_id)` bảo đảm camera chỉ thuộc về vườn của chủ sở hữu.

| Cột | Kiểu dữ liệu | Nullable | Mặc định | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `id` | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY | |
| `garden_id` | UUID | NOT NULL | — | Composite FK → gardens(id, owner_id) | Khu vườn gắn camera |
| `owner_id` | UUID | NOT NULL | — | FK → users.id ON DELETE CASCADE | |
| `name` | VARCHAR(200) | NOT NULL | — | NOT NULL | Tên định danh camera |
| `location_desc` | TEXT | NULL | NULL | — | Mô tả vị trí đặt camera |
| `status` | VARCHAR(20) | NOT NULL | 'OFFLINE' | CHECK IN ('ONLINE','OFFLINE','ERROR') | Trạng thái kết nối |
| `connection_note` | TEXT | NULL | NULL | — | Ghi chú kết nối (KHÔNG lưu credentials) |
| `created_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | NOW() | — | |

**Ràng buộc bảo vệ dữ liệu:**
```sql
CONSTRAINT fk_cameras_garden_owner FOREIGN KEY (garden_id, owner_id) REFERENCES gardens(id, owner_id) ON DELETE CASCADE;
```

**Chỉ mục:**
```sql
CREATE INDEX idx_cameras_garden_id ON cameras (garden_id);
```

---

## 4. Sơ đồ quan hệ (tóm tắt)

```
users (1) ──────────────── (n) user_roles (n) ──── (1) roles
users (1) ──────────────── (n) gardens
users (1) ──────────────── (n) user_plants
users (1) ──────────────── (n) user_favorite_species (n) ── (1) plant_species
gardens (1) ────────────── (n) user_plants (cùng owner_id)
gardens (1) ────────────── (n) cameras [Backlog] (cùng owner_id)
plant_species (1) ───────── (n) user_plants
user_plants (1) ─────────── (n) care_schedules (cùng owner_id)
user_plants (1) ─────────── (n) care_logs (cùng owner_id)
user_plants (1) ─────────── (n) growth_journals (cùng owner_id)
care_schedules (1) ──────── (n) care_logs (ON DELETE SET NULL)
```

*(Xem chi tiết trong `docs/database/erd.mmd`)*

---

## 5. Chính sách toàn vẹn & xóa cascade

| Bảng cha | Bảng con | Khóa ngoại | Hành động khi xóa cha | Mục đích nghiệp vụ |
|---|---|---|---|---|
| `users` | `user_roles`, `gardens`, `user_plants`, `care_schedules`, `care_logs`, `growth_journals`, `cameras`, `user_favorite_species` | `user_id` / `owner_id` / `performed_by` / `author_id` | **CASCADE** | Xóa sạch toàn bộ dữ liệu thuộc sở hữu khi tài khoản bị xóa vĩnh viễn |
| `gardens` | `user_plants`, `cameras` | Composite `(garden_id, owner_id)` | **CASCADE** | Khi xóa vườn, tất cả cây trồng và camera trong vườn bị xóa theo; ngăn tham chiếu chéo chủ sở hữu |
| `user_plants` | `care_schedules` | Composite `(user_plant_id, owner_id)` | **CASCADE** | Lịch chăm sóc tự động xóa khi cây bị xóa; bảo đảm đúng chủ sở hữu |
| `user_plants` | `care_logs` | Composite `(user_plant_id, performed_by)` | **CASCADE** | Nhật ký chăm sóc tự động xóa khi cây bị xóa; bảo đảm người thực hiện sở hữu cây |
| `user_plants` | `growth_journals` | Composite `(user_plant_id, author_id)` | **CASCADE** | Nhật ký phát triển tự động xóa khi cây bị xóa; bảo đảm tác giả sở hữu cây |
| `care_schedules` | `care_logs` | `schedule_id` | **SET NULL** | Khi một lịch chăm sóc định kỳ bị xóa, các lượt ghi nhận chăm sóc quá khứ vẫn được giữ lại làm lịch sử |
| `plant_species` | `user_plants` | `species_id` | **RESTRICT** | Ngăn chặn xóa một giống cây chuẩn nếu đang có cây trồng cá nhân liên kết tới |
| `plant_species` | `user_favorite_species` | `species_id` | **CASCADE** | Khi giống cây bị xóa, danh sách yêu thích liên quan tự động được giải phóng |
| `roles` | `user_roles` | `role_id` | **CASCADE** | Giải phóng bảng trung gian khi cập nhật vai trò |

---

*Tài liệu này là đặc tả dữ liệu Giai đoạn 3.1 — chỉ dùng cho thiết kế, chưa triển khai trên database thật.*
