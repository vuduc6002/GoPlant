# HƯỚNG DẪN CÀI ĐẶT VÀ KHỞI CHẠY BACKEND GOPLANT (GIAI ĐOẠN 4)

Tài liệu này hướng dẫn chi tiết quy trình thiết lập môi trường, cấu hình cơ sở dữ liệu và vận hành hệ thống Backend Spring Boot của dự án **GoPlant**.

---

## 1. Yêu cầu môi trường

- **Java Development Kit (JDK):** Java 21 (khuyến nghị Eclipse Temurin 21 hoặc OpenJDK 21).
- **Maven:** Dự án đã tích hợp sẵn Maven Wrapper (`mvnw` trên Linux/macOS, `mvnw.cmd` trên Windows), không cần cài đặt Maven riêng.
- **Hệ điều hành:** Windows 10/11, macOS hoặc Linux.
- **Cơ sở dữ liệu:**
  - *Mặc định (Development nhanh):* H2 in-memory Database (tự động khởi tạo khi chạy, không cần cài đặt gì thêm).
  - *Cơ sở dữ liệu chuẩn:* PostgreSQL 14+ local hoặc Supabase PostgreSQL.

---

## 2. Cấu trúc và các Profile cấu hình

Backend cung cấp 3 profile ứng dụng:

| Profile | File cấu hình | Cơ sở dữ liệu | Flyway | Mục đích |
|---|---|---|:---:|---|
| `default` | `application.properties` | H2 in-memory (`jdbc:h2:mem:plantcaredb`) | Tắt | Phát triển nhanh local, không cần cài PostgreSQL |
| `postgres` | `application-postgres.properties` | PostgreSQL Local (`localhost:5432/goplant`) | **Bật** | Môi trường phát triển chuẩn với PostgreSQL thật |
| `supabase` | `application-supabase.properties` | Supabase Cloud PostgreSQL | **Bật** | Môi trường Staging / Production trên Supabase |
| `test` | `src/test/resources/application-test.properties` | H2 in-memory (PostgreSQL mode) | Tắt | Chạy tự động trong JUnit tests |

---

## 3. Khai báo biến môi trường (Environment Variables)

### 3.1. Cấu hình bảo mật JWT (Bắt buộc cho Production)
- `JWT_SECRET_BASE64`: Khóa bí mật HMAC-SHA256 dạng chuỗi Base64 (độ dài tối thiểu 256 bits / 32 bytes). Nếu để trống ở môi trường dev, hệ thống tự dùng khóa dev mặc định an toàn.

### 3.2. Cấu hình PostgreSQL Local (Profile `postgres`)
- `POSTGRES_URL`: `jdbc:postgresql://localhost:5432/goplant`
- `POSTGRES_USER`: Username PostgreSQL (mặc định: `goplant` hoặc `postgres`)
- `POSTGRES_PASSWORD`: Mật khẩu tương ứng

### 3.3. Cấu hình Supabase PostgreSQL (Profile `supabase`)
- `SUPABASE_DB_URL`: JDBC Connection URL lấy từ Supabase Dashboard (Session mode)  
  *Ví dụ:* `jdbc:postgresql://aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`
- `SUPABASE_DB_USERNAME`: Username kết nối (thường là `postgres.<project-ref>`)
- `SUPABASE_DB_PASSWORD`: Mật khẩu Supabase database

---

## 4. Hướng dẫn khởi chạy Backend

### 4.1. Khởi chạy với H2 Local (Mặc định)

Mở PowerShell tại thư mục `E:\GoPlant\backend`:

```powershell
cd E:\GoPlant\backend

# Khởi chạy ứng dụng
.\mvnw.cmd spring-boot:run
```

- Địa chỉ Backend: `http://localhost:8080`
- Trang quản trị H2 Console: `http://localhost:8080/h2-console`
  - JDBC URL: `jdbc:h2:mem:plantcaredb`
  - User Name: `sa`
  - Password: (để trống)

### 4.2. Khởi chạy với PostgreSQL Local và Flyway

```powershell
cd E:\GoPlant\backend

# Thiết lập biến môi trường
$env:SPRING_PROFILES_ACTIVE = "postgres"
$env:POSTGRES_URL = "jdbc:postgresql://localhost:5432/goplant"
$env:POSTGRES_USER = "postgres"
$env:POSTGRES_PASSWORD = "your_postgres_password"

# Khởi chạy ứng dụng (Flyway sẽ tự động chạy migration V1__initial_schema.sql)
.\mvnw.cmd spring-boot:run
```

