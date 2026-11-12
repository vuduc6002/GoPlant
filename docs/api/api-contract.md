# Hợp Đồng REST API — GoPlant

> **Phiên bản:** 1.2.0
> **Giai đoạn:** 5 (G5.5.2a) — Camera Metadata CRUD (Phase C1)
> **Nhánh:** `feature/integrate-frontend-report`
> **Ngày cập nhật:** 2026-11-12
> **Base URL:** `https://<host>/api/v1`
> **Xác thực:** Bearer JWT trong header `Authorization: Bearer <token>`

---

## 1. Quy ước chung

### 1.1. Cấu trúc Response thành công

```json
{
  "success": true,
  "data": { ... },
  "message": "OK"
}
```

### 1.2. Cấu trúc Response phân trang

```json
{
  "success": true,
  "data": {
    "content": [ ... ],
    "page": 0,
    "size": 20,
    "totalElements": 42,
    "totalPages": 3,
    "last": false
  }
}
```

### 1.3. Cấu trúc Response lỗi

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Không tìm thấy cây trồng với ID đã cung cấp.",
    "field": null
  },
  "timestamp": "2026-10-31T09:00:00Z"
}
```

### 1.4. Mã lỗi chuẩn

| Code | HTTP Status | Mô tả |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Dữ liệu đầu vào không hợp lệ |
| `UNAUTHORIZED` | 401 | Chưa đăng nhập hoặc JWT hết hạn |
| `FORBIDDEN` | 403 | Không có quyền truy cập tài nguyên |
| `RESOURCE_NOT_FOUND` | 404 | Không tìm thấy tài nguyên |
| `CONFLICT` | 409 | Xung đột dữ liệu (email đã tồn tại, v.v.) |
| `INTERNAL_ERROR` | 500 | Lỗi server nội bộ |

### 1.5. Mô hình phân quyền và bảo vệ quyền sở hữu (Security & Ownership Model)

- **Các mức quyền truy cập chuẩn:**
  1. `Public`: Công khai, không cần xác thực JWT.
  2. `Authenticated`: Người dùng hợp lệ đã đăng nhập với JWT bearer token (`ROLE_USER` hoặc `ROLE_ADMIN`).
  3. `Authenticated (owner)`: Người dùng đã đăng nhập và là chủ sở hữu hợp pháp của tài nguyên (`garden`, `plant`, `schedule`, `care_log`, `journal`, `camera`).
  4. `ROLE_ADMIN`: Chỉ dành cho tài khoản quản trị viên hệ thống.

- **Quy tắc bắt buộc về bảo vệ tài nguyên:**
  Khi một người dùng hợp lệ cố gắng truy cập, chỉnh sửa hoặc xóa tài nguyên thuộc về người dùng khác:
  - **HTTP Status:** `403 Forbidden`
  - **Error Code:** `FORBIDDEN`
  - **Message:** `"Bạn không có quyền truy cập tài nguyên này."` (hoặc thông báo tương đương)
  - **TUYỆT ĐỐI KHÔNG** trả về `404 Not Found` trong trường hợp này. Quy tắc này đã được xác thực nghiêm ngặt trong `GardenSecurityIntegrationTest` và toàn bộ các Service bảo mật của hệ thống.

---

## 2. Nhóm Auth — `/api/v1/auth`

### POST `/api/v1/auth/register`

Đăng ký tài khoản mới. Tự động gán `ROLE_USER`.

**Request Body:**
```json
{
  "fullName": "Nguyễn Văn An",
  "account": "nguyenvanan@gmail.com",
  "recoveryEmail": "backup@gmail.com",
  "password": "Admin123!",
  "preferredDevice": "MOBILE"
}
```

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `fullName` | string | ✅ | Họ và tên, 2–200 ký tự |
| `account` | string | ✅ | Email hoặc SĐT đăng nhập |
| `recoveryEmail` | string | ❌ | Email khôi phục |
| `password` | string | ✅ | Tối thiểu 8 ký tự |
| `preferredDevice` | string | ❌ | `MOBILE` (mặc định) hoặc `PC` |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "fullName": "Nguyễn Văn An",
    "message": "Tài khoản đã được tạo thành công."
  }
}
```

**Lỗi có thể xảy ra:** `400 VALIDATION_ERROR`, `409 CONFLICT` (email/SĐT đã tồn tại)

---

### POST `/api/v1/auth/login`

Đăng nhập, nhận JWT access token.

**Request Body:**
```json
{
  "account": "nguyenvanan@gmail.com",
  "password": "Admin123!"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 86400,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "fullName": "Nguyễn Văn An",
      "email": "nguyenvanan@gmail.com",
      "roles": ["ROLE_USER"]
    }
  }
}
```

**Lỗi có thể xảy ra:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (sai tài khoản/mật khẩu), `403 FORBIDDEN` (tài khoản bị khoá)

---

## 3. Nhóm Users — `/api/v1/users`

### GET `/api/v1/users/me`

Lấy thông tin tài khoản của người đang đăng nhập.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-...",
    "fullName": "Nguyễn Văn An",
    "email": "nguyenvanan@gmail.com",
    "phoneNumber": null,
    "recoveryEmail": "backup@gmail.com",
    "preferredDevice": "MOBILE",
    "status": "ACTIVE",
    "avatarUrl": null,
    "roles": ["ROLE_USER"],
    "createdAt": "2026-10-01T08:00:00Z"
  }
}
```

---

### PUT `/api/v1/users/me`

Cập nhật thông tin cá nhân.

**Request Body:**
```json
{
  "fullName": "Nguyễn Văn An (Updated)",
  "recoveryEmail": "new-backup@gmail.com",
  "preferredDevice": "PC",
  "avatarUrl": "https://storage.example.com/avatars/user123.jpg"
}
```

**Response 200:** Trả về thông tin user đã cập nhật (cùng cấu trúc GET /me).

---

### PUT `/api/v1/users/me/password`

Đổi mật khẩu.

**Request Body:**
```json
{
  "currentPassword": "Admin123!",
  "newPassword": "NewPass456@",
  "confirmPassword": "NewPass456@"
}
```

**Response 200:**
```json
{ "success": true, "data": { "message": "Mật khẩu đã được cập nhật." } }
```

**Lỗi:** `400` nếu mật khẩu hiện tại sai hoặc newPassword != confirmPassword.

---

## 4. Nhóm Species — `/api/v1/species`

### GET `/api/v1/species`

Lấy danh sách giống cây, hỗ trợ tìm kiếm và phân trang.

**Query Parameters:**

| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `keyword` | string | — | Tìm theo tên thông thường hoặc tên khoa học |
| `category` | string | — | Lọc theo danh mục ("Cây cảnh", "Rau củ", …) |
| `page` | int | 0 | Số trang (0-based) |
| `size` | int | 20 | Kích thước trang (tối đa 100) |
| `sort` | string | `common_name,asc` | Sắp xếp |

**Response 200:** Danh sách phân trang, mỗi phần tử:
```json
{
  "id": "uuid",
  "commonName": "Trầu bà lá xẻ",
  "scientificName": "Monstera deliciosa",
  "category": "Cây cảnh",
  "difficulty": "Dễ",
  "thumbnailUrl": "https://...",
  "isFavorited": false
}
```

> `isFavorited`: true/false dựa trên `user_favorite_species` của người đang đăng nhập.

---

### GET `/api/v1/species/{speciesId}`

Chi tiết 1 giống cây. Trả về toàn bộ các trường từ `plant_species`.

**Response 200:** Toàn bộ các trường PlantProfile + `isFavorited`.

---

### POST `/api/v1/species/{speciesId}/favorite`

Thêm giống cây vào danh sách yêu thích.

**Response 201:**
```json
{ "success": true, "data": { "message": "Đã thêm vào danh sách yêu thích." } }
```

**Lỗi:** `409 CONFLICT` nếu đã yêu thích.

---

### DELETE `/api/v1/species/{speciesId}/favorite`

Bỏ yêu thích.

**Response 200:**
```json
{ "success": true, "data": { "message": "Đã bỏ khỏi danh sách yêu thích." } }
```

---

### GET `/api/v1/species/favorites`

Danh sách giống cây yêu thích của người dùng hiện tại. Phân trang.

**Response 200:** Danh sách phân trang, cấu trúc tương tự `GET /species` với `isFavorited: true`.

---

## 5. Nhóm Gardens — `/api/v1/gardens`

### GET `/api/v1/gardens`

Danh sách vườn của người dùng.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Ban Công Tầng 3",
      "location": "Căn hộ 302, Tòa Thảo Mộc",
      "spaceType": "BAN_CONG",
      "coverImageUrl": null,
      "plantCount": 4,
      "createdAt": "2026-10-01T08:00:00Z"
    }
  ]
}
```

