# Ma Trận Truy Vết Yêu Cầu — GoPlant

> **Giai đoạn:** 3.1 — Đồng bộ thiết kế dữ liệu, ERD và Hợp đồng REST API  
> **Nhánh:** `feature/integrate-frontend-report`  
> **Ngày cập nhật:** 2026-11-08  
> **Quy chuẩn endpoint:** 44 endpoints (40 MVP + 4 Backlog Cameras)

---

## 1. Tổng quan nghiệp vụ

GoPlant là hệ thống quản lý và chăm sóc cây trồng, phục vụ hai nhóm người dùng:

| Vai trò | Mô tả |
|---|---|
| **ROLE_USER** | Người dùng thông thường: quản lý vườn, cây, lịch chăm sóc, nhật ký, danh mục yêu thích |
| **ROLE_ADMIN** | Quản trị viên: quản lý danh mục giống cây chuẩn và tài khoản người dùng |

---

## 2. Ma trận truy vết

### UC01 — Đăng ký và Đăng nhập (JWT)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| `RegisterScreen` | Điền họ tên, email/SĐT, email khôi phục, mật khẩu và xác nhận | `POST /api/v1/auth/register` | `users`, `roles`, `user_roles` | Public | **MVP (Thuộc 44 APIs)** |
| `LoginScreen` | Nhập email/SĐT + mật khẩu → nhận JWT | `POST /api/v1/auth/login` | `users`, `user_roles` | Public | **MVP (Thuộc 44 APIs)** |
| `LoginScreen` | Nhấn "Quên mật khẩu?" | `POST /api/v1/auth/forgot-password` | `users` | Public | *Backlog mở rộng (ngoài 44 APIs)* |
| Toàn bộ app | Làm mới JWT trước khi hết hạn | `POST /api/v1/auth/refresh` | `users` | Authenticated | *Backlog mở rộng (ngoài 44 APIs)* |
| `LoginScreen` | "Đăng nhập bằng Google / Zalo" | — (OAuth2 scope) | `users` | Public | *Backlog mở rộng (ngoài 44 APIs)* |

**Bảng dữ liệu:** `users`, `roles` (2 hàng cố định: ROLE_USER, ROLE_ADMIN), `user_roles` (many-to-many)

**Trường quan trọng từ RegisterScreen:**
- `full_name` (từ trường "Họ và tên")
- `account` (email hoặc SĐT — ánh xạ thành `email` hoặc `phone_number`)
- `recovery_email` (tùy chọn)
- `password` (BCrypt hash)
- `device_type`: `MOBILE` | `PC` (tùy chọn — lưu vào `users.preferred_device`)

---

### UC02 — Tra cứu danh mục giống cây và Danh sách yêu thích

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| `HomeScreen` / `ExploreScreen` | Xem danh sách giống cây có phân trang & tìm kiếm | `GET /api/v1/species` | `plant_species` | Authenticated | **MVP (Thuộc 44 APIs)** |
| `ExploreScreen` | Tra cứu chi tiết thông tin sinh học của 1 giống cây | `GET /api/v1/species/{speciesId}` | `plant_species` | Authenticated | **MVP (Thuộc 44 APIs)** |
| `ExploreScreen` | Nhấn tim "Yêu thích giống cây" | `POST /api/v1/species/{speciesId}/favorite` | `user_favorite_species` | Authenticated (ROLE_USER) | **MVP (Thuộc 44 APIs)** |
| `ExploreScreen` | Bỏ đánh dấu yêu thích | `DELETE /api/v1/species/{speciesId}/favorite` | `user_favorite_species` | Authenticated (ROLE_USER) | **MVP (Thuộc 44 APIs)** |
| `ExploreScreen` | Xem danh sách giống cây yêu thích của tôi | `GET /api/v1/species/favorites` | `user_favorite_species`, `plant_species` | Authenticated (ROLE_USER) | **MVP (Thuộc 44 APIs)** |

**Nguồn gốc yêu cầu:**  
- `PlantDataStore.tsx` → `plantCatalog` tĩnh → thay thế bằng API `/species`  
- `favorites: string[]` trong React Context → lưu trữ bền vững tại bảng `user_favorite_species`  
- `PlantProfile` TypeScript interface → ánh xạ vào 25 cột của `plant_species`  
- Index tìm kiếm GIN toàn văn: `idx_plant_species_search_gin` tối ưu truy vấn keyword trên tên thông thường và tên khoa học.

---

