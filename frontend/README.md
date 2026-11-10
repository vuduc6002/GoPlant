# GoPlant – Frontend Mobile Application

## 1. Giới thiệu

GoPlant là ứng dụng di động hỗ trợ người dùng khám phá và số hóa quản lý không gian xanh, cây trồng, khu vườn cùng các hoạt động chăm sóc.

Mã nguồn Frontend được xây dựng trên nền tảng **React Native 0.86 + Expo SDK 57**, sử dụng **Expo Router** để định tuyến theo cấu trúc file và **TypeScript Strict Mode**.

Sau các lượt nâng cấp **G5.2.1**, **G5.2.1.1**, **G5.2.1.1.2** và **G5.2.1.1.3**, ứng dụng đã hoàn thiện nền tảng kết nối Backend REST API và bảo mật phiên:
- **API Client & Trusted Origin Boundary**: Axios Client tập trung với kiểm soát ranh giới nguồn tin cậy (`API_BASE_URL`), từ chối URL thuộc origin bên ngoài, URL protocol-relative (`//...`) và URL sai định dạng trước khi đọc SecureStore hoặc gửi JWT ra mạng; chuẩn hóa lỗi `AppApiError`, phân định rõ ràng giữa lỗi local (storage, unauthenticated, untrusted URL) và lỗi backend (401, 403, 400, 5xx, timeout, network error).
- **Phân loại endpoint chuẩn xác**: Cơ chế phân loại thống nhất cho relative path và absolute URL cùng backend origin; endpoint công khai (`/auth/login`, `/auth/register`) và cờ `skipAuth: true` được lưu giữ xuyên suốt cả Request và Response Interceptor; 401 từ nguồn ngoài hoặc public route tuyệt đối không kích hoạt đăng xuất.
- **Xác thực thật**: Tích hợp các API `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `GET /api/v1/users/me`. Hệ thống Mock Auth đã được loại bỏ hoàn toàn.
- **Bảo mật phiên đăng nhập (Storage Hardening & Recovery)**:
  - Sử dụng `expo-secure-store` với cơ chế bảo vệ dữ liệu do nền tảng hệ điều hành cung cấp (Android Keystore / iOS Keychain tùy hỗ trợ thiết bị).
  - Kiểm định chặt schema `AuthSession`: `accessToken`, `tokenType`, `savedAt` (số dương hữu hạn), `expiresIn` (tùy chọn `number`, không chấp nhận `null`), `user.id` (`string`), `user.fullName`, `user.roles` (mảng chuỗi không rỗng), `user.email` (`string | null`, bắt buộc tồn tại trường `email`; không có `refreshToken` hay `username`).
  - Phân loại lỗi `StorageError`: `STORAGE_UNAVAILABLE`, `READ_FAILED`, `WRITE_FAILED`, `DELETE_FAILED`.
  - Phân tách cơ chế xử lý và Retry độc lập:
    - Khi lỗi đọc (`READ_FAILED`): chuyển trạng thái `storage-error`, giữ nguyên dữ liệu, hiển thị nút **Thử đọc lại** (`retryLoadSession`).
    - Khi lỗi xóa (`DELETE_FAILED`): chuyển trạng thái `storage-cleanup-error`, xóa dữ liệu trong bộ nhớ và cache, hiển thị nút **Thử xóa lại** (`retryClearSession`), tuyệt đối không tự ý chuyển về màn hình đăng nhập bình thường khi session chưa được xóa.
- **An toàn Request API**: Request Interceptor tự động ngăn chặn việc gửi request được bảo vệ khi SecureStore gặp lỗi đọc, không kích hoạt logout 401 giả.
- **Loại bỏ trùng lặp Request Profile**: React Query đóng vai trò nguồn dữ liệu duy nhất cho `GET /api/v1/users/me`, loại bỏ hoàn toàn tình trạng gọi 2 request profile song song khi đăng nhập.
- **Quản lý Server State**: Tích hợp **TanStack React Query v5** quản lý cache hồ sơ người dùng (`staleTime: 2 phút` theo `queryClient.ts`), phân lập cache chống rò rỉ dữ liệu giữa các tài khoản, và chính sách retry nghiêm ngặt (chỉ retry network/timeout/5xx tối đa 2 lần).
- **Kiểm thử tự động toàn diện**: Bộ kiểm thử **Vitest** với **79 bài test** trên 4 file kiểm thử bao phủ lưu trữ phiên & schema, trusted origin & interceptor, chuẩn hóa lỗi & retry policy, và auth flow.

Các phân hệ nghiệp vụ tiếp theo (Loài cây, Khu vườn, Cây trồng, Lịch chăm sóc, Nhật ký) hiện tại vẫn giữ giao diện xem trước và sẽ lần lượt được tích hợp REST API từ Giai đoạn G5.3+.

---

## 2. Trạng thái công nghệ

| Công nghệ | Phiên bản | Vai trò |
|---|---|---|
| Expo SDK | `~57.0.32` | Nền tảng và công cụ phát triển ứng dụng di động |
| React | `19.2.3` | Thư viện xây dựng giao diện theo component |
| React Native | `0.86.3` | Framework ứng dụng di động đa nền tảng |
| TypeScript | `~6.0.3` | Hệ thống kiểu tĩnh nghiêm ngặt (Strict Mode) |
| Expo Router | `~57.0.30` | Điều hướng file-based routing (`src/app/`) |
| Axios | `^1.21.0` | HTTP Client, Request/Response Interceptors |
| TanStack React Query | `^5.107.1` | Quản lý Server State, Caching, Retry & Mutations |
| Expo SecureStore | `~57.0.4` | Lưu trữ Access Token an toàn theo cơ chế nền tảng cung cấp |
| Vitest | `^5.1.0` | Framework kiểm thử tự động (Unit & Integration Tests) |
| ESLint | `^9.39.5` | Phân tích cú pháp và chất lượng mã nguồn |

---

## 3. Giao diện và trạng thái tích hợp

| Khu vực | Trạng thái tích hợp G5.2.1.1.3 |
|---|---|
| **Chào mừng** | Giao diện giới thiệu tính năng, điều hướng sang Đăng ký hoặc Đăng nhập. |
| **Đăng nhập** | **Đã kết nối API thật** (`POST /api/v1/auth/login`) qua `useLoginMutation()`. Kiểm tra tài khoản, hiển thị lỗi 401/mạng, lưu JWT an toàn và điều hướng sang Trang chủ. |
| **Đăng ký** | **Đã kết nối API thật** (`POST /api/v1/auth/register`) qua `useRegisterMutation()`. Hỗ trợ đăng ký bằng Email hoặc Số điện thoại (hỗ trợ `email: null`). Xử lý lỗi validation (400) và tài khoản trùng lặp (409). |
| **Trang chủ** | **Đã kết nối API hồ sơ thật** (`GET /api/v1/users/me`) qua `useUserProfile()`. Hiển thị tên người dùng và chữ cái đại diện trên Avatar. Nhấn vào Avatar để xem thông tin và **Đăng xuất**. |
| **Khôi phục lỗi Đọc Storage** | Màn hình `StorageErrorView` với nút **Thử đọc lại** (`retryLoadSession`) khi SecureStore gặp sự cố đọc tạm thời, bảo vệ dữ liệu người dùng không bị xóa oan. |
| **Khôi phục lỗi Xóa Storage** | Màn hình `StorageErrorView` với nút **Thử xóa lại** (`retryClearSession`) khi việc xóa session khỏi thiết bị thất bại, không đăng xuất giả. |
| **Quản lý cây** | Giao diện danh mục, danh sách cây và trạng thái cục bộ (chờ tích hợp API ở G5.4). |
| **Tìm kiếm & Lọc** | Tìm kiếm theo danh mục cục bộ mẫu (chờ tích hợp API Species ở G5.3). |
| **Quản lý vườn** | Giao diện danh sách và chi tiết vườn (chờ tích hợp API Gardens ở G5.3). |
| **Nhật ký** | Giao diện danh sách và tạo nhật ký xem trước (chờ tích hợp API Growth Journals ở G5.4). |
| **Lịch chăm sóc** | Giao diện lịch biểu xem trước (chờ tích hợp API Care Schedules ở G5.4). |
| **Theo dõi** | Giao diện chỉ số sinh thái xem trước. |

---

## 4. Kiến trúc Xác thực, Bảo mật JWT và Quản lý Cache

### 4.1. Quản lý JWT, Schema AuthSession và Giới hạn Web Storage
- **Android / iOS (Thiết bị chính)**: Sử dụng `expo-secure-store` lưu trữ chuỗi phiên dựa trên cơ chế bảo vệ do nền tảng hệ điều hành cung cấp (Android Keystore / iOS Keychain tùy theo khả năng hỗ trợ của thiết bị).
  - Hợp đồng dữ liệu `AuthSession`:
    - `accessToken` (`string` không rỗng), `tokenType` (`string` không rỗng), `savedAt` (`number` dương hữu hạn), `expiresIn` (optional `number` dương hữu hạn; `undefined` hợp lệ, `null` bị từ chối).
    - `user` (`AuthUserSummary`): `id` (`string` không rỗng), `fullName` (`string` không rỗng), `email` (`string | null`, bắt buộc tồn tại thuộc tính để đồng bộ contract và hỗ trợ tài khoản SĐT có `email: null`), `roles` (mảng `string` không rỗng). Không sử dụng `refreshToken` hay `username` trong contract hiện tại.
  - Phân loại lỗi `StorageError`: `STORAGE_UNAVAILABLE`, `READ_FAILED`, `WRITE_FAILED`, `DELETE_FAILED`.
  - Phân biệt rõ lỗi dữ liệu JSON/schema hỏng (tự dọn dẹp) với lỗi I/O từ lớp lưu trữ nền tảng (giữ nguyên dữ liệu, chuyển trạng thái `storage-error` và cung cấp nút Thử đọc lại).
  - Lỗi khi xóa session (`DELETE_FAILED`): chuyển trạng thái `storage-cleanup-error`, xóa bộ nhớ đệm và cung cấp nút Thử xóa lại, ngăn chặn việc báo đăng xuất thành công khi session vẫn còn trên máy.
- **Nền tảng Web**: Để ngăn chặn hoàn toàn rủi ro tấn công XSS đánh cắp JWT lâu dài, ứng dụng **tuyệt đối không sử dụng `window.localStorage` hoặc `sessionStorage`** để lưu Access Token. Trên môi trường Web, phiên được lưu tạm thời trong RAM (in-memory) phục vụ mục đích kiểm thử/demo và sẽ tự giải phóng khi tải lại trang hoặc đóng tab.

### 4.2. Ranh giới tin cậy URL (Trusted Origin) & An toàn Request Interceptor
- **Kiểm soát Trusted Origin**: Mọi request đi qua `apiClient` đều được kiểm định thông qua một nguồn logic thống nhất dựa trên origin của `API_BASE_URL`:
  - Chấp nhận relative path hợp lệ (như `/auth/login`, `/api/v1/auth/login`, `/users/me`) và absolute URL có cùng scheme, host, port với `API_BASE_URL`.
  - Từ chối ngay lập tức (`UNTRUSTED_API_URL`) trước khi đọc SecureStore hay gọi mạng đối với mọi URL trỏ sang origin bên ngoài (`https://evil.com/...`), URL protocol-relative (`//evil.com/...`), scheme không phải HTTP/HTTPS (`javascript:`, `ftp://`), hoặc URL sai định dạng.