---

### POST `/api/v1/gardens`

Tạo vườn mới.

**Request Body:**
```json
{
  "name": "Ban Công Tầng 3",
  "location": "Căn hộ 302, Tòa Thảo Mộc",
  "spaceType": "BAN_CONG",
  "description": "Hướng Đông, ánh sáng tốt buổi sáng.",
  "coverImageUrl": null
}
```

**Response 201:** Trả về object garden vừa tạo đầy đủ.

---

### GET `/api/v1/gardens/{gardenId}`

Chi tiết 1 vườn + danh sách cây (summary).

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Ban Công Tầng 3",
    "location": "...",
    "spaceType": "BAN_CONG",
    "description": "...",
    "coverImageUrl": null,
    "plants": [
      {
        "id": "uuid",
        "displayName": "Cà Chua Cherry",
        "scientificName": "Solanum lycopersicum var. cerasiforme",
        "healthStatus": "HEALTHY",
        "imageUrl": null
      }
    ],
    "createdAt": "2026-10-01T08:00:00Z",
    "updatedAt": "2026-10-15T10:00:00Z"
  }
}
```

**Lỗi:** `403 FORBIDDEN` nếu không phải chủ vườn; `404` nếu không tìm thấy.

---

### PUT `/api/v1/gardens/{gardenId}`

Cập nhật thông tin vườn. Body giống POST.

**Response 200:** Trả về garden đã cập nhật.

---

### DELETE `/api/v1/gardens/{gardenId}`

Xóa vườn. Cascade xóa tất cả cây trong vườn và dữ liệu liên quan.

**Response 200:**
```json
{ "success": true, "data": { "message": "Khu vườn đã được xóa." } }
```

---

## 6. Nhóm Plants — `/api/v1/plants`

### GET `/api/v1/plants`

Danh sách tất cả cây của người dùng, có phân trang.

**Query Parameters:**
- `keyword` (string, tùy chọn): Tìm kiếm theo tên hiển thị cây (`displayName`) hoặc tên loài cây (`commonName`).
- `gardenId` (UUID, tùy chọn): Lọc theo khu vườn.
- `healthStatus` (string, tùy chọn): Lọc theo tình trạng sức khỏe (`HEALTHY`, `NEEDS_ATTENTION`, `CRITICAL`, `UNKNOWN`).
- `page` (integer, tùy chọn, mặc định `0`): Chỉ số trang bắt đầu từ 0.
- `size` (integer, tùy chọn, mặc định `20`): Số lượng bản ghi mỗi trang.
- `sort` (string, tùy chọn, mặc định `createdAt,desc`): Sắp xếp theo định dạng `property,asc|desc`. Hỗ trợ: `displayName`, `createdAt`, `plantedAt`, `healthStatus`.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "id": "c1f7a3e2-8b4d-4e9a-9c12-3f4a5b6c7d8e",
        "displayName": "Cà Chua Cherry của tôi",
        "speciesName": "Cà Chua Cherry",
        "gardenName": "Ban Công Tầng 3",
        "healthStatus": "HEALTHY",
        "imageUrl": null,
        "createdAt": "2026-10-01T08:00:00Z"
      }
    ],
    "page": 0,
    "size": 20,
    "totalElements": 1,
    "totalPages": 1,
    "last": true
  }
}
```

---

### POST `/api/v1/gardens/{gardenId}/plants`

Thêm cây vào vườn.

**Request Body:**
```json
{
  "speciesId": "uuid",
  "displayName": "Cà Chua Cherry của tôi",
  "location": "Góc trái ban công",
  "plantedAt": "2026-09-01",
  "note": "Giống nhập từ cửa hàng ABC"
}
```

**Response 201:** Trả về object user_plant đầy đủ (kèm thông tin species).

---

### GET `/api/v1/plants/{plantId}`

Chi tiết 1 cây.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "displayName": "Cà Chua Cherry của tôi",
    "location": "Góc trái ban công",
    "plantedAt": "2026-09-01",
    "note": "...",
    "healthStatus": "HEALTHY",
    "imageUrl": null,
    "species": {
      "id": "uuid",
      "commonName": "Cà Chua Cherry",
      "scientificName": "Solanum lycopersicum var. cerasiforme",
      "category": "Rau củ"
    },
    "garden": {
      "id": "uuid",
      "name": "Ban Công Tầng 3"
    },
    "createdAt": "2026-10-01T08:00:00Z"
  }
}
```

---

### PUT `/api/v1/plants/{plantId}`

Cập nhật thông tin cây (trừ species_id).

**Request Body:**
```json
{
  "displayName": "Cà Chua Cherry (Updated)",
  "location": "Góc phải ban công",
  "plantedAt": "2026-09-01",
  "note": "Ghi chú mới",
  "healthStatus": "NEEDS_ATTENTION",
  "imageUrl": null
}
```

**Response 200:** Trả về plant đã cập nhật.

---

### DELETE `/api/v1/plants/{plantId}`

Xóa cây và tất cả lịch, nhật ký liên quan.

**Response 200:**
```json
{ "success": true, "data": { "message": "Cây trồng đã được xóa." } }
```

---

### GET `/api/v1/plants/{plantId}/schedules`

Danh sách lịch chăm sóc của 1 cây.

**Query Parameters:**
- `status` (string, tùy chọn): Lọc theo trạng thái vòng đời lịch (`ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`).
- `page` (integer, tùy chọn, mặc định `0`): Chỉ số trang bắt đầu từ 0.
- `size` (integer, tùy chọn, mặc định `20`): Số lượng bản ghi mỗi trang.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "id": "e2a1b3c4-5d6e-7f8a-9b0c-1d2e3f4a5b6c",
        "taskType": "WATERING",
        "taskLabel": null,
        "frequency": "DAILY",
        "intervalDays": null,
        "reminderTime": "08:00:00",
        "nextScheduledAt": "2026-11-10T01:00:00Z",
        "status": "ACTIVE"
      }
    ],
    "page": 0,
    "size": 20,
    "totalElements": 1,
    "totalPages": 1,
    "last": true
  }
}
```

---

### GET `/api/v1/plants/{plantId}/care-logs`

Lịch sử chăm sóc của 1 cây, phân trang, sắp xếp theo `performed_at DESC`.