### UC03 — Quản lý khu vườn

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| `HomeScreen` | Xem danh sách vườn của tôi | `GET /api/v1/gardens` | `gardens` | ROLE_USER | **MVP (Thuộc 44 APIs)** |
| `CreateGardenScreen` | Tạo vườn mới (tên, vị trí, loại không gian, ảnh bìa, mô tả) | `POST /api/v1/gardens` | `gardens` | ROLE_USER | **MVP (Thuộc 44 APIs)** |
| `GardenDetailScreen` | Xem chi tiết 1 vườn kèm tóm tắt danh sách cây | `GET /api/v1/gardens/{gardenId}` | `gardens`, `user_plants` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `GardenDetailScreen` | Chỉnh sửa vườn | `PUT /api/v1/gardens/{gardenId}` | `gardens` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `GardenDetailScreen` | Xóa vườn | `DELETE /api/v1/gardens/{gardenId}` | `gardens`, `user_plants` (cascade) | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |

**Ràng buộc bảo vệ dữ liệu:**  
- Bảng `gardens` sở hữu ràng buộc `UNIQUE (id, owner_id)`.  
- Các bảng con (`user_plants`, `cameras`) tham chiếu khóa ngoại kép `(garden_id, owner_id)` để đảm bảo tính cô lập dữ liệu theo từng người dùng.

---

### UC04 — Quản lý cây trồng cá nhân

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| `PlantsScreen` | Xem danh sách tất cả cây đang trồng (phân trang, lọc) | `GET /api/v1/plants` | `user_plants`, `plant_species` | ROLE_USER | **MVP (Thuộc 44 APIs)** |
| `AddGardenPlantScreen` | Thêm cây vào vườn (chọn giống, đặt tên, vị trí, ngày trồng) | `POST /api/v1/gardens/{gardenId}/plants` | `user_plants`, `gardens` | ROLE_USER (owner vườn) | **MVP (Thuộc 44 APIs)** |
| `PlantDetailScreen` | Xem chi tiết hồ sơ 1 cây trồng | `GET /api/v1/plants/{plantId}` | `user_plants`, `plant_species` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `GardenForm` (editing) | Cập nhật hồ sơ cây | `PUT /api/v1/plants/{plantId}` | `user_plants` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `PlantDetailScreen` | Xóa cây khỏi vườn | `DELETE /api/v1/plants/{plantId}` | `user_plants`, `care_schedules`, `care_logs` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `ScheduleDetailScreen` | Xem danh sách lịch chăm sóc của cây | `GET /api/v1/plants/{plantId}/schedules` | `care_schedules` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `PlantDetailScreen` | Xem lịch sử các lượt chăm sóc của cây | `GET /api/v1/plants/{plantId}/care-logs` | `care_logs` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `JournalDetailScreen` | Xem danh sách nhật ký phát triển của cây | `GET /api/v1/plants/{plantId}/journals` | `growth_journals` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| — | Tạo mã QR định danh cây | `GET /api/v1/plants/{plantId}/qr` | `user_plants` | ROLE_USER (owner) | *Backlog mở rộng (ngoài 44 APIs)* |

---

### UC05 — Lập lịch và vận hành chu kỳ chăm sóc

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| `CreateScheduleScreen` | Tạo lịch chăm sóc mới cho cây | `POST /api/v1/schedules` | `care_schedules`, `user_plants` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `HomeScreen` | Xem danh sách việc cần chăm sóc hôm nay (tất cả cây) | `GET /api/v1/schedules/today` | `care_schedules`, `user_plants` | ROLE_USER | **MVP (Thuộc 44 APIs)** |
| `ScheduleDetailScreen` | Cập nhật thông tin / chu kỳ lịch | `PUT /api/v1/schedules/{scheduleId}` | `care_schedules` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `ScheduleDetailScreen` | Xóa lịch chăm sóc | `DELETE /api/v1/schedules/{scheduleId}` | `care_schedules` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `ScheduleDetailScreen` | Đánh dấu "Hoàn thành" 1 lượt chăm sóc | `POST /api/v1/schedules/{scheduleId}/complete` | `care_schedules`, `care_logs` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `ScheduleDetailScreen` | Đánh dấu "Bỏ qua" 1 lượt chăm sóc | `POST /api/v1/schedules/{scheduleId}/skip` | `care_schedules`, `care_logs` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |

