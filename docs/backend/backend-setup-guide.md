# HƯỚNG DẪN CÀI ĐẶT VÀ KHỞI CHẠY BACKEND GOPLANT (GIAI ĐOẠN 4)

Tài liệu này hướng dẫn chi tiết quy trình thiết lập môi trường, cấu hình cơ sở dữ liệu, quản trị phân quyền và vận hành hệ thống Backend Spring Boot của dự án **GoPlant**.

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

Backend cung cấp các profile ứng dụng phân tách rõ ràng:

| Profile | File cấu hình | Cơ sở dữ liệu | Flyway | Mục đích |
|---|---|---|:---:|---|
| `default` | `application.properties` | H2 in-memory (`jdbc:h2:mem:plantcaredb`) | Tắt | Phát triển nhanh local, không cần cài PostgreSQL |
| `postgres` | `application-postgres.properties` | PostgreSQL Local (`localhost:5432/goplant`) | **Bật** | Môi trường phát triển chuẩn với PostgreSQL thật, chạy Flyway migration tự động |
| `supabase` | `application-supabase.properties` | Supabase Cloud PostgreSQL | **Tắt mặc định** (`${SUPABASE_FLYWAY_ENABLED:false}`) | Môi trường Staging / Production trên Supabase (bảo vệ an toàn cấu trúc cloud) |
| `test` | `src/test/resources/application.properties` & `application-postgres.properties` | H2 in-memory hoặc PostgreSQL CI container | Tắt (H2) / Bật (CI Postgres) | Kiểm thử tự động với JUnit 5 |

---

## 3. Khai báo biến môi trường (Environment Variables)

### 3.1. Cấu hình bảo mật JWT (Bắt buộc cho Production)
- `JWT_SECRET_BASE64`: Khóa bí mật HMAC-SHA256 dạng chuỗi Base64.
  - **Quy tắc an toàn nghiêm ngặt:** Sau khi giải mã Base64, khóa bí mật **phải đạt tối thiểu 256 bits (32 bytes)**.
  - Nếu thiếu biến môi trường, chuỗi rỗng, không phải Base64 hợp lệ, hoặc sau giải mã < 32 bytes, ứng dụng sẽ ném ngoại lệ (`IllegalStateException` / `IllegalArgumentException`) và **từ chối khởi động**.
  - Hệ thống **tuyệt đối không sử dụng khóa bí mật hardcoded dự phòng** trong mã nguồn môi trường production.
  - *Lệnh PowerShell sinh khóa ngẫu nhiên an toàn chuẩn 256-bit:*
    ```powershell
    $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); [Convert]::ToBase64String($bytes)
    ```

### 3.2. Cấu hình CORS (Cross-Origin Resource Sharing)
- `CORS_ALLOWED_ORIGINS`: Danh sách các origin được phép gọi API (phân tách bởi dấu phẩy).
  - Giá trị mặc định trên `default` và `postgres`: `http://localhost:8081,http://localhost:19006,http://localhost:3000,http://127.0.0.1:8081,http://10.0.2.2:8081` (phục vụ phát triển local và Expo Web).
  - Trên profile `supabase` (Production): Giá trị mặc định là **rỗng** (`${CORS_ALLOWED_ORIGINS:}`), ngăn chặn tuyệt đối việc mở CORS cho localhost trên môi trường production. Quản trị viên bắt buộc phải cấu hình biến môi trường `CORS_ALLOWED_ORIGINS` trỏ đến đúng domain frontend chính thức (ví dụ: `https://goplant.app,https://admin.goplant.app`).
  - Hệ thống cấu hình `allowCredentials(false)` vì ứng dụng di động và web sử dụng cơ chế Authorization Bearer Token trong Request Header, loại bỏ hoàn toàn lỗ hổng bảo mật CORS wildcard với credentials.
  - *Lưu ý:* Ứng dụng di động native (Android / iOS) gọi REST API trực tiếp bằng HTTP client native không gửi header `Origin` của trình duyệt, do đó không bị chặn bởi chính sách CORS.