**Response 200:** Danh sách phân trang.

---

### GET `/api/v1/plants/{plantId}/journals`

Nhật ký phát triển của 1 cây, phân trang.

**Response 200:** Danh sách phân trang.

---

## 7. Nhóm Schedules — `/api/v1/schedules`

### 7.0. Quy tắc nghiệp vụ quản lý Lịch chăm sóc (Care Schedules Business Rules)

1. **Một lần (`ONCE`):**
   - Chỉ chạy 1 lần vào `startDate` lúc `reminderTime`.
   - `intervalDays` bắt buộc phải là `NULL` (ràng buộc toàn vẹn CSDL qua CHECK constraint `chk_care_schedules_interval`).
   - Khi gọi `/complete` hoặc `/skip`, trạng thái lịch chuyển thành `COMPLETED` (kết thúc vòng đời).
2. **Lặp hàng ngày (`DAILY`):**
   - `intervalDays` bắt buộc phải là `NULL` (chu kỳ lặp 1 ngày được tính toán nội bộ trong logic ứng dụng; CSDL không lưu giá trị số cho frequency này).
   - Khi hoàn thành/bỏ qua, `next_scheduled_at` cộng thêm 1 ngày vào lúc `reminderTime`.
3. **Lặp cách ngày (`EVERY_OTHER_DAY`):**
   - `intervalDays` bắt buộc phải là `NULL` (chu kỳ lặp 2 ngày được tính toán nội bộ trong logic ứng dụng; CSDL không lưu giá trị số cho frequency này).
   - Khi hoàn thành/bỏ qua, `next_scheduled_at` cộng thêm 2 ngày vào lúc `reminderTime`.
4. **Lặp hàng tuần (`WEEKLY`):**
   - `intervalDays` bắt buộc phải là `NULL` (chu kỳ lặp 7 ngày được tính toán nội bộ trong logic ứng dụng; CSDL không lưu giá trị số cho frequency này).
   - Khi hoàn thành/bỏ qua, `next_scheduled_at` cộng thêm 7 ngày vào lúc `reminderTime`.
5. **Lặp tùy chỉnh (`CUSTOM`):**
   - `intervalDays` bắt buộc phải được cung cấp và `> 0` (`intervalDays >= 1`).
   - Khi hoàn thành/bỏ qua, `next_scheduled_at` cộng thêm `intervalDays` ngày vào lúc `reminderTime`.
6. **Xác thực dữ liệu tạo lịch:**
   - `taskType` bắt buộc thuộc 6 giá trị đã được định nghĩa trong Entity `TaskType` và CHECK constraint CSDL: `WATERING`, `FERTILIZING`, `PRUNING`, `PEST_CHECK`, `MISTING`, `JOURNAL`.
   - `taskLabel`: Nhãn mô tả chi tiết công việc chăm sóc (tùy chọn, tối đa 200 ký tự, có thể null).
   - `startDate`: Ngày bắt đầu thực hiện lịch, không được là ngày trong quá khứ so với thời điểm tạo (cho phép ngày hôm nay, mặc định ngày hiện tại).
   - `endDate`: Ngày kết thúc lịch (tùy chọn). Nếu không cung cấp hoặc `NULL`, lịch không có ngày kết thúc cho đến khi người dùng chủ động tạm dừng (`PAUSED`), hủy (`CANCELLED`) hoặc hoàn thành theo nghiệp vụ. Nếu cung cấp, `endDate` phải sau hoặc bằng `startDate`.
   - Quy tắc tính `endDate`: `endDate` được tính bao gồm cả ngày cuối cùng. Hệ thống không tạo mốc thực hiện tiếp theo vượt quá ngày này; nếu `next_scheduled_at` tính toán mới vượt quá `endDate`, trạng thái lịch sẽ tự động chuyển thành `COMPLETED`.
   - `reminderTime`: Giờ nhắc nhở trong ngày (định dạng `HH:mm:ss`). Nếu không cung cấp hoặc `NULL`, hệ thống mặc định là `08:00:00` theo múi giờ `Asia/Ho_Chi_Minh`.
7. **Trạng thái lịch (`care_schedules.status`):**
   - Chỉ có 4 giá trị hợp lệ: `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`.
   - Lịch khi tạo mặc định là `ACTIVE`.
   - Khi người dùng tạm ngưng: `PAUSED`.
   - Khi người dùng tiếp tục: `ACTIVE`.
   - Khi người dùng chủ động hủy: `CANCELLED`.
   - Khi lịch `ONCE` hoàn thành/bỏ qua hoặc lịch có `endDate` đã qua mốc chu kỳ cuối cùng: `COMPLETED`.
   - Lịch **KHÔNG BAO GIỜ** nhận trạng thái `SKIPPED` (`SKIPPED` chỉ là trạng thái của bản ghi trong bảng `care_logs`).
8. **Quy tắc hiển thị Lịch hôm nay (`GET /api/v1/schedules/today`):**
   - Lịch cần thực hiện: Chỉ các lịch có trạng thái `ACTIVE` mà đến hạn thực hiện trong ngày hôm nay hoặc đã quá hạn được xác định theo ngày hiện tại ở múi giờ `Asia/Ho_Chi_Minh` (`nextScheduledAt` không vượt quá cuối ngày hôm nay theo giờ Việt Nam: 23:59:59.999 `Asia/Ho_Chi_Minh`, tương đương 16:59:59.999 UTC; hoàn toàn độc lập với timezone mặc định của máy chủ).
   - Cờ `isOverdue`: Được gán `true` khi `nextScheduledAt` nhỏ hơn thời điểm hiện tại thực tế (`NOW()`).
   - Lịch có trạng thái `PAUSED`, `CANCELLED`, hoặc `COMPLETED` tuyệt đối không xuất hiện trong danh sách lịch cần thực hiện hôm nay.
9. **Hoạt động `/complete`:**
   - Tạo một bản ghi trong `care_logs` với `status = 'COMPLETED'`, `performed_at = NOW()`, `schedule_id = schedule.id`, `task_type = schedule.task_type`.
   - Khi complete một lịch quá hạn: Chỉ tạo một bản ghi `CareLog` duy nhất cho lần xử lý hiện tại. Tính toán `next_scheduled_at` tiếp theo theo chu kỳ và đưa lịch trở lại mốc thời gian hợp lệ tiếp theo trong tương lai (không tạo dồn dập nhiều CareLog cho các mốc đã lỡ).
   - Cập nhật `care_schedules.updated_at = NOW()`.
   - Nếu có `endDate` và `next_scheduled_at` mới vượt quá `endDate`, chuyển trạng thái lịch thành `COMPLETED`.
10. **Hoạt động `/skip`:**
    - Tạo một bản ghi trong `care_logs` với `status = 'SKIPPED'`, `performed_at = NOW()`, `schedule_id = schedule.id`, `task_type = schedule.task_type`.
    - Khi skip một lịch quá hạn: Chỉ tạo một bản ghi `CareLog` duy nhất cho lần xử lý hiện tại và tính toán `next_scheduled_at` tiếp theo theo chu kỳ.
    - Cập nhật `care_schedules.updated_at = NOW()`.
    - Trạng thái lịch vẫn duy trì là `ACTIVE` (với lịch lặp) hoặc `COMPLETED` (với lịch `ONCE` hoặc khi vượt quá `endDate`).