**Quy tắc vận hành vòng đời lịch và kết quả thực thi:**
- `care_schedules.status`: Chỉ gồm `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED` (mặc định: `ACTIVE`).
- `care_logs.status`: Ghi nhận kết quả của từng lượt thực hiện: `COMPLETED` hoặc `SKIPPED`.
- Với lịch lặp (`DAILY`, `EVERY_OTHER_DAY`, `WEEKLY`, `CUSTOM`): Khi bấm "Hoàn thành" hoặc "Bỏ qua", hệ thống lưu `care_log` tương ứng, tính toán `next_scheduled_at` cho chu kỳ tiếp theo, và giữ `care_schedules.status = 'ACTIVE'`.
- Với lịch một lần (`ONCE`): Khi bấm "Hoàn thành" hoặc "Bỏ qua", hệ thống lưu `care_log` và cập nhật `care_schedules.status = 'COMPLETED'` (kết thúc vòng đời lịch).
- Quá hạn (OVERDUE): Được tính toán động tại tầng API khi `next_scheduled_at < NOW()` và `status = 'ACTIVE'`.

---

### UC06 — Ghi nhận nhật ký chăm sóc ad-hoc

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| — | Ghi nhận chăm sóc thủ công (không cần theo lịch trước) | `POST /api/v1/care-logs` | `care_logs`, `user_plants` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |

> Ghi chú liên kết: Việc tra cứu lịch sử chăm sóc theo từng cây được định tuyến qua endpoint `GET /api/v1/plants/{plantId}/care-logs` thuộc nhóm quản lý cây trồng (UC04).

---

### UC07 — Nhật ký phát triển (Growth Journals)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| `NewJournalScreen` | Thêm ghi nhận nhật ký phát triển mới (ảnh, ghi chú, tình trạng) | `POST /api/v1/journals` | `growth_journals`, `user_plants` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `EditJournalScreen` | Cập nhật nội dung ghi nhận nhật ký | `PUT /api/v1/journals/{journalId}` | `growth_journals` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |
| `JournalDetailScreen` | Xóa 1 ghi nhận nhật ký | `DELETE /api/v1/journals/{journalId}` | `growth_journals` | ROLE_USER (owner) | **MVP (Thuộc 44 APIs)** |

---

### UC08 — Quản trị danh mục giống cây (Admin Species)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| Admin Panel | Xem toàn bộ danh mục giống cây (kể cả giống đang ẩn) | `GET /api/v1/admin/species` | `plant_species` | ROLE_ADMIN | **MVP (Thuộc 44 APIs)** |
| Admin Panel | Thêm giống cây chuẩn mới | `POST /api/v1/admin/species` | `plant_species` | ROLE_ADMIN | **MVP (Thuộc 44 APIs)** |
| Admin Panel | Cập nhật thông tin giống cây chuẩn | `PUT /api/v1/admin/species/{speciesId}` | `plant_species` | ROLE_ADMIN | **MVP (Thuộc 44 APIs)** |
| Admin Panel | Xóa giống cây chuẩn (chặn nếu đang có cây trồng sử dụng) | `DELETE /api/v1/admin/species/{speciesId}` | `plant_species` (RESTRICT) | ROLE_ADMIN | **MVP (Thuộc 44 APIs)** |

---

### UC09 — Quản trị tài khoản người dùng (Admin Users)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| Admin Panel | Xem danh sách tài khoản người dùng (phân trang, lọc status) | `GET /api/v1/admin/users` | `users`, `user_roles` | ROLE_ADMIN | **MVP (Thuộc 44 APIs)** |
| Admin Panel | Xem hồ sơ chi tiết một người dùng | `GET /api/v1/admin/users/{userId}` | `users`, `user_roles` | ROLE_ADMIN | **MVP (Thuộc 44 APIs)** |
| Admin Panel | Cập nhật trạng thái tài khoản (Kích hoạt / Khóa / Mở khóa) | `PATCH /api/v1/admin/users/{userId}/status` | `users` | ROLE_ADMIN | **MVP (Thuộc 44 APIs)** |

---

### UC10 — Hồ sơ và bảo mật tài khoản cá nhân (Users Profile)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| Profile / Settings | Xem thông tin hồ sơ của tài khoản hiện tại | `GET /api/v1/users/me` | `users`, `user_roles` | Authenticated | **MVP (Thuộc 44 APIs)** |
| Profile / Settings | Cập nhật thông tin cá nhân | `PUT /api/v1/users/me` | `users` | Authenticated | **MVP (Thuộc 44 APIs)** |
| Profile / Settings | Đổi mật khẩu tài khoản | `PUT /api/v1/users/me/password` | `users` | Authenticated | **MVP (Thuộc 44 APIs)** |

---

