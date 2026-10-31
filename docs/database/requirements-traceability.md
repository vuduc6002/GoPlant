# Ma Trận Truy Vết Yêu Cầu — GoPlant

> **Giai đoạn:** 3 — Thiết kế dữ liệu và hợp đồng API  
> **Nhánh:** `feature/integrate-frontend-report`  
> **Ngày cập nhật:** 2026-10-31

---

## 1. Tổng quan nghiệp vụ

GoPlant là hệ thống quản lý và chăm sóc cây trồng, phục vụ hai nhóm người dùng:

| Vai trò | Mô tả |
|---|---|
| **ROLE_USER** | Người dùng thông thường: quản lý vườn, cây, lịch chăm sóc, nhật ký, yêu thích |
| **ROLE_ADMIN** | Quản trị viên: quản lý danh mục giống cây chuẩn và tài khoản người dùng |

---

## 2. Ma trận truy vết

### UC01 — Đăng ký và Đăng nhập (JWT)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| `RegisterScreen` | Điền họ tên, email/SĐT, email khôi phục, mật khẩu và xác nhận | `POST /api/v1/auth/register` | `users`, `roles`, `user_roles` | Public | **MVP** |
| `LoginScreen` | Nhập email/SĐT + mật khẩu → nhận JWT | `POST /api/v1/auth/login` | `users`, `user_roles` | Public | **MVP** |
| `LoginScreen` | Nhấn "Quên mật khẩu?" | `POST /api/v1/auth/forgot-password` | `users` | Public | Backlog |
| Toàn bộ app | Làm mới JWT trước khi hết hạn | `POST /api/v1/auth/refresh` | `users` | Authenticated | Backlog |
| `LoginScreen` | "Đăng nhập bằng Google / Zalo" | — (OAuth2 scope) | `users` | Public | Backlog |

**Bảng dữ liệu:** `users`, `roles` (2 hàng cố định: USER, ADMIN), `user_roles` (many-to-many)

**Trường quan trọng từ RegisterScreen:**
- `full_name` (từ trường "Họ và tên")
- `account` (email hoặc SĐT — ánh xạ thành `email` hoặc `phone_number`)
- `recovery_email` (tùy chọn)
- `password` (BCrypt)
- `device_type`: `MOBILE` | `PC` (tùy chọn — lưu vào `users.preferred_device`)

---

### UC02 — Tìm kiếm và khám phá danh mục cây

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| `HomeScreen` / `ExploreScreen` | Xem danh sách giống cây có phân trang | `GET /api/v1/species?page=0&size=20&sort=name` | `plant_species` | Authenticated | **MVP** |
| `ExploreScreen` | Tìm theo tên / tên khoa học / danh mục | `GET /api/v1/species?keyword=xxx&category=yyy` | `plant_species` | Authenticated | **MVP** |
| `PlantDetailScreen` | Xem chi tiết thông tin sinh học của 1 giống | `GET /api/v1/species/{speciesId}` | `plant_species` | Authenticated | **MVP** |
| `ExploreScreen` | Nhấn tim "Yêu thích giống cây" | `POST /api/v1/species/{speciesId}/favorite` | `user_favorite_species` | Authenticated (ROLE_USER) | **MVP** |
| `ExploreScreen` | Bỏ yêu thích | `DELETE /api/v1/species/{speciesId}/favorite` | `user_favorite_species` | Authenticated (ROLE_USER) | **MVP** |
| `ExploreScreen` | Xem danh sách giống yêu thích | `GET /api/v1/species/favorites` | `user_favorite_species`, `plant_species` | Authenticated (ROLE_USER) | **MVP** |

**Nguồn gốc yêu cầu:**  
- `PlantDataStore.tsx` → `plantCatalog` tĩnh → cần API thay thế  
- `favorites: string[]` trong context → cần bảng `user_favorite_species`  
- `PlantProfile` interface → ánh xạ vào các cột của `plant_species`

---

