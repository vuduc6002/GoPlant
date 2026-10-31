# Hợp Đồng REST API — GoPlant

> **Phiên bản:** 1.0.0  
> **Giai đoạn:** 3 — Thiết kế dữ liệu và hợp đồng API  
> **Nhánh:** `feature/integrate-frontend-report`  
> **Ngày cập nhật:** 2026-10-31  
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

**Query Parameters:** `keyword`, `gardenId`, `healthStatus`, `page`, `size`, `sort`

**Response 200:** Danh sách phân trang với các trường tóm tắt.

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

**Query Parameters:** `status` (PENDING/COMPLETED/…), `page`, `size`

**Response 200:** Danh sách phân trang.

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

Danh sách lịch cần thực hiện hôm nay của tất cả cây (của người dùng hiện tại).

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "scheduleId": "uuid",
      "plantName": "Cà Chua Cherry",
      "gardenName": "Ban Công Tầng 3",
      "taskType": "WATERING",
      "taskLabel": null,
      "nextScheduledAt": "2026-10-31T08:00:00Z",
      "isOverdue": false,
      "status": "PENDING"
    }
  ]
}
```

---

### PUT `/api/v1/schedules/{scheduleId}`

Cập nhật lịch.

**Request Body:** Tương tự POST, trừ `userPlantId` (không đổi được).

**Response 200:** Trả về schedule đã cập nhật.

---

### DELETE `/api/v1/schedules/{scheduleId}`

Xóa lịch chăm sóc.

**Response 200:**
```json
{ "success": true, "data": { "message": "Lịch chăm sóc đã được xóa." } }
```

---

### POST `/api/v1/schedules/{scheduleId}/complete`

Đánh dấu hoàn thành 1 lần thực hiện lịch. Tự động tính `next_scheduled_at` theo `frequency`. Tạo 1 bản ghi `care_logs`.

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
    "scheduleStatus": "PENDING",
    "nextScheduledAt": "2026-11-01T08:00:00Z"
  }
}
```

---

### POST `/api/v1/schedules/{scheduleId}/skip`

Bỏ qua lần thực hiện này. Tạo care_log với `status = SKIPPED`. Cũng tính lại `next_scheduled_at`.

**Request Body (tùy chọn):**
```json
{ "note": "Hôm nay không ở nhà." }
```

**Response 201:** Tương tự `/complete`.

---

## 8. Nhóm Care Logs — `/api/v1/care-logs`

### POST `/api/v1/care-logs`

Ghi nhận chăm sóc thủ công (không cần lịch trước — ad-hoc).

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

Danh sách tài khoản người dùng. Phân trang.

**Query Parameters:** `keyword`, `status`, `role`, `page`, `size`

### GET `/api/v1/admin/users/{userId}`

Hồ sơ đầy đủ của 1 người dùng.

### PATCH `/api/v1/admin/users/{userId}/status`

Kích hoạt hoặc khoá tài khoản.

**Request Body:**
```json
{ "status": "BANNED", "reason": "Vi phạm điều khoản." }
```

**Response 200:**
```json
{ "success": true, "data": { "userId": "uuid", "newStatus": "BANNED" } }
```

---

## 12. Nhóm Cameras — `/api/v1` *(Backlog)*

> Các endpoint này là **Backlog** — chưa triển khai ở Giai đoạn 3.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/v1/gardens/{gardenId}/cameras` | Danh sách camera trong vườn |
| POST | `/api/v1/gardens/{gardenId}/cameras` | Thêm camera |
| PUT | `/api/v1/cameras/{cameraId}` | Cập nhật camera |
| DELETE | `/api/v1/cameras/{cameraId}` | Xóa camera |

---

## 13. Tổng hợp endpoint

| # | Method | Endpoint | Auth | Phân loại |
|---|---|---|---|---|
| 1 | POST | `/auth/register` | Public | MVP |
| 2 | POST | `/auth/login` | Public | MVP |
| 3 | GET | `/users/me` | User | MVP |
| 4 | PUT | `/users/me` | User | MVP |
| 5 | PUT | `/users/me/password` | User | MVP |
| 6 | GET | `/species` | User | MVP |
| 7 | GET | `/species/{id}` | User | MVP |
| 8 | POST | `/species/{id}/favorite` | User | MVP |
| 9 | DELETE | `/species/{id}/favorite` | User | MVP |
| 10 | GET | `/species/favorites` | User | MVP |
| 11 | GET | `/gardens` | User | MVP |
| 12 | POST | `/gardens` | User | MVP |
| 13 | GET | `/gardens/{id}` | User | MVP |
| 14 | PUT | `/gardens/{id}` | User | MVP |
| 15 | DELETE | `/gardens/{id}` | User | MVP |
| 16 | GET | `/plants` | User | MVP |
| 17 | POST | `/gardens/{id}/plants` | User | MVP |
| 18 | GET | `/plants/{id}` | User | MVP |
| 19 | PUT | `/plants/{id}` | User | MVP |
| 20 | DELETE | `/plants/{id}` | User | MVP |
| 21 | GET | `/plants/{id}/schedules` | User | MVP |
| 22 | GET | `/plants/{id}/care-logs` | User | MVP |
| 23 | GET | `/plants/{id}/journals` | User | MVP |
| 24 | POST | `/schedules` | User | MVP |
| 25 | GET | `/schedules/today` | User | MVP |
| 26 | PUT | `/schedules/{id}` | User | MVP |
| 27 | DELETE | `/schedules/{id}` | User | MVP |
| 28 | POST | `/schedules/{id}/complete` | User | MVP |
| 29 | POST | `/schedules/{id}/skip` | User | MVP |
| 30 | POST | `/care-logs` | User | MVP |
| 31 | POST | `/journals` | User | MVP |
| 32 | PUT | `/journals/{id}` | User | MVP |
| 33 | DELETE | `/journals/{id}` | User | MVP |
| 34 | GET | `/admin/species` | Admin | MVP |
| 35 | POST | `/admin/species` | Admin | MVP |
| 36 | PUT | `/admin/species/{id}` | Admin | MVP |
| 37 | DELETE | `/admin/species/{id}` | Admin | MVP |
| 38 | GET | `/admin/users` | Admin | MVP |
| 39 | GET | `/admin/users/{id}` | Admin | MVP |
| 40 | PATCH | `/admin/users/{id}/status` | Admin | MVP |
| 41 | GET | `/gardens/{id}/cameras` | User | Backlog |
| 42 | POST | `/gardens/{id}/cameras` | User | Backlog |
| 43 | PUT | `/cameras/{id}` | User | Backlog |
| 44 | DELETE | `/cameras/{id}` | User | Backlog |

**Tổng: 40 MVP + 4 Backlog = 44 endpoints**

---

*Tài liệu này là hợp đồng API Giai đoạn 3. Triển khai thực tế sẽ thực hiện ở Giai đoạn 4.*