### UC11 — Thiết bị giám sát Camera (Backlog)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | Phân loại |
|---|---|---|---|---|---|
| `MonitoringDetailScreen` | Xem danh sách camera trong một khu vườn | `GET /api/v1/gardens/{gardenId}/cameras` | `cameras` | ROLE_USER (owner) | **Backlog (Thuộc 44 APIs)** |
| `MonitoringDetailScreen` | Thêm metadata camera vào khu vườn | `POST /api/v1/gardens/{gardenId}/cameras` | `cameras`, `gardens` | ROLE_USER (owner) | **Backlog (Thuộc 44 APIs)** |
| `MonitoringDetailScreen` | Cập nhật thông tin camera | `PUT /api/v1/cameras/{cameraId}` | `cameras` | ROLE_USER (owner) | **Backlog (Thuộc 44 APIs)** |
| `MonitoringDetailScreen` | Xóa camera | `DELETE /api/v1/cameras/{cameraId}` | `cameras` | ROLE_USER (owner) | **Backlog (Thuộc 44 APIs)** |

---

## 3. Tổng hợp và phân bổ 44 Endpoints chuẩn

Bảng tổng hợp đối chiếu số lượng chuẩn hóa:

| STT | Phân nhóm chức năng | Số endpoint MVP | Số endpoint Backlog | Tổng số endpoint |
|:---:|---|:---:|:---:|:---:|
| 1 | Authentication | 2 | 0 | 2 |
| 2 | Users Profile | 3 | 0 | 3 |
| 3 | Species & Favorites | 5 | 0 | 5 |
| 4 | Gardens | 5 | 0 | 5 |
| 5 | Plants | 8 | 0 | 8 |
| 6 | Schedules | 6 | 0 | 6 |
| 7 | Care Logs | 1 | 0 | 1 |
| 8 | Growth Journals | 3 | 0 | 3 |
| 9 | Admin Species | 4 | 0 | 4 |
| 10 | Admin Users | 3 | 0 | 3 |
| 11 | Cameras (Backlog) | 0 | 4 | 4 |
| | **TỔNG CỘNG** | **40** | **4** | **44** |

> **Quy chuẩn phạm vi:**
> - Hệ thống GoPlant chuẩn hóa chính xác **44 RESTful APIs** (40 endpoints thuộc phạm vi cốt lõi MVP, 4 endpoints thuộc phạm vi Backlog Cameras).
> - Mọi tính năng mở rộng khác như Quên mật khẩu qua email (`/auth/forgot-password`), Cấp mới token (`/auth/refresh`), Đăng nhập mạng xã hội (Google/Zalo) và Quét mã QR (`/plants/{id}/qr`) được xác định là **Backlog mở rộng**, không nằm trong 44 endpoints chuẩn của giai đoạn hiện tại.

---

## 4. Ánh xạ PlantProfile → plant_species

| Thuộc tính TypeScript (Frontend) | Cột CSDL PostgreSQL | Kiểu dữ liệu | Ràng buộc / Index |
|---|---|---|---|
| `id` (catalog slug) | `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `name` | `common_name` | VARCHAR(200) | NOT NULL, Full-text Search GIN |
| `scientificName` | `scientific_name` | VARCHAR(200) | NOT NULL, Full-text Search GIN |
| `category` | `category` | VARCHAR(100) | NOT NULL, B-tree Index |
| `difficulty` | `difficulty` | VARCHAR(50) | NULL |
| `light` | `light_requirement` | TEXT | NULL |
| `water` | `water_requirement` | TEXT | NULL |
| `environment` | `environment` | TEXT | NULL |
| `space` | `space_requirement` | TEXT | NULL |
| `matureSize` | `mature_size` | VARCHAR(100) | NULL |
| `temperature` | `temperature_range` | VARCHAR(100) | NULL |
| `humidity` | `humidity_range` | VARCHAR(100) | NULL |
| `medium` | `growing_medium` | TEXT | NULL |
| `drainage` | `drainage` | VARCHAR(100) | NULL |
| `soilPh` | `soil_ph` | VARCHAR(50) | NULL |
| `sunTolerance` | `sun_tolerance` | VARCHAR(100) | NULL |
| `origin` | `origin` | TEXT | NULL |
| `overview` | `overview` | TEXT | NULL |
| `morphology` | `morphology` | TEXT | NULL |
| `lifespan` | `lifespan` | VARCHAR(100) | NULL |
| `floweringSeason` | `flowering_season` | VARCHAR(100) | NULL |
| `usageAndCaution` | `usage_and_caution` | TEXT | NULL |
| `growthRate` | `growth_rate` | VARCHAR(100) | NULL |
| `wateringFrequency` | `watering_frequency` | VARCHAR(100) | NULL |
| `nutrition` | `nutrition` | TEXT | NULL |

---

*Tài liệu này là ma trận truy vết chính thức của Giai đoạn 3.1.*