### UC03 — Quản lý khu vườn

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| `HomeScreen` | Xem danh sách vườn của tôi | `GET /api/v1/gardens` | `gardens` | ROLE_USER (chỉ vườn của mình) | **MVP** |
| `CreateGardenScreen` | Tạo vườn mới (tên, vị trí, loại không gian, ảnh bìa, mô tả) | `POST /api/v1/gardens` | `gardens` | ROLE_USER | **MVP** |
| `GardenDetailScreen` | Xem chi tiết 1 vườn + danh sách cây | `GET /api/v1/gardens/{gardenId}` | `gardens`, `user_plants` | ROLE_USER (owner) | **MVP** |
| `GardenDetailScreen` | Chỉnh sửa vườn | `PUT /api/v1/gardens/{gardenId}` | `gardens` | ROLE_USER (owner) | **MVP** |
| `GardenDetailScreen` | Xóa vườn | `DELETE /api/v1/gardens/{gardenId}` | `gardens`, `user_plants` (cascade) | ROLE_USER (owner) | **MVP** |

**Trường quan trọng từ GardenScreens.tsx:**  
- `name` (bắt buộc), `location` (bắt buộc), `space_type` ("Ban công", "Sân thượng", "Trong nhà"), `description` (tùy chọn), `cover_image_url` (tùy chọn)

---

### UC04 — Quản lý cây trồng cá nhân

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| `PlantsScreen` | Xem danh sách cây đang trồng | `GET /api/v1/plants?page=0&size=20` | `user_plants`, `plant_species` | ROLE_USER (chỉ cây của mình) | **MVP** |
| `AddGardenPlantScreen` | Thêm cây vào vườn (chọn giống, đặt tên, vị trí, ngày trồng, ghi chú) | `POST /api/v1/gardens/{gardenId}/plants` | `user_plants` | ROLE_USER (owner của vườn) | **MVP** |
| `GardenForm` (editing) | Chỉnh sửa hồ sơ cây | `PUT /api/v1/plants/{plantId}` | `user_plants` | ROLE_USER (owner) | **MVP** |
| `PlantDetailScreen` | Xem chi tiết 1 cây: thông tin + lịch + nhật ký | `GET /api/v1/plants/{plantId}` | `user_plants`, `plant_species` | ROLE_USER (owner) | **MVP** |
| — | Xóa cây | `DELETE /api/v1/plants/{plantId}` | `user_plants`, `care_schedules`, `care_logs`, `growth_journals` (cascade) | ROLE_USER (owner) | **MVP** |
| — | Tìm kiếm cây của tôi | `GET /api/v1/plants?keyword=xxx&gardenId=yyy` | `user_plants` | ROLE_USER | **MVP** |
| — | Mã QR định danh cây | `GET /api/v1/plants/{plantId}/qr` | `user_plants` | ROLE_USER (owner) | Backlog |

**Trường quan trọng từ OwnedPlant interface và GardenForm:**  
- `catalogId` → `species_id` (FK)  
- `name` (tên hiển thị), `location` (vị trí), `plantedAt` → `planted_at`, `note`

---

### UC05 — Lập lịch chăm sóc

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| `ScheduleDetailScreen` | Xem lịch của 1 cây | `GET /api/v1/plants/{plantId}/schedules` | `care_schedules` | ROLE_USER (owner) | **MVP** |
| `CreateScheduleScreen` | Tạo lịch chăm sóc (chọn cây, loại việc, thời gian, chu kỳ lặp) | `POST /api/v1/schedules` | `care_schedules` | ROLE_USER (owner) | **MVP** |
| `ScheduleDetailScreen` | Chỉnh sửa lịch | `PUT /api/v1/schedules/{scheduleId}` | `care_schedules` | ROLE_USER (owner) | **MVP** |
| `ScheduleDetailScreen` | Xóa lịch | `DELETE /api/v1/schedules/{scheduleId}` | `care_schedules` | ROLE_USER (owner) | **MVP** |
| `HomeScreen` | Xem lịch hôm nay (tất cả cây) | `GET /api/v1/schedules/today` | `care_schedules`, `user_plants` | ROLE_USER | **MVP** |

**Trường quan trọng từ CreateScheduleScreen:**  
- `plant` → `user_plant_id` (FK)  
- `task` → `task_type` ("Tưới nước", "Bón phân", "Cắt tỉa", "Kiểm tra sâu bệnh", "Phun sương", "Ghi nhận phát triển")  
- `repeat` → `frequency`: DAILY | EVERY_OTHER_DAY | WEEKLY | CUSTOM  
- `start_date`, `reminder_time`

---

