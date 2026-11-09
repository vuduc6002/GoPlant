# GoPlant – Frontend Mobile Application

## 1. Giới thiệu

GoPlant là ứng dụng di động hỗ trợ người dùng khám phá và số hóa quản lý không gian xanh, cây trồng, khu vườn cùng các hoạt động chăm sóc.

Mã nguồn Frontend được xây dựng trên nền tảng **React Native + Expo SDK 57**, sử dụng **Expo Router** để định tuyến theo cấu trúc file và **TypeScript Strict Mode**.

Ở phiên bản **G5.2.1**, ứng dụng đã hoàn thiện nền tảng kết nối Backend REST API:
- **API Client**: Axios Client tập trung với bộ chuẩn hóa lỗi `AppApiError` và tự động gắn JWT Bearer token.
- **Xác thực thật**: Tích hợp các API `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `GET /api/v1/users/me`. Hệ thống Mock Auth (`mockAuth.ts`) đã được loại bỏ hoàn toàn.
- **Bảo mật phiên đăng nhập**: Sử dụng `expo-secure-store` phần cứng trên Android/iOS.
- **Quản lý Server State**: Tích hợp **TanStack React Query v5** quản lý cache hồ sơ người dùng, phân lập cache chống rò rỉ dữ liệu giữa các tài khoản, và chính sách retry nghiêm ngặt.
- **Bảo vệ điều hướng**: Tự động chặn truy cập route nghiệp vụ khi chưa xác thực và chuyển hướng an toàn.

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
| Expo SecureStore | `~57.0.4` | Lưu trữ Access Token an toàn trên thiết bị |
| ESLint | `^9.39.5` | Phân tích cú pháp và chất lượng mã nguồn |

---

## 3. Giao diện và trạng thái tích hợp

| Khu vực | Trạng thái tích hợp G5.2.1 |
|---|---|
| **Chào mừng** | Giao diện giới thiệu tính năng, điều hướng sang Đăng ký hoặc Đăng nhập. |
| **Đăng nhập** | **Đã kết nối API thật** (`POST /api/v1/auth/login`) qua `useLoginMutation()`. Kiểm tra tài khoản, hiển thị lỗi 401/mạng, lưu JWT an toàn và điều hướng sang Trang chủ. |
| **Đăng ký** | **Đã kết nối API thật** (`POST /api/v1/auth/register`) qua `useRegisterMutation()`. Hỗ trợ đăng ký bằng Email hoặc Số điện thoại. Xử lý lỗi validation (400) và tài khoản trùng lặp (409). |
| **Trang chủ** | **Đã kết nối API hồ sơ thật** (`GET /api/v1/users/me`) qua `useUserProfile()`. Hiển thị tên người dùng và chữ cái đại diện trên Avatar. Nhấn vào Avatar để xem thông tin và **Đăng xuất**. |
| **Quản lý cây** | Giao diện danh mục, danh sách cây và trạng thái cục bộ (chờ tích hợp API ở G5.4). |
| **Tìm kiếm & Lọc** | Tìm kiếm theo danh mục cục bộ mẫu (chờ tích hợp API Species ở G5.3). |
| **Quản lý vườn** | Giao diện danh sách và chi tiết vườn (chờ tích hợp API Gardens ở G5.3). |
| **Nhật ký** | Giao diện danh sách và tạo nhật ký xem trước (chờ tích hợp API Growth Journals ở G5.4). |
| **Lịch chăm sóc** | Giao diện lịch biểu xem trước (chờ tích hợp API Care Schedules ở G5.4). |
| **Theo dõi** | Giao diện chỉ số sinh thái xem trước. |

---

## 4. Kiến trúc Xác thực, Bảo mật JWT và Quản lý Cache

### 4.1. Quản lý JWT và Giới hạn Web Storage
- **Android / iOS (Thiết bị chính)**: Sử dụng `expo-secure-store` lưu trữ chuỗi mã hóa phiên trên Keystore/Keychain phần cứng. Quá trình nạp phiên có kiểm tra schema dữ liệu nghiêm ngặt và phân biệt rạch ròi giữa lỗi dữ liệu hỏng (tự động xóa) với lỗi I/O phần cứng (ném lỗi kiểm soát).
- **Nền tảng Web**: Để ngăn chặn hoàn toàn rủi ro tấn công XSS đánh cắp JWT lâu dài, ứng dụng **tuyệt đối không sử dụng `window.localStorage`** để lưu Access Token. Trên môi trường Web, phiên được lưu tạm thời trong RAM (in-memory) phục vụ mục đích kiểm thử/demo và sẽ tự giải phóng khi tải lại trang hoặc đóng tab.

### 4.2. TanStack React Query và Cách ly Cache
- **Phân lập Cache giữa các tài khoản**: Khi đăng xuất hoặc khi người dùng mới đăng nhập, hệ thống tự động hủy các truy vấn đang thực thi (`cancelQueries()`) và làm sạch toàn bộ cache (`clearQueryCache()`), ngăn ngừa triệt để việc lộ dữ liệu người dùng cũ cho người dùng mới trên cùng thiết bị.
- **Chính sách Retry nghiêm ngặt**:
  - Chỉ cho phép thử lại (tối đa 2 lần) khi gặp: Lỗi kết nối mạng (`isNetworkError`), Lỗi timeout (`TIMEOUT_ERROR`), hoặc Lỗi máy chủ HTTP 5xx.
  - Tuyệt đối không retry các lỗi 4xx (`400 Validation`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`), lỗi cú pháp hoặc lỗi ứng dụng.