11. **Tương thích múi giờ và kiểu dữ liệu (Timezone & Data Types):**
    - `reminderTime`: Định dạng `LocalTime` (`HH:mm:ss`), mặc định `08:00:00` theo múi giờ `Asia/Ho_Chi_Minh`.
    - `startDate`, `endDate`: Định dạng `LocalDate` (`YYYY-MM-DD`).
    - `next_scheduled_at`: Định dạng `OffsetDateTime` / `TIMESTAMPTZ` (lưu trữ theo chuẩn UTC, ký hiệu hậu tố `Z`). Với giờ nhắc mặc định `08:00:00` sáng giờ Việt Nam (`Asia/Ho_Chi_Minh`, UTC+7), thời điểm UTC biểu diễn tương ứng sẽ là `01:00:00Z` cùng ngày (VD: ngày 2026-10-31 nhắc lúc 08:00:00 VN thì `nextScheduledAt` là `2026-10-31T01:00:00Z`).
    - Toàn bộ việc tính toán thời gian, ngày đến hạn và thời điểm nhắc nhở của hệ thống phải được thực hiện nhất quán theo múi giờ `Asia/Ho_Chi_Minh` (UTC+7) cho giai đoạn MVP, hoàn toàn độc lập với timezone mặc định của máy chủ.
12. **Quan hệ với Cây trồng (User Plant):**
    - Khi một cây bị xóa (`DELETE /api/v1/plants/{plantId}`), toàn bộ `care_schedules` và `care_logs` của cây đó sẽ tự động bị xóa theo (`ON DELETE CASCADE` đã được thiết lập chặt chẽ trong lược đồ CSDL).

---

### POST `/api/v1/schedules`

Tạo lịch chăm sóc mới.

**Request Body:**
```json
{
  "userPlantId": "uuid",
  "taskType": "WATERING",
  "taskLabel": null,
  "frequency": "DAILY",
  "intervalDays": null,
  "reminderTime": "08:00:00",
  "startDate": "2026-10-31",
  "endDate": null
}
```

**Response 201:** Trả về schedule đầy đủ.

---

### GET `/api/v1/schedules/today`

Danh sách lịch chăm sóc cần thực hiện trong ngày hôm nay của người dùng hiện tại.