### UC06 — Ghi nhận hoàn thành chăm sóc

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| `ScheduleDetailScreen` | Đánh dấu "Hoàn thành" 1 công việc | `POST /api/v1/schedules/{scheduleId}/complete` | `care_logs`, `care_schedules` | ROLE_USER (owner) | **MVP** |
| `ScheduleDetailScreen` | Đánh dấu "Bỏ qua" 1 công việc | `POST /api/v1/schedules/{scheduleId}/skip` | `care_logs`, `care_schedules` | ROLE_USER (owner) | **MVP** |
| — | Xem lịch sử chăm sóc của 1 cây | `GET /api/v1/plants/{plantId}/care-logs?page=0&size=20` | `care_logs` | ROLE_USER (owner) | **MVP** |
| — | Ghi nhật ký chăm sóc thủ công (không cần lịch trước) | `POST /api/v1/care-logs` | `care_logs` | ROLE_USER (owner) | **MVP** |

**Lưu ý nghiệp vụ:**  
- Khi "Hoàn thành": tạo `care_log` với `status = COMPLETED`, cập nhật `care_schedule.status` và tính `next_scheduled_at` theo `frequency`  
- Khi "Bỏ qua": tạo `care_log` với `status = SKIPPED`  
- OVERDUE tính động: `scheduled_at < NOW()` và `status = PENDING`

---

### UC07 — Nhật ký phát triển

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| `JournalDetailScreen` | Xem nhật ký của 1 cây | `GET /api/v1/plants/{plantId}/journals?page=0&size=10` | `growth_journals` | ROLE_USER (owner) | **MVP** |
| `NewJournalScreen` | Thêm ghi nhận mới (loại, tình trạng, ảnh, ghi chú, ngày) | `POST /api/v1/journals` | `growth_journals` | ROLE_USER (owner) | **MVP** |
| `EditJournalScreen` | Chỉnh sửa ghi nhận | `PUT /api/v1/journals/{journalId}` | `growth_journals` | ROLE_USER (owner) | **MVP** |
| `JournalDetailScreen` | Xóa 1 ghi nhận | `DELETE /api/v1/journals/{journalId}` | `growth_journals` | ROLE_USER (owner) | **MVP** |

**Trường quan trọng từ JournalScreens.tsx:**  
- `plant` → `user_plant_id` (FK)  
- `note` (bắt buộc), `type` ("Phát triển", "Tưới nước", "Bón phân", "Sâu bệnh")  
- `health_status` ("Khỏe mạnh", "Cần theo dõi", "Cần can thiệp")  
- `image_urls` (mảng text — đường dẫn object storage, tùy chọn)  
- `recorded_at` (ngày ghi nhận)

---

### UC08 — Quản trị giống cây (Admin)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| Admin Panel | Xem danh sách giống cây | `GET /api/v1/admin/species` | `plant_species` | ROLE_ADMIN | **MVP** |
| Admin Panel | Thêm giống cây mới | `POST /api/v1/admin/species` | `plant_species` | ROLE_ADMIN | **MVP** |
| Admin Panel | Chỉnh sửa giống cây | `PUT /api/v1/admin/species/{speciesId}` | `plant_species` | ROLE_ADMIN | **MVP** |
| Admin Panel | Xóa giống cây | `DELETE /api/v1/admin/species/{speciesId}` | `plant_species` | ROLE_ADMIN | **MVP** |

---

### UC09 — Quản trị người dùng (Admin)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| Admin Panel | Xem danh sách tài khoản | `GET /api/v1/admin/users?page=0&size=20` | `users`, `user_roles` | ROLE_ADMIN | **MVP** |
| Admin Panel | Kích hoạt / khóa tài khoản | `PATCH /api/v1/admin/users/{userId}/status` | `users` | ROLE_ADMIN | **MVP** |
| Admin Panel | Xem hồ sơ 1 người dùng | `GET /api/v1/admin/users/{userId}` | `users`, `user_roles` | ROLE_ADMIN | **MVP** |

---

### UC10 — Hồ sơ và tài khoản người dùng

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| Profile / Settings | Xem thông tin tài khoản của mình | `GET /api/v1/users/me` | `users`, `user_roles` | Authenticated | **MVP** |
| Profile / Settings | Cập nhật thông tin cá nhân | `PUT /api/v1/users/me` | `users` | Authenticated | **MVP** |
| Profile / Settings | Đổi mật khẩu | `PUT /api/v1/users/me/password` | `users` | Authenticated | **MVP** |