- **Hook đồng bộ**:
  - `useLoginMutation()`: Quản lý mutation đăng nhập và trạng thái `isPending`.
  - `useRegisterMutation()`: Quản lý mutation đăng ký và trạng thái `isPending`.
  - `useUserProfile()`: Query hồ sơ người dùng theo query key chuẩn `['user', 'me']`, chỉ kích hoạt khi đã xác thực.

### 4.3. Xử lý HTTP 401 và Khôi phục Phiên (Session Restore)
- **Quy trình khởi động**: Trạng thái ban đầu là `initializing`. Ứng dụng đọc session từ SecureStore và xác minh tính hợp lệ của token qua `GET /api/v1/users/me`. Nếu token hết hạn (401), session bị xóa và chuyển về `unauthenticated`. Nếu gặp lỗi mạng hoặc máy chủ ngoại tuyến, session offline vẫn được giữ lại để người dùng không bị văng khỏi ứng dụng.
- **Xử lý 401 tập trung**: Khi một API được bảo vệ trả về 401, Axios Interceptor phát tín hiệu tới AuthProvider để thực hiện đăng xuất an toàn, làm sạch cache và đưa về màn hình Đăng nhập một lần duy nhất, không gây vòng lặp điều hướng.

---

## 5. Cấu trúc thư mục mã nguồn

```text
frontend/
├── assets/                      # Asset hình ảnh và icon SVG
├── src/
│   ├── app/                     # Tuyến điều hướng Expo Router (_layout, index, home, auth/...)
│   ├── components/              # UI Component dùng chung
│   ├── constants/theme.ts       # Bảng màu GoPlantColors và Typography
│   ├── features/
│   │   ├── auth/                # Phân hệ Xác thực: AuthProvider, hooks, service, screens
│   │   ├── home/                # Trang chủ (HomeScreen)
│   │   ├── gardens/             # Phân hệ Khu vườn (UI Prototype)
│   │   ├── plants/              # Phân hệ Cây trồng & PlantDataStore
│   │   └── ...
│   ├── services/
│   │   ├── api/                 # apiClient, apiConfig, apiError, apiTypes, tokenStorage
│   │   └── query/               # queryClient, queryKeys
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
cd E:\GoPlant\backend
.\mvnw.cmd spring-boot:run
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

# 2. Kiểm tra kiểu tĩnh TypeScript
npm.cmd run typecheck

# 3. Phân tích mã nguồn với ESLint
npm.cmd run lint
```

---

## 8. Kế hoạch và Lộ trình tiếp theo

- [x] Khởi tạo dự án Expo SDK 57, React Native 0.86, TypeScript Strict.
- [x] Nền tảng API Client (Axios) và chuẩn hóa lỗi nghiệp vụ `AppApiError`.
- [x] Quản lý lưu trữ phiên JWT bằng `expo-secure-store` và in-memory trên Web.
- [x] Tích hợp TanStack React Query v5 với cơ chế cách ly cache và retry nghiêm ngặt.
- [x] Kết nối API Xác thực thật: Đăng ký, Đăng nhập, Lấy hồ sơ cá nhân, Đăng xuất, Route Guard.
- [x] Cấu hình ESLint v9 và hoàn thành kiểm tra chất lượng không lỗi.
- [ ] **G5.3**: Tích hợp Backend REST API cho Loài cây (Species, Favorites) và Khu vườn (Gardens).
- [ ] **G5.4**: Tích hợp Backend REST API cho Cây trồng (User Plants), Lịch chăm sóc (Schedules) và Nhật ký sinh trưởng (Growth Journals).
- [ ] **G5.5**: Tích hợp các tính năng nâng cao (Chẩn đoán AI, Camera, Thông báo nhắc nhở).