**Quy tắc nghiệp vụ:**
- Chỉ lấy các lịch có trạng thái `ACTIVE`.
- Lịch đến hạn trong ngày hôm nay hoặc đã quá hạn được tính theo ngày hiện tại ở múi giờ `Asia/Ho_Chi_Minh` (nextScheduledAt không vượt quá cuối ngày hôm nay theo giờ Việt Nam: 23:59:59.999 `Asia/Ho_Chi_Minh`, tương đương 16:59:59.999 UTC; không phụ thuộc timezone máy chủ).
- `isOverdue = true` khi `nextScheduledAt < NOW()`.
- Loại trừ hoàn toàn lịch `PAUSED`, `CANCELLED`, `COMPLETED`.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "scheduleId": "uuid",
      "plantId": "uuid",
      "plantName": "Cà Chua Cherry",
      "gardenName": "Ban Công Tầng 3",
      "taskType": "WATERING",
      "taskLabel": null,
      "nextScheduledAt": "2026-10-31T01:00:00Z",
      "isOverdue": false,
      "status": "ACTIVE"
    }
  ]
}
```

---

### PUT `/api/v1/schedules/{scheduleId}`

Cập nhật thông tin lịch chăm sóc (loại việc, nhãn, chu kỳ, thời gian bắt đầu, kết thúc, trạng thái).

**Quy tắc cập nhật (Update Semantics):**
- **Trường bị bỏ qua (omitted):** Giữ nguyên giá trị hiện tại của lịch.
- **`taskLabel: null`:** Xóa nhãn mô tả (cập nhật trường thành null trong CSDL).
- **`reminderTime: null`:** Sử dụng lại mặc định `08:00:00` theo múi giờ `Asia/Ho_Chi_Minh`.
- **`endDate: null`:** Xóa thời hạn kết thúc (lịch trở thành vô thời hạn cho đến khi người dùng tạm ngưng hoặc hủy).
- **Ràng buộc toàn vẹn chu kỳ (`intervalDays`):**
  - Nếu thay đổi `frequency` sang giá trị khác `CUSTOM` (`ONCE`, `DAILY`, `EVERY_OTHER_DAY`, `WEEKLY`), phải bảo đảm `intervalDays = null` (tuân thủ CHECK constraint CSDL `chk_care_schedules_interval`).
  - Nếu `frequency` là `CUSTOM`, `intervalDays` bắt buộc phải được cung cấp và lớn hơn 0 (`intervalDays > 0`).
- **`userPlantId`:** Không thể thay đổi (bất biến sau khi tạo).

**Request Body (ví dụ):**
```json
{
  "taskType": "WATERING",
  "taskLabel": null,
  "frequency": "CUSTOM",
  "intervalDays": 3,
  "reminderTime": "08:00:00",
  "startDate": "2026-10-31",
  "endDate": null,
  "status": "ACTIVE"
}
```

**Response 200:** Trả về schedule đã cập nhật (`CareSchedule`).
```json
{
  "success": true,
  "data": {
    "id": "e2a1b3c4-5d6e-7f8a-9b0c-1d2e3f4a5b6c",
    "userPlantId": "c1f7a3e2-8b4d-4e9a-9c12-3f4a5b6c7d8e",
    "plantName": "Cà Chua Cherry của tôi",
    "taskType": "WATERING",
    "taskLabel": null,
    "frequency": "CUSTOM",
    "intervalDays": 3,
    "reminderTime": "08:00:00",
    "startDate": "2026-10-31",
    "endDate": null,
    "nextScheduledAt": "2026-10-31T01:00:00Z",
    "isOverdue": false,
    "status": "ACTIVE"
  }
}
```

---

### DELETE `/api/v1/schedules/{scheduleId}`

Xóa lịch chăm sóc. Các lượt `care_logs` trước đó được giữ nguyên với `schedule_id = NULL` để bảo toàn lịch sử.

**Response 200:**
```json
{ "success": true, "data": { "message": "Lịch chăm sóc đã được xóa." } }
```

---

### POST `/api/v1/schedules/{scheduleId}/complete`

Đánh dấu hoàn thành 1 lần thực hiện lịch.
- Tạo 1 bản ghi `care_logs` với `status = 'COMPLETED'`.
- Với lịch lặp (`DAILY`, `EVERY_OTHER_DAY`, `WEEKLY`, `CUSTOM`): tự động cộng chu kỳ tính `next_scheduled_at` cho lần tiếp theo, trạng thái lịch vẫn là `ACTIVE`.
- Với lịch một lần (`ONCE`): trạng thái lịch chuyển sang `COMPLETED` (kết thúc vòng đời).

**Request Body (tùy chọn):**
```json
{
  "note": "Đã tưới nước xong, cây trông khỏe.",
  "imageUrls": []
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "careLogId": "uuid",
    "scheduleStatus": "ACTIVE",
    "nextScheduledAt": "2026-11-01T01:00:00Z"
  }
}
```

**Lỗi:** `409 CONFLICT` nếu lịch không ở trạng thái `ACTIVE` hoặc lượt chăm sóc chưa đến hạn.

---

### POST `/api/v1/schedules/{scheduleId}/skip`

Bỏ qua lượt thực hiện này.
- Tạo 1 bản ghi `care_logs` với `status = 'SKIPPED'`.
- Với lịch lặp: tự động tính `next_scheduled_at` cho lần tiếp theo, trạng thái lịch vẫn là `ACTIVE` (không gán `SKIPPED` vào trạng thái lịch).
- Với lịch một lần (`ONCE`): trạng thái lịch chuyển sang `COMPLETED` (kết thúc vòng đời).

**Request Body (tùy chọn):**
Rỗng hoặc kèm ghi chú lý do:
```json
{
  "note": "Hôm nay không ở nhà."
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "careLogId": "uuid-cua-care-log-vua-tao",
    "scheduleStatus": "ACTIVE",
    "nextScheduledAt": "2026-04-12T01:00:00Z"
  }
}
```

**Lỗi:** `409 CONFLICT` nếu lịch không ở trạng thái `ACTIVE` hoặc lượt chăm sóc chưa đến hạn.

---

## 8. Nhóm Care Logs — `/api/v1/care-logs`

### POST `/api/v1/care-logs`

Ghi nhận chăm sóc thủ công (không cần lịch trước — ad-hoc).

**Quy tắc nghiệp vụ kiểm soát quyền sở hữu và lịch tham chiếu:**
- `userPlantId`: Cây được chăm sóc bắt buộc phải thuộc quyền sở hữu của người dùng hiện tại (được bảo vệ tự động ở tầng CSDL qua Composite Foreign Key `(user_plant_id, performed_by)`).
- `schedule_id = NULL`: Lượt chăm sóc thủ công ad-hoc (ngoài lịch).
- `schedule_id != NULL`: Nếu có liên kết với lịch, lịch được tham chiếu bắt buộc phải thuộc cùng cây trồng (`user_plant_id`) và cùng chủ sở hữu. Quy tắc xác thực này được kiểm tra chặt chẽ tại tầng Service (Spring Boot) ở Giai đoạn 4 nhằm đảm bảo tính đơn giản và tương thích PostgreSQL 14+.
- Khi xóa lịch: Bản ghi nhật ký `care_logs` vẫn được bảo toàn với `schedule_id = NULL` (`ON DELETE SET NULL`) làm lịch sử nhật ký.

**Request Body:**
```json
{
  "userPlantId": "uuid",
  "taskType": "PRUNING",
  "note": "Cắt tỉa cành già.",
  "imageUrls": ["https://storage.example.com/img/before.jpg"],
  "performedAt": "2026-10-31T10:30:00Z"
}
```

**Response 201:** Trả về care_log vừa tạo.

---

## 9. Nhóm Journals — `/api/v1/journals`

### POST `/api/v1/journals`

Thêm ghi nhận nhật ký phát triển mới.

**Request Body:**
```json
{
  "userPlantId": "uuid",
  "entryType": "GROWTH",
  "healthStatus": "HEALTHY",
  "note": "Cây đang ra quả, lá xanh khỏe.",
  "imageUrls": ["https://storage.example.com/journal/img1.jpg"],
  "recordedAt": "2026-10-31T09:00:00Z"
}
```

**Response 201:** Trả về growth_journal vừa tạo.

---

### PUT `/api/v1/journals/{journalId}`

Cập nhật ghi nhận nhật ký.

**Request Body:** Tương tự POST (trừ `userPlantId`).

**Response 200:** Trả về journal đã cập nhật.

---

### DELETE `/api/v1/journals/{journalId}`

Xóa 1 ghi nhận.

**Response 200:**
```json
{ "success": true, "data": { "message": "Ghi nhận đã được xóa." } }
```

---

## 10. Nhóm Admin Species — `/api/v1/admin/species`

> Yêu cầu `ROLE_ADMIN`.

### GET `/api/v1/admin/species`

Danh sách tất cả giống cây (kể cả `is_active = false`). Phân trang.

### POST `/api/v1/admin/species`

Thêm giống cây mới.

**Request Body:** Toàn bộ các trường của `plant_species` (trừ id, created_at, updated_at).

**Response 201:** Trả về species vừa tạo.

### PUT `/api/v1/admin/species/{speciesId}`

Cập nhật thông tin giống cây.

**Response 200:** Trả về species đã cập nhật.

### DELETE `/api/v1/admin/species/{speciesId}`

Xóa giống cây. Sẽ lỗi `409 CONFLICT` nếu còn cây trồng đang sử dụng giống này.

---

## 11. Nhóm Admin Users — `/api/v1/admin/users`

> Yêu cầu `ROLE_ADMIN`.

### GET `/api/v1/admin/users`

Danh sách tài khoản người dùng, có phân trang.

**Query Parameters:**
- `keyword` (string, tùy chọn): Tìm kiếm theo email hoặc họ tên người dùng.
- `status` (string, tùy chọn): Lọc theo trạng thái tài khoản (`ACTIVE`, `INACTIVE`, `BANNED`).
- `role` (string, tùy chọn): Lọc theo vai trò (`ROLE_USER`, `ROLE_ADMIN`).
- `page` (integer, tùy chọn, mặc định `0`): Chỉ số trang bắt đầu từ 0.
- `size` (integer, tùy chọn, mặc định `20`): Số lượng bản ghi mỗi trang.
- `sort` (string, tùy chọn, mặc định `createdAt,desc`): Sắp xếp theo trường và chiều.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "fullName": "Nguyễn Văn A",
        "email": "user@example.com",
        "phoneNumber": "0901234567",
        "status": "ACTIVE",
        "roles": [
          "ROLE_USER"
        ],
        "createdAt": "2026-10-01T00:00:00Z"
      }
    ],
    "page": 0,
    "size": 20,
    "totalElements": 1,
    "totalPages": 1,
    "last": true
  }
}
```

---

### GET `/api/v1/admin/users/{userId}`

Hồ sơ đầy đủ của 1 người dùng.

**Response 200:** Trả về chi tiết người dùng (`AdminUserDetail`).

---

### PATCH `/api/v1/admin/users/{userId}/status`

Kích hoạt hoặc khoá tài khoản người dùng.

> **Lưu ý MVP:** Request body chỉ nhận `status` (`ACTIVE`, `INACTIVE`, `BANNED`). Không nhận trường `reason` (do bảng `users` trong CSDL không có cột lưu reason; nếu cần lưu reason sẽ thiết kế hệ thống audit log riêng trong tương lai).

**Request Body:**
```json
{
  "status": "BANNED"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "newStatus": "BANNED",
    "message": "Trạng thái người dùng đã được cập nhật thành công"
  }
}
```

> **Ghi chú về phân quyền người dùng (Role Management):** Endpoint `PATCH /api/v1/admin/users/{userId}/role` được quy hoạch là tính năng mở rộng trong tương lai (Backlog), không nằm trong 44 endpoints chuẩn của Giai đoạn 5.

---

## 12. Nhóm Monitoring — `/api/v1/monitoring` *(G5.5.1 MVP)*

> Hai endpoint read-only phục vụ tab **Theo dõi & Ghi nhận** (`/monitoring`) và màn hình **Chi tiết theo dõi cây** (`/monitoring/detail?plantId=...`), chạy trên 11 bảng V1 hiện có (**0 migration SQL mới**).

### Quy tắc Nguồn gốc Dữ liệu & Múi giờ (Data Provenance & Timezone Semantics)