- **Phân loại Endpoint công khai & `skipAuth`**: Chỉ cho phép bỏ qua JWT với endpoint tin cậy khớp chính xác `/auth/login`, `/auth/register` (sau chuẩn hóa prefix `/api/v1`, bỏ query/hash và dot-segments) hoặc request có cờ `skipAuth: true`.
- **Bảo vệ chống rò rỉ & chống 401 giả**:
  - Endpoint ngoài origin không bao giờ gọi `getAccessToken()` hay gắn `Authorization` header.
  - Endpoint được bảo vệ: nếu SecureStore gặp lỗi đọc, request bị hủy ngay lập tức, không gửi request ra mạng và không phát sinh sự kiện logout 401 giả.
  - Chỉ khi nhận mã HTTP 401 thật từ máy chủ backend tin cậy trên endpoint yêu cầu bảo vệ thì hệ thống mới kích hoạt luồng tự động đăng xuất; 401 từ public route hoặc external origin tuyệt đối không kích hoạt logout.

### 4.3. Loại bỏ trùng lặp Request Profile & Cách ly Cache
- **Loại bỏ request GET `/users/me` trùng**: Khi đăng nhập, hồ sơ được nạp và quản lý độc quyền qua React Query cache (`queryKeys.user.me`), không gọi API trực tiếp song song.
- **Thời gian Cache**: Cấu hình `staleTime: 2 phút` (`1000 * 60 * 2`) trong [queryClient.ts](src/services/query/queryClient.ts), giúp tránh các cuộc gọi lại API không cần thiết khi người dùng chuyển tab.
- **Phân lập Cache giữa các tài khoản**: Khi đăng xuất hoặc khi người dùng mới đăng nhập, hệ thống tự động hủy các truy vấn đang thực thi (`cancelQueries()`) và làm sạch toàn bộ cache (`clearQueryCache()`), ngăn ngừa triệt để việc lộ dữ liệu người dùng cũ cho người dùng mới trên cùng thiết bị.
- **Chính sách Retry nghiêm ngặt**:
  - Chỉ cho phép thử lại (tối đa 2 lần) khi gặp: Lỗi kết nối mạng (`isNetworkError`), Lỗi timeout (`TIMEOUT_ERROR`), hoặc Lỗi máy chủ HTTP 5xx.
  - Tuyệt đối không retry các lỗi 4xx (`400 Validation`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`), `StorageError`, lỗi cú pháp hoặc lỗi ứng dụng.

---

## 5. Cấu trúc thư mục mã nguồn

```text
frontend/
├── assets/                      # Asset hình ảnh và icon SVG
├── src/
│   ├── app/                     # Tuyến điều hướng Expo Router (_layout, index, home, auth/...)
│   ├── components/              # UI Component dùng chung
│   ├── constants/theme.ts       # Bảng màu GoPlantColors và GoPlantTypography
│   ├── features/
│   │   ├── auth/                # Phân hệ Xác thực: AuthProvider, hooks, service, screens
│   │   ├── home/                # Trang chủ (HomeScreen)
│   │   ├── gardens/             # Phân hệ Khu vườn (UI Prototype)
│   │   ├── plants/              # Phân hệ Cây trồng & PlantDataStore
│   │   └── ...
│   ├── services/
│   │   ├── api/                 # apiClient, apiConfig, apiError, apiTypes, tokenStorage
│   │   └── query/               # queryClient, queryKeys
│   ├── __tests__/               # Automated Test Suite (Vitest)
│   │   ├── tokenStorage.test.ts # Kiểm thử lưu trữ an toàn, AuthSession schema & phân loại lỗi (31 tests)
│   │   ├── apiClient.test.ts    # Kiểm thử trusted origin, request interceptor, route match & HTTP 401 (21 tests)
│   │   ├── apiErrorAndRetry.test.ts # Kiểm thử chuẩn hóa lỗi & chính sách retry (15 tests)
│   │   ├── authFlow.test.tsx    # Kiểm thử khôi phục session, cleanup error, retry, login, logout (12 tests)
│   │   └── setup.ts             # Cấu hình môi trường mock cho Vitest
├── vitest.config.mjs            # Cấu hình Vitest runner
├── eslint.config.js             # Cấu hình Flat Config ESLint v9
├── app.json                     # Cấu hình ứng dụng Expo SDK 57
├── package.json                 # Khai báo dependency và scripts
├── tsconfig.json                # Cấu hình TypeScript Strict Mode
└── .env.example                 # Mẫu khai báo biến môi trường
```

---

## 6. Cấu hình Môi trường và API Base URL

Ứng dụng cấu hình API Base URL thông qua biến môi trường `EXPO_PUBLIC_API_BASE_URL` trong file `frontend/.env` (tham khảo `frontend/.env.example`):

- **Expo Web / Localhost**: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1`
- **Android Emulator**: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080/api/v1`
- **Thiết bị thật qua mạng LAN**: `EXPO_PUBLIC_API_BASE_URL=http://<IP_LAN_MAY_TINH>:8080/api/v1`

---

## 7. Hướng dẫn Khởi động và Kiểm tra

### 7.1. Khởi động Backend Spring Boot:
```powershell
cd E:\GoPlant
.\backend\mvnw.cmd -f backend/pom.xml spring-boot:run
```

### 7.2. Khởi động Frontend Expo:
```powershell
cd E:\GoPlant\frontend
npm.cmd install
npx.cmd expo start
```
- Nhấn `a` trong terminal để mở trên Android Emulator.
- Nhấn `w` để mở trên Web trình duyệt.

### 7.3. Các lệnh kiểm tra chất lượng mã nguồn:
```powershell
# 1. Kiểm tra tính tương thích Expo Modules
npx.cmd expo install --check

# 2. Kiểm tra kiểu tĩnh TypeScript (0 errors)
npm.cmd run typecheck

# 3. Phân tích mã nguồn với ESLint (0 errors)
npm.cmd run lint

# 4. Chạy toàn bộ kiểm thử tự động với Vitest (79/79 PASS)
npm.cmd test

# 5. Xác minh cấu hình Expo hợp lệ
npx.cmd expo config --json

# 6. Kiểm tra toàn bộ test Backend Maven (96/96 PASS)
cd E:\GoPlant
.\backend\mvnw.cmd -f backend/pom.xml test
```

---

## 8. Kế hoạch và Lộ trình tiếp theo

- [x] Khởi tạo dự án Expo SDK 57, React Native 0.86, TypeScript Strict.
- [x] Nền tảng API Client (Axios) và chuẩn hóa lỗi nghiệp vụ `AppApiError`.
- [x] Quản lý lưu trữ phiên JWT bằng `expo-secure-store` và in-memory trên Web.
- [x] Tích hợp TanStack React Query v5 với cơ chế cách ly cache và retry nghiêm ngặt.
- [x] Kết nối API Xác thực thật: Đăng ký, Đăng nhập, Lấy hồ sơ cá nhân, Đăng xuất, Route Guard.
- [x] Cấu hình ESLint v9 và hoàn thành kiểm tra chất lượng không lỗi.
- [x] **G5.2.1.1 – G5.2.1.1.3**: Hoàn thiện phân loại lỗi lưu trữ, khôi phục session an toàn, xử lý lỗi xóa token (`storage-cleanup-error`), loại bỏ request `/users/me` trùng lặp, siết chặt Trusted API Origin & `AuthSession` schema, ổn định test Maven CI và phủ 79 tests Vitest frontend.
- [ ] **G5.3**: Tích hợp Backend REST API cho Loài cây (Species, Favorites) và Khu vườn (Gardens).
- [ ] **G5.4**: Tích hợp Backend REST API cho Cây trồng (User Plants), Lịch chăm sóc (Schedules) và Nhật ký sinh trưởng (Growth Journals).
- [ ] **G5.5**: Tích hợp các tính năng nâng cao (Chẩn đoán AI, Camera, Thông báo nhắc nhở).