### 3.3. Cấu hình PostgreSQL Local (Profile `postgres`)
- `POSTGRES_URL`: `jdbc:postgresql://localhost:5432/goplant`
- `POSTGRES_USER`: Username PostgreSQL (mặc định: `goplant` hoặc `postgres`)
- `POSTGRES_PASSWORD`: Mật khẩu tương ứng

### 3.4. Cấu hình Supabase PostgreSQL (Profile `supabase`)
- `SUPABASE_DB_URL`: JDBC Connection URL lấy từ Supabase Dashboard (Session mode)  
  *Ví dụ:* `jdbc:postgresql://aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`
- `SUPABASE_DB_USERNAME`: Username kết nối (thường là `postgres.<project-ref>`)
- `SUPABASE_DB_PASSWORD`: Mật khẩu Supabase database
- `SUPABASE_FLYWAY_ENABLED`: Mặc định là `false` để ngăn chặn việc tự động áp migration lên database cloud ngoài ý muốn. Khi cần chạy Flyway V1 migration lên Supabase, đặt biến này thành `true`.
- `spring.jpa.hibernate.ddl-auto`: Luôn đặt là `validate` để đảm bảo Hibernate đối chiếu an toàn với schema thực tế, không tự ý can thiệp cấu trúc bảng.

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
$env:JWT_SECRET_BASE64 = "dGVzdC1zZWNyZXQta2V5LWZvci1nb3BsYW50LWp3dC10b2tlbi1zaWduaW5nLW11c3QtYmUtMzItYnl0ZXM="

# Khởi chạy ứng dụng (Flyway tự động chạy migration V1__initial_schema.sql)
.\mvnw.cmd spring-boot:run
```

### 4.3. Khởi chạy với Supabase PostgreSQL

```powershell
cd E:\GoPlant\backend

$env:SPRING_PROFILES_ACTIVE = "supabase"
$env:SUPABASE_DB_URL = "jdbc:postgresql://<pooler-host>:5432/postgres?sslmode=require"
$env:SUPABASE_DB_USERNAME = "postgres.<project-ref>"
$env:SUPABASE_DB_PASSWORD = "your_supabase_password"
$env:JWT_SECRET_BASE64 = "your_base64_jwt_secret_min_256_bits"

.\mvnw.cmd spring-boot:run
```

---

## 5. Quản trị phân quyền: Tạo và thu hồi quyền Quản trị viên (Admin)

Để bảo đảm tính an toàn bảo mật tuyệt đối:
- Mọi tài khoản đăng ký mới qua endpoint công khai `POST /api/v1/auth/register` **chỉ được cấp vai trò `ROLE_USER`**.
- Hệ thống **tuyệt đối không khởi tạo tài khoản Admin mặc định** với mật khẩu hardcoded trong mã nguồn hoặc migration.
- Việc cấp hoặc thu hồi quyền Quản trị viên (`ROLE_ADMIN`) bắt buộc phải do Quản trị viên hệ thống thực hiện trực tiếp thông qua câu lệnh SQL an toàn (Transaction-safe) trên cơ sở dữ liệu PostgreSQL.

### 5.1. Kịch bản PostgreSQL DO Block cấp quyền Admin (Khuyến nghị - Tự động kiểm tra điều kiện)

Chạy script sau trong PostgreSQL Client (psql, DBeaver, pgAdmin hoặc Supabase SQL Editor). Script sẽ tự động kiểm tra sự tồn tại của tài khoản, xác minh trạng thái `ACTIVE` và đưa ra thông báo rõ ràng:

```sql
DO $$
DECLARE
    v_user_id UUID;
    v_role_id UUID;
    v_target_email TEXT := 'admin@goplant.com'; -- << THAY EMAIL TÀI KHOẢN MỤC TIÊU TẠI ĐÂY
    v_user_status TEXT;
    v_full_name TEXT;