1. **Múi giờ Việt Nam (`Asia/Ho_Chi_Minh`) & `Clock`:**
   - Mọi thống kê lịch chăm sóc `ACTIVE` dùng `java.time.Clock` (tiêm qua Spring Bean) và khoảng nửa-mở không chồng lấn:
     - `overdueCount`: `status = 'ACTIVE' AND next_scheduled_at < now`
     - `dueTodayCount`: `status = 'ACTIVE' AND next_scheduled_at >= now AND next_scheduled_at < startOfTomorrowVn` (`todayVn.plusDays(1)` tại `00:00:00` giờ `Asia/Ho_Chi_Minh`, quy đổi UTC)
   - `ageDays`: `ChronoUnit.DAYS.between(plantedAt, todayVn)` kẹp tối thiểu `0`, hoặc `null` nếu `plantedAt == null`.
   - Mọi timestamp trong JSON trả chuẩn ISO 8601 UTC (`...Z`).
2. **Phân nhóm trung thực `care_logs` (Không suy đoán tỷ lệ tuân thủ):**
   - Trong schema V1 không có cột `origin_type`; khi xóa lịch chăm sóc, `schedule_id` được đặt về `NULL` (`detachSchedule()` / `ON DELETE SET NULL`).
   - Vì vậy G5.5.1 dùng đúng 4 bộ đếm trung tính (`unlinkedCompletedLogs`, `unlinkedSkippedLogs`, `linkedScheduledCompletedLogs`, `linkedScheduledSkippedLogs`) và `sourceType` (`CARE_LOG_UNLINKED`, `CARE_LOG_LINKED`, `GROWTH_JOURNAL`) — **không** có `manualCompletedLogs`, `CARE_LOG_MANUAL`, `CARE_LOG_SCHEDULED` hay `Care Adherence %`.
3. **Ngữ nghĩa Trạng thái Sức khỏe & Cảm biến:**
   - `UserPlant.healthStatus` (`healthDistribution` / `currentHealthStatus`) và `GrowthJournal.healthStatus` (`recentJournalObservations`) được giữ độc lập, không tự đồng bộ chéo. Lưu ý ở schema V1, cả hai đều khởi tạo mặc định là `HEALTHY` khi tạo mới nếu người dùng không đổi.
   - `sensorConnected` luôn trả `false` trong G5.5.1; Frontend hiển thị rõ `"Chưa kết nối cảm biến IoT"` và không sinh số liệu môi trường giả.
   - `speciesCareGuide` trả về các trường text thô nullable trên `plant_species` để tham khảo, không parse số hay sinh cảnh báo ngưỡng.

---

### GET `/api/v1/monitoring/overview`

Tổng hợp số liệu theo dõi toàn vườn cho người dùng đang đăng nhập (`Authenticated`). Người dùng mới chưa có vườn/cây vẫn trả `200 OK` với mọi bộ đếm bằng `0` và mảng rỗng.

**Quyền truy cập:** `Authenticated` (chỉ tổng hợp dữ liệu có `owner_id = currentUserId` từ JWT).

**Response 200:**
```json
{
  "success": true,
  "data": {
    "gardensCount": 2,
    "plantsCount": 5,
    "healthDistribution": {
      "healthyCount": 2,
      "needsAttentionCount": 1,
      "criticalCount": 1,
      "unknownCount": 1
    },
    "schedulesSummary": {
      "activeCount": 4,
      "dueTodayCount": 2,
      "overdueCount": 1
    },
    "careLogsSummary7d": {
      "unlinkedCompletedLogs": 3,
      "unlinkedSkippedLogs": 1,
      "linkedScheduledCompletedLogs": 4,
      "linkedScheduledSkippedLogs": 0
    },
    "careLogsSummary30d": {
      "unlinkedCompletedLogs": 7,
      "unlinkedSkippedLogs": 2,
      "linkedScheduledCompletedLogs": 9,
      "linkedScheduledSkippedLogs": 1
    },
    "attentionPlants": [
      {
        "plantId": "uuid",
        "displayName": "Cà chua ban công",
        "gardenId": "uuid",
        "gardenName": "Ban công hướng Đông",
        "speciesName": "Cà chua bi",
        "healthStatus": "CRITICAL"
      }
    ],
    "gardensSummary": [
      {
        "gardenId": "uuid",
        "name": "Ban công hướng Đông",
        "plantCount": 3,
        "attentionCount": 1
      }
    ],
    "sensorConnected": false,
    "generatedAt": "2026-11-12T04:15:00Z"
  },
  "message": "OK"
}
```

**Ghi chú truy vấn:** `MonitoringService.getOverview` chạy cố định **5 queries** (không N+1); `attentionPlants` sắp ưu tiên `CRITICAL` trước `NEEDS_ATTENTION`, giới hạn tối đa **10** cây.

**Mã trạng thái HTTP:** `200 OK`, `401 UNAUTHORIZED`, `500 INTERNAL_ERROR`.

---

### GET `/api/v1/monitoring/plants/{plantId}`

Chi tiết theo dõi của 1 cây trồng thuộc quyền sở hữu của người dùng hiện tại (`Authenticated (owner)`).

**Path Parameters:**
- `plantId` (UUID, bắt buộc): Định danh cây trồng. Nếu sai định dạng UUID trả về `400 VALIDATION_ERROR` với `error.field = "plantId"`.