### 4.3. Khởi chạy với Supabase PostgreSQL

```powershell
cd E:\GoPlant\backend

$env:SPRING_PROFILES_ACTIVE = "supabase"
$env:SUPABASE_DB_URL = "jdbc:postgresql://<pooler-host>:5432/postgres?sslmode=require"
$env:SUPABASE_DB_USERNAME = "postgres.<project-ref>"
$env:SUPABASE_DB_PASSWORD = "your_supabase_password"

.\mvnw.cmd spring-boot:run
```

---

## 5. Kết nối từ thiết bị di động & Android Emulator

Khi chạy Frontend Expo kết nối với Backend máy host:

| Môi trường chạy Frontend | URL gốc của Backend | Ghi chú |
|---|---|---|
| **Android Emulator** | `http://10.0.2.2:8080/api/v1` | `10.0.2.2` là alias đặc biệt trỏ về máy chủ host |
| **Thiết bị thật qua WiFi (Expo Go)** | `http://<IP_LAN_MAY_TINH>:8080/api/v1` | Ví dụ: `http://192.168.1.15:8080/api/v1` (tắt tường lửa hoặc mở port 8080) |
| **Web Browser / Postman** | `http://localhost:8080/api/v1` | Trực tiếp trên máy host |

> [!NOTE]
> Thiết bị di động kết nối tới Backend Spring Boot (`http://10.0.2.2:8080/api/v1`). Thiết bị di động **KHÔNG** kết nối trực tiếp tới cơ sở dữ liệu Supabase hay H2.

---

## 6. Danh sách 19 REST API đã sẵn sàng

### Nhóm A: Xác thực (Public)
1. `POST /api/v1/auth/register` — Đăng ký tài khoản mới (tự động cấp `ROLE_USER`)
2. `POST /api/v1/auth/login` — Đăng nhập bằng email/số điện thoại, trả về JWT Access Token

### Nhóm B: Người dùng (Bearer JWT)
3. `GET /api/v1/users/me` — Lấy hồ sơ tài khoản hiện tại
4. `PUT /api/v1/users/me` — Cập nhật thông tin hồ sơ
5. `PUT /api/v1/users/me/password` — Đổi mật khẩu an toàn

### Nhóm C: Giống cây trồng & Yêu thích (Bearer JWT)
6. `GET /api/v1/species` — Tìm kiếm và tra cứu danh mục giống cây (có lọc, phân trang, hiển thị `isFavorited`)
7. `GET /api/v1/species/{speciesId}` — Xem chi tiết giống cây
8. `POST /api/v1/species/{speciesId}/favorite` — Thêm giống cây vào danh sách yêu thích
9. `DELETE /api/v1/species/{speciesId}/favorite` — Bỏ giống cây khỏi danh sách yêu thích
10. `GET /api/v1/species/favorites` — Xem danh sách các giống cây yêu thích của người dùng

### Nhóm D: Quản lý khu vườn (Bearer JWT — Ràng buộc quyền sở hữu)
11. `GET /api/v1/gardens` — Lấy danh sách khu vườn của người dùng kèm số lượng cây
12. `POST /api/v1/gardens` — Tạo mới khu vườn
13. `GET /api/v1/gardens/{gardenId}` — Xem chi tiết khu vườn cùng danh sách cây trong vườn
14. `PUT /api/v1/gardens/{gardenId}` — Cập nhật thông tin khu vườn
15. `DELETE /api/v1/gardens/{gardenId}` — Xóa khu vườn (tự động dọn dẹp các cây phụ thuộc)

### Nhóm E: Quản trị danh mục giống cây (Bearer JWT + ROLE_ADMIN)
16. `GET /api/v1/admin/species` — Quản trị tra cứu toàn bộ danh mục cây (kể cả giống đang ẩn)
17. `POST /api/v1/admin/species` — Thêm giống cây mới vào danh mục
18. `PUT /api/v1/admin/species/{speciesId}` — Cập nhật thông tin giống cây
19. `DELETE /api/v1/admin/species/{speciesId}` — Xóa giống cây (từ chối 409 Conflict nếu cây đang được người dùng trồng)

---

## 7. Kiểm thử hệ thống

Chạy toàn bộ 28 Unit Tests và Integration Tests:

```powershell
cd E:\GoPlant\backend

# Chạy kiểm thử tự động
.\mvnw.cmd test

# Kiểm tra đóng gói toàn diện
.\mvnw.cmd clean verify
```