BEGIN
    -- 1. Tìm thông tin tài khoản người dùng
    SELECT id, status, full_name INTO v_user_id, v_user_status, v_full_name
    FROM users
    WHERE email = v_target_email;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'LỖI: Không tìm thấy tài khoản với email "%". Vui lòng kiểm tra lại.', v_target_email;
    END IF;

    IF v_user_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'LỖI: Tài khoản "%" đang ở trạng thái "%", chỉ được cấp quyền cho tài khoản ACTIVE.', v_target_email, v_user_status;
    END IF;

    -- 2. Đảm bảo vai trò ROLE_ADMIN tồn tại
    INSERT INTO roles (name) VALUES ('ROLE_ADMIN') ON CONFLICT (name) DO NOTHING;
    SELECT id INTO v_role_id FROM roles WHERE name = 'ROLE_ADMIN';

    -- 3. Cấp quyền ROLE_ADMIN an toàn (tránh trùng lặp)
    INSERT INTO user_roles (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    RAISE NOTICE 'THÀNH CÔNG: Đã cấp quyền ROLE_ADMIN cho người dùng "%" (ID: %, Tên: "%")', 
        v_target_email, v_user_id, v_full_name;
END $$;
```

### 5.2. Kịch bản PostgreSQL DO Block thu hồi quyền Admin

```sql
DO $$
DECLARE
    v_user_id UUID;
    v_role_id UUID;
    v_target_email TEXT := 'admin@goplant.com'; -- << THAY EMAIL CẦN THU HỒI
    v_rows_deleted INT;
BEGIN
    SELECT id INTO v_user_id FROM users WHERE email = v_target_email;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'LỖI: Không tìm thấy tài khoản với email "%".', v_target_email;
    END IF;

    SELECT id INTO v_role_id FROM roles WHERE name = 'ROLE_ADMIN';

    DELETE FROM user_roles
    WHERE user_id = v_user_id AND role_id = v_role_id;
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

    IF v_rows_deleted > 0 THEN
        RAISE NOTICE 'THÀNH CÔNG: Đã thu hồi quyền ROLE_ADMIN của tài khoản "%".', v_target_email;
    ELSE
        RAISE NOTICE 'THÔNG BÁO: Tài khoản "%" hiện không nắm giữ quyền ROLE_ADMIN.', v_target_email;
    END IF;
END $$;
```

### 5.3. Câu lệnh kiểm tra danh sách tài khoản Quản trị viên hiện tại

```sql
SELECT 
    u.id AS user_id,
    u.full_name,
    u.email,
    u.phone_number,
    u.status,
    r.name AS role_name,
    u.created_at
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
WHERE r.name = 'ROLE_ADMIN'
ORDER BY u.created_at ASC;
```

---

## 6. Kết nối từ thiết bị di động & Android Emulator

Khi chạy Frontend Expo kết nối với Backend máy host:

| Môi trường chạy Frontend | URL gốc của Backend | Ghi chú |
|---|---|---|
| **Android Emulator** | `http://10.0.2.2:8080/api/v1` | `10.0.2.2` là alias đặc biệt trỏ về máy chủ host |
| **Thiết bị thật qua WiFi (Expo Go)** | `http://<IP_LAN_MAY_TINH>:8080/api/v1` | Ví dụ: `http://192.168.1.15:8080/api/v1` (tắt tường lửa hoặc mở port 8080) |
| **Web Browser / Postman** | `http://localhost:8080/api/v1` | Trực tiếp trên máy host |

> [!NOTE]
> Thiết bị di động kết nối tới Backend Spring Boot (`http://10.0.2.2:8080/api/v1`). Thiết bị di động **KHÔNG** kết nối trực tiếp tới cơ sở dữ liệu Supabase hay H2.

---

## 7. Danh sách 19 REST API đã sẵn sàng

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

## 8. Kiểm thử hệ thống

Chạy toàn bộ 39 Unit Tests và Integration Tests (bao gồm kiểm thử xác thực JWT, kiểm thử bảo mật CORS, kiểm thử tính toàn vẹn Schema cơ sở dữ liệu và các luồng API):

```powershell
cd E:\GoPlant\backend

# Chạy kiểm thử tự động
.\mvnw.cmd test

# Kiểm tra đóng gói toàn diện
.\mvnw.cmd clean verify
```