**Quy tắc Ownership:**
- Không tìm thấy cây: `404 RESOURCE_NOT_FOUND`.
- Cây tồn tại nhưng thuộc người dùng khác: `403 FORBIDDEN`.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "plantId": "uuid",
    "displayName": "Cà chua ban công",
    "garden": {
      "id": "uuid",
      "name": "Ban công hướng Đông"
    },
    "species": {
      "id": "uuid",
      "commonName": "Cà chua bi",
      "scientificName": "Solanum lycopersicum",
      "category": "Cây ăn quả"
    },
    "currentHealthStatus": "CRITICAL",
    "plantedAt": "2026-10-01",
    "ageDays": 42,
    "schedulesSummary": {
      "activeCount": 2,
      "dueTodayCount": 1,
      "overdueCount": 1
    },
    "careLogsSummary30d": {
      "unlinkedCompletedLogs": 4,
      "unlinkedSkippedLogs": 1,
      "linkedScheduledCompletedLogs": 6,
      "linkedScheduledSkippedLogs": 2
    },
    "recentActivityTimeline": [
      {
        "id": "uuid",
        "sourceType": "GROWTH_JOURNAL",
        "title": "Nhật ký sâu bệnh",
        "taskType": null,
        "status": null,
        "entryType": "PEST",
        "healthStatus": "NEEDS_ATTENTION",
        "notePreview": "Phát hiện lá vàng nhẹ ở tầng dưới.",
        "occurredAt": "2026-11-12T03:30:00Z"
      },
      {
        "id": "uuid",
        "sourceType": "CARE_LOG_LINKED",
        "title": "Tưới nước • Hoàn thành",
        "taskType": "WATERING",
        "status": "COMPLETED",
        "entryType": null,
        "healthStatus": null,
        "notePreview": "Tưới đều buổi sáng theo lịch.",
        "occurredAt": "2026-11-12T01:00:00Z"
      }
    ],
    "recentJournalObservations": [
      {
        "journalId": "uuid",
        "recordedAt": "2026-11-12T03:30:00Z",
        "entryType": "PEST",
        "healthStatus": "NEEDS_ATTENTION",
        "notePreview": "Phát hiện lá vàng nhẹ ở tầng dưới."
      }
    ],
    "speciesCareGuide": {
      "lightRequirement": "Ánh nắng trực tiếp 6 giờ/ngày",
      "waterRequirement": "Tưới giữ ẩm đều quanh gốc",
      "wateringFrequency": null,
      "temperatureRange": "20-30 độ C",
      "humidityRange": null,
      "soilPh": null,
      "usageAndCaution": "Tránh úng rễ kéo dài."
    },
    "sensorConnected": false,
    "generatedAt": "2026-11-12T04:20:00Z"
  },
  "message": "OK"
}
```

**Ghi chú giới hạn & truy vấn:**
- `recentActivityTimeline`: gộp từ `care_logs` (`CARE_LOG_UNLINKED` / `CARE_LOG_LINKED`) và `growth_journals` (`GROWTH_JOURNAL`), sắp mới nhất trước, tối đa **15** mục; `notePreview` cắt gọn tối đa **160** ký tự.
- `recentJournalObservations`: tối đa **10** ghi nhận `growth_journals` gần nhất.
- Ngân sách truy vấn: cố định **5 queries** khi owner hợp lệ và tối đa **1 query** khi từ chối `403`/`404`.

**Mã trạng thái HTTP:** `200 OK`, `400 VALIDATION_ERROR` (`field: "plantId"`), `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 RESOURCE_NOT_FOUND`, `500 INTERNAL_ERROR`.

---

## 13. Nhóm Cameras — `/api/v1` (G5.5.2a — Phase C1 Metadata CRUD)

> **Ranh giới Phase C1 (`G5.5.2a`):** Chỉ quản lý **metadata** thiết bị camera (`name`, `locationDesc`, `status` ghi nhận thủ công, `connectionNote`). Chưa hỗ trợ xem video trực tiếp RTSP/HLS/WebRTC, chụp snapshot hay kiểm tra kết nối vật lý tới camera. **Không có endpoint thứ 5.**
>
> **Quyền sở hữu & bảo mật:**
> - Toàn bộ 4 endpoint đều yêu cầu JWT (`401 UNAUTHORIZED` nếu thiếu/hết hạn).
> - Kiểm tra tồn tại trước (`404 RESOURCE_NOT_FOUND`), sau đó kiểm tra quyền sở hữu (`owner_id == currentUserId`). Nếu không phải chủ sở hữu — **kể cả `ROLE_ADMIN`** — trả về **`403 FORBIDDEN`**.
> - Không cho phép client chỉ định `ownerId` hay đổi `gardenId` từ request body; response tuyệt đối không trả `ownerId`.
> - Trường `connectionNote` kiểm duyệt nghiêm ngặt ở cả Backend và Frontend: từ chối (`400 VALIDATION_ERROR`, `field: "connectionNote"`) các chuỗi chứa userinfo URI (`rtsp://user:pass@...`, `rtsps://...`, `http(s)://user:pass@...`, `user:@...`) hoặc cặp credential (`password=`, `password:`, `passwd`, `pwd`, `token`, `secret`, `apiKey`, `username`, `Bearer ...`). Không phản hồi lại hay ghi log secret bị từ chối.

### 13.1. `GET /api/v1/gardens/{gardenId}/cameras`

Lấy danh sách metadata camera thuộc một khu vườn của người dùng hiện tại, sắp xếp ổn định theo `createdAt ASC, id ASC`. Trả `200 OK` với mảng rỗng `[]` nếu khu vườn chưa có camera.

**Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "b1a9b8e2-4f4c-4c32-8a7e-9d1c2e3f4a5b",
      "gardenId": "9f6e2d1a-1234-4abc-9def-0123456789ab",
      "name": "Camera Ban Công Đông",
      "locationDesc": "Góc tường hướng Tây Nam nhìn toàn cảnh ban công",
      "status": "OFFLINE",
      "connectionNote": "Đã kiểm tra nguồn điện và cáp mạng",
      "createdAt": "2026-11-12T09:15:00Z",
      "updatedAt": "2026-11-12T09:15:00Z"
    }
  ],
  "message": "OK"
}
```

**Mã trạng thái HTTP:** `200 OK`, `400 VALIDATION_ERROR` (`field: "gardenId"`), `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 RESOURCE_NOT_FOUND`.

### 13.2. `POST /api/v1/gardens/{gardenId}/cameras`

Thêm metadata camera mới vào khu vườn thuộc quyền sở hữu của người dùng hiện tại. Trạng thái khởi tạo **luôn là `OFFLINE`** (bỏ qua nếu client gửi trường ngoài schema như `status`, `ownerId`, `gardenId`).

**Request Body:**
```json
{
  "name": "Camera Ban Công Đông",
  "locationDesc": "Góc tường hướng Tây Nam",
  "connectionNote": "Đã kiểm tra nguồn điện và cáp mạng"
}
```
- `name` (bắt buộc): chuỗi khác rỗng sau khi trim, `1..200` ký tự.
- `locationDesc` (tùy chọn, nullable): chuỗi mô tả vị trí lắp đặt (chuỗi rỗng chuẩn hóa về `null`).
- `connectionNote` (tùy chọn, nullable): ghi chú kết nối thuần văn bản, bị từ chối nếu chứa credential/userinfo.

**Response `201 Created`:** trả `CameraItem` với `status = "OFFLINE"`.

**Mã trạng thái HTTP:** `201 Created`, `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 RESOURCE_NOT_FOUND`.

### 13.3. `PUT /api/v1/cameras/{cameraId}`

Cập nhật từng phần metadata hoặc trạng thái ghi nhận thủ công của camera.
- Nếu không gửi trường hoặc gửi `null`: **giữ nguyên** giá trị cũ.
- Nếu gửi chuỗi rỗng `""` hoặc toàn khoảng trắng cho `locationDesc` / `connectionNote`: **xóa về `null`**.
- Nếu gửi `name`: bắt buộc khác rỗng sau trim và tối đa `200` ký tự (trả `400 VALIDATION_ERROR`, `field: "name"` nếu rỗng/quá dài).
- Nếu gửi `status`: chỉ chấp nhận `ONLINE`, `OFFLINE`, `ERROR` (giá trị sai định dạng enum trả `400 VALIDATION_ERROR`).
- `ownerId` và `gardenId` là bất biến.

**Request Body mẫu:**
```json
{
  "name": "Camera Ban Công Đông (Cập nhật)",
  "status": "ONLINE",
  "locationDesc": "",
  "connectionNote": "Gắn gần ổ cắm hướng Đông"
}
```

**Response `200 OK`:** trả `CameraItem` đã cập nhật.

**Mã trạng thái HTTP:** `200 OK`, `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 RESOURCE_NOT_FOUND`.

### 13.4. `DELETE /api/v1/cameras/{cameraId}`

Xóa vĩnh viễn bản ghi camera. Chỉ xóa bản ghi trong `cameras`; **không** xóa khu vườn, cây trồng, lịch chăm sóc hay nhật ký.

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "message": "Camera đã được xóa."
  },
  "message": "OK"
}
```

**Mã trạng thái HTTP:** `200 OK`, `400 VALIDATION_ERROR` (`field: "cameraId"`), `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 RESOURCE_NOT_FOUND`.

---

## 14. Tổng hợp 46 endpoints chuẩn hóa (40 Core MVP + 2 Monitoring G5.5.1 + 4 Cameras G5.5.2a)

### 14.1. Bảng phân bổ theo nhóm chức năng và trạng thái triển khai