---

### UC11 — Giám sát Camera (Backlog)

| Màn hình / Luồng | Hành động người dùng | API endpoint | Bảng liên quan | Phân quyền | MVP/Backlog |
|---|---|---|---|---|---|
| `MonitoringDetailScreen` | Xem danh sách camera trong vườn | `GET /api/v1/gardens/{gardenId}/cameras` | `cameras` | ROLE_USER (owner) | **Backlog** |
| `MonitoringDetailScreen` | Thêm camera vào vườn | `POST /api/v1/gardens/{gardenId}/cameras` | `cameras` | ROLE_USER (owner) | **Backlog** |
| `MonitoringDetailScreen` | Cập nhật thông tin camera | `PUT /api/v1/cameras/{cameraId}` | `cameras` | ROLE_USER (owner) | **Backlog** |
| `MonitoringDetailScreen` | Xóa camera | `DELETE /api/v1/cameras/{cameraId}` | `cameras` | ROLE_USER (owner) | **Backlog** |

**Lưu ý:** Camera scope giới hạn ở metadata; không thiết kế streaming video trong Giai đoạn 3.

---

## 3. Tổng hợp endpoint

| Nhóm | Số endpoint MVP | Số endpoint Backlog | Tổng |
|---|---|---|---|
| Auth | 2 | 3 | 5 |
| Species | 6 | 0 | 6 |
| Gardens | 5 | 0 | 5 |
| Plants | 6 | 1 | 7 |
| Schedules | 5 | 0 | 5 |
| Care Logs | 3 | 0 | 3 |
| Journals | 4 | 0 | 4 |
| Admin (Species) | 4 | 0 | 4 |
| Admin (Users) | 3 | 0 | 3 |
| Users (Me) | 3 | 0 | 3 |
| Cameras | 0 | 4 | 4 |
| **Tổng** | **41** | **8** | **49** |

> **Ghi chú:** Báo cáo gốc đề xuất 29 endpoints, tuy nhiên sau khi phân tích chi tiết source frontend và luồng nghiệp vụ đầy đủ, số endpoint thực tế cần thiết là 41 MVP + 8 Backlog. Sự chênh lệch đến từ việc báo cáo gốc chưa liệt kê đầy đủ các endpoint favorites, care-logs, user profile và admin species.

---

## 4. Ánh xạ PlantProfile → plant_species

| Thuộc tính TypeScript | Cột PostgreSQL | Kiểu dữ liệu | Ghi chú |
|---|---|---|---|
| `id` (catalog slug) | `id` | UUID | Dùng UUID thay slug |
| `name` | `common_name` | VARCHAR(200) | Tên thông thường |
| `scientificName` | `scientific_name` | VARCHAR(200) | Tên khoa học |
| `category` | `category` | VARCHAR(100) | "Cây cảnh", "Rau củ", v.v. |
| `difficulty` | `difficulty` | VARCHAR(50) | Mức độ chăm sóc |
| `light` | `light_requirement` | TEXT | |
| `water` | `water_requirement` | TEXT | |
| `environment` | `environment` | TEXT | |
| `space` | `space_requirement` | TEXT | |
| `matureSize` | `mature_size` | VARCHAR(100) | |
| `temperature` | `temperature_range` | VARCHAR(100) | |
| `humidity` | `humidity_range` | VARCHAR(100) | |
| `medium` | `growing_medium` | TEXT | |
| `drainage` | `drainage` | VARCHAR(100) | |
| `soilPh` | `soil_ph` | VARCHAR(50) | |
| `sunTolerance` | `sun_tolerance` | VARCHAR(100) | |
| `origin` | `origin` | TEXT | |
| `overview` | `overview` | TEXT | |
| `morphology` | `morphology` | TEXT | |
| `lifespan` | `lifespan` | VARCHAR(100) | |
| `floweringSeason` | `flowering_season` | VARCHAR(100) | |
| `usageAndCaution` | `usage_and_caution` | TEXT | |
| `growthRate` | `growth_rate` | VARCHAR(100) | |
| `wateringFrequency` | `watering_frequency` | VARCHAR(100) | |
| `nutrition` | `nutrition` | TEXT | |

---

*Tài liệu này là phần của Giai đoạn 3 — chỉ dùng cho thiết kế, chưa triển khai.*