| Nhóm chức năng | Core MVP (G4/G5.4) | G5.5.1 Monitoring (Đã xong) | G5.5.2a Cameras (Đã xong) | Tổng số API |
|---|:---:|:---:|:---:|:---:|
| Authentication (`/api/v1/auth`) | **2** | 0 | 0 | 2 |
| Users Profile (`/api/v1/users`) | **3** | 0 | 0 | 3 |
| Species & Favorites (`/api/v1/species`) | **5** | 0 | 0 | 5 |
| Gardens (`/api/v1/gardens`) | **5** | 0 | 0 | 5 |
| Plants (`/api/v1/plants`) | **8** | 0 | 0 | 8 |
| Schedules (`/api/v1/schedules`) | **6** | 0 | 0 | 6 |
| Care Logs (`/api/v1/care-logs`) | **1** | 0 | 0 | 1 |
| Growth Journals (`/api/v1/journals`) | **3** | 0 | 0 | 3 |
| Monitoring (`/api/v1/monitoring`) | 0 | **2** | 0 | 2 |
| Admin Species (`/api/v1/admin/species`) | **4** | 0 | 0 | 4 |
| Admin Users (`/api/v1/admin/users`) | **3** | 0 | 0 | 3 |
| Cameras (`/api/v1/cameras`) | 0 | 0 | **4** | 4 |
| **Tổng cộng** | **40** | **2 (G5.5.1 Đã xong)** | **4 (G5.5.2a Đã xong)** | **46** |

### 14.2. Danh sách chi tiết endpoints (Đã hoàn thành 46/46 tính tới G5.5.2a)

#### Bảng quy ước định dạng quyền truy cập:
- **`Public`**: Endpoint công khai, không yêu cầu xác thực JWT.
- **`Authenticated`**: Người dùng đã đăng nhập hợp lệ với JWT bearer token.
- **`Authenticated (owner)`**: Người dùng đã đăng nhập VÀ là chủ sở hữu hợp pháp của tài nguyên. Vi phạm trả về `403 Forbidden` (`FORBIDDEN`), tuyệt đối không trả về 404.
- **`ROLE_ADMIN`**: Yêu cầu tài khoản có quyền quản trị viên (`ROLE_ADMIN`).

| # | Method | Endpoint | Quyền truy cập | Phân loại | Trạng thái triển khai |
|---|---|---|---|---|---|
| 1 | POST | `/api/v1/auth/register` | Public | MVP | ✅ Đã triển khai |
| 2 | POST | `/api/v1/auth/login` | Public | MVP | ✅ Đã triển khai |
| 3 | GET | `/api/v1/users/me` | Authenticated | MVP | ✅ Đã triển khai |
| 4 | PUT | `/api/v1/users/me` | Authenticated | MVP | ✅ Đã triển khai |
| 5 | PUT | `/api/v1/users/me/password` | Authenticated | MVP | ✅ Đã triển khai |
| 6 | GET | `/api/v1/species` | Authenticated | MVP | ✅ Đã triển khai |
| 7 | GET | `/api/v1/species/{speciesId}` | Authenticated | MVP | ✅ Đã triển khai |
| 8 | POST | `/api/v1/species/{speciesId}/favorite` | Authenticated | MVP | ✅ Đã triển khai |
| 9 | DELETE | `/api/v1/species/{speciesId}/favorite` | Authenticated | MVP | ✅ Đã triển khai |
| 10 | GET | `/api/v1/species/favorites` | Authenticated | MVP | ✅ Đã triển khai |
| 11 | GET | `/api/v1/gardens` | Authenticated | MVP | ✅ Đã triển khai |
| 12 | POST | `/api/v1/gardens` | Authenticated | MVP | ✅ Đã triển khai |
| 13 | GET | `/api/v1/gardens/{gardenId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 14 | PUT | `/api/v1/gardens/{gardenId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 15 | DELETE | `/api/v1/gardens/{gardenId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 16 | POST | `/api/v1/gardens/{gardenId}/plants` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 17 | GET | `/api/v1/plants` | Authenticated | MVP | ✅ Đã triển khai |
| 18 | GET | `/api/v1/plants/{plantId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 19 | PUT | `/api/v1/plants/{plantId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 20 | DELETE | `/api/v1/plants/{plantId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 21 | GET | `/api/v1/plants/{plantId}/schedules` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 22 | GET | `/api/v1/plants/{plantId}/care-logs` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 23 | GET | `/api/v1/plants/{plantId}/journals` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 24 | POST | `/api/v1/schedules` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 25 | GET | `/api/v1/schedules/today` | Authenticated | MVP | ✅ Đã triển khai |
| 26 | PUT | `/api/v1/schedules/{scheduleId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 27 | DELETE | `/api/v1/schedules/{scheduleId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 28 | POST | `/api/v1/schedules/{scheduleId}/complete` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 29 | POST | `/api/v1/schedules/{scheduleId}/skip` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 30 | POST | `/api/v1/care-logs` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 31 | POST | `/api/v1/journals` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 32 | PUT | `/api/v1/journals/{journalId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 33 | DELETE | `/api/v1/journals/{journalId}` | Authenticated (owner) | MVP | ✅ Đã triển khai |
| 34 | GET | `/api/v1/admin/species` | ROLE_ADMIN | MVP | ✅ Đã triển khai |
| 35 | POST | `/api/v1/admin/species` | ROLE_ADMIN | MVP | ✅ Đã triển khai |
| 36 | PUT | `/api/v1/admin/species/{speciesId}` | ROLE_ADMIN | MVP | ✅ Đã triển khai |
| 37 | DELETE | `/api/v1/admin/species/{speciesId}` | ROLE_ADMIN | MVP | ✅ Đã triển khai |
| 38 | GET | `/api/v1/admin/users` | ROLE_ADMIN | MVP | ✅ Đã triển khai |
| 39 | GET | `/api/v1/admin/users/{userId}` | ROLE_ADMIN | MVP | ✅ Đã triển khai |
| 40 | PATCH | `/api/v1/admin/users/{userId}/status` | ROLE_ADMIN | MVP | ✅ Đã triển khai |
| 41 | GET | `/api/v1/gardens/{gardenId}/cameras` | Authenticated (owner) | G5.5.2a | ✅ Hoàn thành (Backend + Frontend G5.5.2a) |
| 42 | POST | `/api/v1/gardens/{gardenId}/cameras` | Authenticated (owner) | G5.5.2a | ✅ Hoàn thành (Backend + Frontend G5.5.2a) |
| 43 | PUT | `/api/v1/cameras/{cameraId}` | Authenticated (owner) | G5.5.2a | ✅ Hoàn thành (Backend + Frontend G5.5.2a) |
| 44 | DELETE | `/api/v1/cameras/{cameraId}` | Authenticated (owner) | G5.5.2a | ✅ Hoàn thành (Backend + Frontend G5.5.2a) |
| 45 | GET | `/api/v1/monitoring/overview` | Authenticated | G5.5.1 | ✅ Hoàn thành (Backend + Frontend G5.5.1) |
| 46 | GET | `/api/v1/monitoring/plants/{plantId}` | Authenticated (owner) | G5.5.1 | ✅ Hoàn thành (Backend + Frontend G5.5.1) |

> **Phạm vi mở rộng (ngoài 46 endpoints trên):** Các tính năng Camera Live Stream (`Phase C2`), Upload/Storage (`G5.5.2b`), Mã QR (`G5.5.3`), Growth Analytics nâng cao (`G5.5.4`), AI Diagnosis (`G5.5.5`), Push Notifications (`G5.5.6`), Quên mật khẩu (`POST /auth/forgot-password`), Refresh token (`POST /auth/refresh`) và Google/Zalo OAuth nằm ngoài phạm vi G5.5.2a.

---

*Tài liệu này là hợp đồng API chính thức của dự án GoPlant, đã cập nhật đồng bộ tới G5.5.2a — Camera Metadata CRUD (Phase C1).*
