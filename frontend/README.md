# GoPlant – Frontend Mobile Application

## 1. Giới thiệu

GoPlant là ứng dụng di động hỗ trợ người dùng khám phá và số hóa quản lý không gian xanh, cây trồng, khu vườn cùng các hoạt động chăm sóc.

Mã nguồn Frontend được xây dựng trên nền tảng **React Native 0.86 + Expo SDK 57**, sử dụng **Expo Router** để định tuyến theo cấu trúc file và **TypeScript Strict Mode**.

Sau các lượt hoàn thiện nền tảng **G5.2.1 – G5.2.1.1.4**, tích hợp nghiệp vụ **G5.3 – G5.3.1.2**, **G5.4.1 – G5.4.1.1.2** và **G5.4.2 – G5.4.2.1**, ứng dụng đã hoàn thiện kết nối Backend REST API cho Xác thực, Hồ sơ, Loài cây, Yêu thích, Khu vườn, Cây trồng cá nhân (User Plants) và Lịch chăm sóc (Care Schedules):
- **API Client & Trusted Origin / BaseURL Guard**: Axios Client tập trung với kiểm soát ranh giới nguồn tin cậy (`API_BASE_URL`), từ chối URL thuộc origin bên ngoài, URL protocol-relative (`//...`), URL sai định dạng và `baseURL` override rỗng/không hợp lệ trước khi đọc SecureStore hoặc gửi JWT ra mạng; chuẩn hóa lỗi `AppApiError`, phân định rõ ràng giữa lỗi local (storage, unauthenticated, untrusted URL) và lỗi backend (401, 403, 400, 404, 409, 5xx, timeout, network error).
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
- **Quản lý Server State**: Tích hợp **TanStack React Query v5** quản lý cache (`staleTime: 2 phút` theo `queryClient.ts`), auth-gating chỉ query khi `status === 'authenticated'`, phân lập cache chống rò rỉ dữ liệu giữa các tài khoản, và chính sách retry nghiêm ngặt (chỉ retry network/timeout/5xx tối đa 2 lần).
- **Phân hệ Species, Favorites & Gardens (G5.3)**: Kết nối REST API thật cho thư viện loài cây (`GET /species`, `GET /species/{speciesId}`), danh sách yêu thích (`POST/DELETE /species/{speciesId}/favorite`, `GET /species/favorites`) và CRUD khu vườn (`GET/POST /gardens`, `GET/PUT/DELETE /gardens/{gardenId}`) với phân trang 0-based, đồng bộ cache nhiều cấp, chống race-condition/double-tap khi thả tim, validation enum `SpaceType` và xác nhận cascade delete.
- **Phân hệ User Plants (G5.4.1 – G5.4.1.1.2)**: Kết nối REST API thật cho quản lý cây trồng cá nhân (`GET /api/v1/plants`, `POST /api/v1/gardens/{gardenId}/plants`, `GET/PUT/DELETE /api/v1/plants/{plantId}`): lọc theo từ khóa/`gardenId`/`HealthStatus`, sort allowlist (`displayName`, `createdAt`, `plantedAt`, `healthStatus`), phân trang 0-based, thêm cây chọn khu vườn & loài cây thật từ Backend, chỉnh sửa giữ nguyên khu vườn/loài cây (cho phép xóa trắng field tùy chọn, bỏ qua `plantedAt` rỗng cho Jackson `LocalDate`), hiển thị có điều kiện `plantCode` nếu server trả về, xác nhận cascade delete (`Care Schedules`, `Care Logs`, `Growth Journals`) và đồng bộ cache chéo sang `gardens.*` (`plantCount`, `GardenDetail.plants`) cùng guard tự điều chỉnh phân trang trang cuối không nhảy Empty State giả.
- **Phân hệ Care Schedules (G5.4.2 – G5.4.2.1)**: Kết nối REST API thật cho Lịch chăm sóc (`GET /schedules/today`, `GET /plants/{plantId}/schedules`, `POST/PUT/DELETE /schedules`, `POST /schedules/{scheduleId}/complete`, `POST /schedules/{scheduleId}/skip`), chuẩn múi giờ Việt Nam `Asia/Ho_Chi_Minh`, cơ chế đồng hồ thực `useScheduleClock` (10s định kỳ + boundary timeout đúng mốc đến hạn + theo dõi `AppState` & route focus, tự động mở khóa Hoàn thành/Bỏ qua & cập nhật nhãn `Quá hạn` theo `getScheduleRuntimeState`, tự refetch `/schedules/today` khi quay lại foreground hoặc chuyển ngày VN), payload cập nhật tri-state giữ/xóa trường, xử lý `Complete`/`Skip` + `409 Conflict` + kết thúc `ONCE`/`endDate`, đồng bộ cascade cache với `plants.*`/`gardens.*`, và cô lập phiên đăng nhập xuyên suốt các query/mutation đang pending.
- **Kiểm thử tự động toàn diện**: Bộ kiểm thử **Vitest** (với Axios adapter mock trong `happy-dom`, chưa bao gồm E2E trên máy chủ/Emulator thật) gồm **181 bài test** trên **8 file kiểm thử** bao phủ lưu trữ phiên & schema, trusted origin/`baseURL` & session identity guard, chuẩn hóa lỗi & retry policy, auth flow, Species & Favorites (bao gồm concurrency lock, rollback isolation & owner-scoped placeholder data), Gardens CRUD, User Plants CRUD (bao gồm validation, cache sync chéo, tự điều chỉnh phân trang & bảo vệ trạng thái đồng bộ khi refetch xóa trang cuối), và Care Schedules CRUD/Complete/Skip/Live Clock/AppState/VN Midnight/Cascade/Account Isolation A → B.

Các phân hệ nghiệp vụ kế tiếp (**Lịch sử chăm sóc / Care Logs**, **Nhật ký phát triển / Growth Journals**, Camera/Upload ảnh, AI & Push Notification) vẫn giữ giao diện xem trước và sẽ được triển khai ở các giai đoạn tiếp theo (**G5.4.3**, **G5.5**).

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

| Khu vực | Trạng thái tích hợp (G5.4.2) |
|---|---|
| **Chào mừng** | Giao diện giới thiệu tính năng, điều hướng sang Đăng ký hoặc Đăng nhập. |
| **Đăng nhập** | **Đã kết nối API thật** (`POST /api/v1/auth/login`) qua `useLoginMutation()`. Kiểm tra tài khoản, hiển thị lỗi 401/mạng, lưu JWT an toàn và điều hướng sang Trang chủ. |
| **Đăng ký** | **Đã kết nối API thật** (`POST /api/v1/auth/register`) qua `useRegisterMutation()`. Hỗ trợ đăng ký bằng Email hoặc Số điện thoại (hỗ trợ `email: null`). Xử lý lỗi validation (400) và tài khoản trùng lặp (409). |
| **Trang chủ** | **Đã kết nối API hồ sơ, khu vườn, cây trồng & CTA Lịch chăm sóc** (`GET /api/v1/users/me`, `GET /api/v1/gardens`, `GET /api/v1/plants`). Hiển thị tên/Avatar, *"Vườn của bạn"*, *"Cây trồng của bạn"* và thẻ điều hướng **Lịch hôm nay** (`/schedule`) / **Tạo lịch ngay** (`/schedule/create`) mà không tự gọi `/schedules/today` tại Home hay giả lập Push Notification. Thời tiết giữ xem trước giao diện. |
| **Khôi phục lỗi Đọc / Xóa Storage** | Màn hình `StorageErrorView` với **Thử đọc lại** (`retryLoadSession`) và **Thử xóa lại** (`retryClearSession`), không xóa oan session hoặc đăng xuất giả. |
| **Tìm kiếm & Lọc Loài cây / Cây của tôi** | **Đã kết nối API thật** cho cả tab **Thư viện loài cây** (`GET /api/v1/species`) với nút `＋ Thêm vào cây của tôi` điều hướng `/garden/add-plant?speciesId=...` và tab **Cây của tôi** (`GET /api/v1/plants`) với lọc theo từ khóa, khu vườn, `HealthStatus`, sắp xếp và phân trang 0-based. |
| **Chi tiết cây trồng & Chi tiết loài cây** | **Đã kết nối API thật** (`PlantDetailScreen`): chế độ `plantId` (`GET/DELETE /api/v1/plants/{plantId}`) hiển thị đầy đủ thông tin, `plantCode` có điều kiện, liên kết khu vườn/loài, mục **Lịch chăm sóc của cây** (`GET /api/v1/plants/{plantId}/schedules`, lọc `ScheduleStatus`, phân trang, `＋ Tạo lịch`, `Chi tiết / Sửa`) và xác nhận cascade delete (`Care Schedules`, `Care Logs`, `Growth Journals`); chế độ `speciesId` (`GET /api/v1/species/{speciesId}`) hiển thị sinh thái, yêu thích và CTA thêm cây thật. |
| **Loài cây yêu thích** | **Đã kết nối API thật** (`GET /api/v1/species/favorites`, `POST/DELETE /api/v1/species/{speciesId}/favorite`) hiển thị trong tab **Cây trồng** (`FavoritesSection`) với phân trang và đồng bộ cache tức thì. |
| **Quản lý vườn** | **Đã kết nối API thật** (`GET/POST /api/v1/gardens`, `GET/PUT/DELETE /api/v1/gardens/{gardenId}`): lọc 5 loại `SpaceType`, xem chi tiết + danh sách `plants` bấm mở `/plant-detail?plantId=...`, nút `＋ Thêm cây` mở `/garden/add-plant?gardenId=...`, tạo/sửa (`SpaceType` enum, lỗi 409 `name`), xử lý 403/404 và cascade delete (tự dọn cache cây và lịch của các cây trong vườn). |
| **Cây đang sở hữu (`/plants` & `/garden/add-plant`)** | **Đã kết nối API thật (G5.4.1 – G5.4.1.1.2)**: `PlantsScreen` tải danh sách cây thật (`GET /plants`) với lọc từ khóa, khu vườn, `HealthStatus`, sắp xếp, phân trang, làm mới, lỗi+retry và cascade delete; `AddGardenPlantScreen` hỗ trợ tạo mới (`POST /gardens/{gardenId}/plants` chọn vườn & loài thật từ Backend) và chỉnh sửa (`?editPlantId=...`, `PUT /plants/{plantId}` giữ nguyên vườn/loài). |
| **Lịch chăm sóc (`/schedule`, `/schedule/create`, `/schedule/detail`)** | **Đã kết nối API thật (G5.4.2 – G5.4.2.1)**: `ScheduleScreen` tải `GET /api/v1/schedules/today`, hiển thị tổng số việc hôm nay & quá hạn theo giờ VN, đồng bộ `useScheduleClock` + `getScheduleRuntimeState` tự mở nút Hoàn thành/Bỏ qua và cập nhật nhãn `Quá hạn` / bộ lọc theo thời gian thực cũng như refetch khi resume `AppState`, focus lại route hoặc chuyển ngày `Asia/Ho_Chi_Minh`, thực hiện `Hoàn thành` (`POST /schedules/{id}/complete`) & `Bỏ qua` (`POST /schedules/{id}/skip`) kèm xử lý HTTP 409; `CreateScheduleScreen` tạo lịch mới (`POST /api/v1/schedules`) với cây thật, chu kỳ `CUSTOM` và validation `startDate`/`endDate`/`reminderTime`; `ScheduleDetailScreen` resolve lịch qua `GET /api/v1/plants/{plantId}/schedules` (không gọi `GET /schedules/{id}`), chỉnh sửa tri-state (`PUT /schedules/{id}`), `Tạm ngưng` / `Tiếp tục` / `Hủy (CANCELLED)`, tự cập nhật đến hạn/quá hạn theo đồng hồ thực và `Xóa vĩnh viễn` có cảnh báo bảo toàn Care Logs (`schedule_id = NULL`). |
| **Nhật ký phát triển, Lịch sử chăm sóc & Theo dõi** | Giao diện xem trước (chờ tích hợp API Care Logs & Growth Journals ở **G5.4.3**). |

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

### 4.4. Tích hợp Species, Favorites & Gardens (G5.3)
- **Giao tiếp tập trung & Auth Gating**: Toàn bộ endpoint nghiệp vụ đều đi qua `apiClient` và chỉ tự động fetch trong React Query hooks khi `status === 'authenticated'`:
  - Species & Favorites: `GET /api/v1/species`, `GET /api/v1/species/{speciesId}`, `GET /api/v1/species/favorites`, `POST /api/v1/species/{speciesId}/favorite`, `DELETE /api/v1/species/{speciesId}/favorite`.
  - Gardens: `GET /api/v1/gardens`, `POST /api/v1/gardens`, `GET /api/v1/gardens/{gardenId}`, `PUT /api/v1/gardens/{gardenId}`, `DELETE /api/v1/gardens/{gardenId}`.
- **Phân trang & Sort an toàn**: Chuẩn hóa phân trang 0-based (`page >= 0`, `size` mặc định `20` giới hạn `[1, 100]`), danh sách sort allowlist theo tên thuộc tính JPA (`commonName`, `scientificName`, `category`, `difficulty`, `createdAt`, `updatedAt`, mặc định `commonName,asc`).
- **Đồng bộ Cache & Bảo vệ Race Condition cho Favorites (G5.3.1)**: `useFavoriteToggle()` sử dụng khóa tuần tự toàn ứng dụng (`activeFavoriteOp`) chỉ cho phép một favorite mutation chạy tại một thời điểm (chặn double-tap cùng `speciesId`, từ chối request song song khác `speciesId` bằng mã lỗi `FAVORITE_OPERATION_IN_PROGRESS` mà không trả nhầm Promise, luôn giải phóng khóa trong `finally` kể cả khi lỗi mạng/timeout/5xx/logout) và vô hiệu hóa toàn bộ nút yêu thích khi đang xử lý; đồng bộ cache giữa `species.lists(userId)`, `species.detail(userId, id)` và `species.favoritesAll(userId)`, giữ rollback an toàn và đối chiếu theo server truth khi nhận `409 Conflict` hoặc `404 Not Found`.
- **Phân lập Cache, Placeholder Data & Request Guard theo tài khoản (G5.3.1 – G5.3.1.2)**: Toàn bộ query key của Species, Favorites và Gardens đều gắn namespace `userId`; `useSpeciesList` và `useFavoriteSpecies` sử dụng `placeholderData` ràng buộc theo `cacheOwnerId` (`previousQuery?.queryKey?.[1] === cacheOwnerId`) nên chỉ giữ trang trước khi phân trang/lọc trên cùng tài khoản và trả về `undefined` khi đổi tài khoản hoặc đăng xuất (`__unauthenticated__`); mọi mutation đều capture `ownerUserId` + `sessionGeneration` tại thời điểm khởi tạo và xác minh chủ sở hữu trước khi ghi/rollback cache; `apiClient` kiểm tra `expectedUserId`/`expectedSessionGeneration` trước khi gắn JWT (`SESSION_USER_MISMATCH`) và chặn HTTP 401 trễ từ phiên cũ gây đăng xuất nhầm phiên mới.
- **Mapping & An toàn dữ liệu Gardens**: Sử dụng đúng enum `SpaceType` (`BAN_CONG`, `SAN_THUONG`, `TRONG_NHA`, `SAN_VUON`, `KHAC`) và `HealthStatus` (`HEALTHY`, `NEEDS_ATTENTION`, `CRITICAL`, `UNKNOWN`); validate tên vườn 1–200 ký tự và vị trí trước khi gửi; hiển thị lỗi field `name` từ HTTP 409 trùng tên; xác nhận xóa có cảnh báo cascade xóa cây/lịch/nhật ký và hủy + xóa sạch cache `queryKeys.gardens.detail(userId, gardenId)` sau khi xóa.

### 4.5. Tích hợp Cây trồng cá nhân – User Plants (G5.4.1)
- **Endpoints & Query Keys**: Tích hợp `GET /api/v1/plants`, `POST /api/v1/gardens/{gardenId}/plants`, `GET /api/v1/plants/{plantId}`, `PUT /api/v1/plants/{plantId}`, `DELETE /api/v1/plants/{plantId}` đi qua `apiClient` với auth-gating (`status === 'authenticated'`) và query keys phân lập theo `userId` (`queryKeys.plants.*`).
- **Đồng bộ Contract & Validation**:
  - `POST`: Bắt buộc `gardenId` và `speciesId` thực tế từ Backend, `displayName` không rỗng (`1–200` ký tự), `location <= 200` ký tự, `plantedAt` chuẩn lịch `YYYY-MM-DD`; **không** gửi `healthStatus` khi tạo mới vì Backend tự gán `HEALTHY`.
  - `PUT`: Cho phép cập nhật `displayName` (từ chối rỗng ở client vì Backend bỏ qua chuỗi rỗng), `healthStatus` (`HEALTHY`, `NEEDS_ATTENTION`, `CRITICAL`, `UNKNOWN`), `location`/`note`/`imageUrl` (gửi `""` để xóa giá trị trên Backend), và bỏ qua `plantedAt` khi trống để tránh lỗi parse Jackson `LocalDate`; giữ nguyên vườn và loài cây ở chế độ chỉ đọc.
  - Danh sách (`UserPlantSummaryDto`) không giả lập `location`/`plantedAt`/`note`; chi tiết (`UserPlantDetailDto`) chỉ hiển thị `plantCode` khi server trả về khác rỗng và không giả lập tính năng QR/Camera/AI.
- **Đồng bộ Cache Chéo & An toàn Xóa**: Tạo, sửa và xóa cây tự động đồng bộ `plants.detail`, `plants.list`, `gardens.list` (`plantCount`) và `gardens.detail` (`plants`). Thao tác xóa không optimistic update: bắt buộc xác nhận `Alert.alert` cảnh báo xóa cascade cả **Care Schedules**, **Care Logs** và **Growth Journals**, và gọi `cancelQueries` + `removeQueries` trên `plants.detail` để tránh refetch 404 ngoài ý muốn.
- **Chống rò rỉ theo tài khoản**: `useUserPlantsList` áp dụng `useOwnerScopedPlaceholderData` theo `cacheOwnerId`; mọi mutation kiểm chứng `ownerUserId` + `sessionGeneration` và trạng thái phiên hiện tại trước khi ghi cache hoặc điều hướng/hiển thị lỗi UI; request trễ từ phiên cũ bị `apiClient` chặn với `SESSION_USER_MISMATCH`.

### 4.6. Tích hợp Lịch chăm sóc – Care Schedules (G5.4.2 – G5.4.2.1)
- **Endpoints thực tế & Auth Gating**: Toàn bộ endpoint Care Schedules đi qua `apiClient` và chỉ tự động fetch trong React Query hooks khi `status === 'authenticated'`:
  - Hôm nay: `GET /api/v1/schedules/today`
  - Lịch theo cây: `GET /api/v1/plants/{plantId}/schedules` (hỗ trợ `status?: ScheduleStatus`, `page` 0-based, `size`)
  - Tạo, sửa & xóa vĩnh viễn: `POST /api/v1/schedules`, `PUT /api/v1/schedules/{scheduleId}`, `DELETE /api/v1/schedules/{scheduleId}`
  - Thực thi lượt chăm sóc: `POST /api/v1/schedules/{scheduleId}/complete`, `POST /api/v1/schedules/{scheduleId}/skip` (tự động gửi JSON body `{}` khi không truyền `note`/`performedAt` để phù hợp `@RequestBody(required = false)` phía Spring Boot).
  - Backend **không cung cấp** `GET /api/v1/schedules` tổng hay `GET /api/v1/schedules/{scheduleId}` riêng lẻ; `ScheduleDetailScreen` tra cứu từ cache (`schedules.today` / `plants.schedules`) hoặc scan phân trang `GET /api/v1/plants/{plantId}/schedules` mà tuyệt đối không gọi endpoint không tồn tại.
- **Chuẩn múi giờ Việt Nam (`Asia/Ho_Chi_Minh`)**: Mọi kiểm tra ngày hiện tại (`startDate >= todayVN`, `endDate >= startDate`), định dạng thời gian nhắc kế tiếp (`nextScheduledAt`) và badge quá hạn (`isOverdue`) đều quy đổi nhất quán sang `Asia/Ho_Chi_Minh` thông qua `Intl.DateTimeFormat`, không lệ thuộc múi giờ máy/CI runner.
- **Hợp đồng dữ liệu Tri-State `PUT` & Trạng thái `Complete` / `Skip`**:
  - `buildUpdateSchedulePayload`: bảo toàn giá trị cũ khi field là `undefined`, xóa `taskLabel`/`endDate` khi gửi `null`, reset `reminderTime` về mặc định `08:00:00` khi gửi `null`, và buộc `intervalDays: null` khi `frequency !== 'CUSTOM'`.
  - `Complete` / `Skip`: chỉ khả dụng khi `status === 'ACTIVE'` và `nextScheduledAt <= now` (chặn sẵn ở UI đồng thời xử lý `HTTP 409 Conflict` từ server); chu kỳ `ONCE` hoặc vượt `endDate` sẽ tự chuyển `COMPLETED` và rời khỏi danh sách hôm nay; thao tác `Skip` ghi nhận `CareLogStatus.SKIPPED` ở server nhưng giữ `ScheduleStatus` là `ACTIVE` (hoặc `COMPLETED`), tuyệt đối không gán `SKIPPED` cho lịch hay giả lập danh sách Care Logs.
- **Bảo toàn dữ liệu khi xóa & Đồng bộ Cache chéo**:
  - `DELETE /schedules/{scheduleId}` chỉ thực hiện sau hộp thoại xác nhận nêu rõ Care Logs trước đó vẫn được bảo toàn (`schedule_id = NULL`), ngắt refetch 404 sau khi xóa thành công và làm sạch cache `plants.schedulesBase` & `schedules.today`.
  - Chỉnh sửa/xóa cây (`useUpdatePlantMutation`, `useDeletePlantMutation`) và xóa vườn (`useDeleteGardenMutation`) tự động dọn/invalidate các cache `plants.schedulesBase` và `schedules.today` tương ứng.
- **Chống rò rỉ tài khoản (Account A → B Isolation)**: Query keys phân lập theo `userId` (`queryKeys.schedules.*`, `queryKeys.plants.schedules*`), `usePlantSchedules` dùng `useOwnerAndPlantScopedPlaceholderData` kiểm tra cả `userId` và `plantId`; tất cả mutation hooks lọc trạng thái `isPending`/`error`/`data` theo phiên sở hữu (`ownerUserId` + `sessionGeneration`), đồng thời `ScheduleDetailScreen` & `PlantDetailScreen` gắn `isDeleted`/`deletingSnapshot`/`localSnapshot` theo `userId:sessionGeneration` để không bao giờ khóa hoặc rò rỉ dữ liệu tài khoản trước trên bất kỳ khung hình chuyển đổi nào.
- **Đồng hồ thực, `AppState` & Chuyển ngày VN (`G5.4.2.1`)**: `useScheduleClock` cung cấp `nowMs` với chu kỳ 10 giây + `setTimeout` đúng mốc `nextScheduledAt`/nửa đêm VN khi màn hình active & focused (dọn dẹp toàn bộ timer và `AppState` listener khi blur/background/unmount, không polling mỗi giây); `getScheduleRuntimeState(schedule, nowMs)` tách logic đến hạn/quá hạn khỏi snapshot tĩnh (chỉ `ACTIVE` + timestamp hợp lệ, giữ tối thiểu `isOverdue` từ server, `<=` đến hạn / `<` quá hạn) để tự mở khóa `Complete`/`Skip`, cập nhật nhãn `Quá hạn` & bộ lọc trên `ScheduleScreen`, `ScheduleDetailScreen`, `PlantDetailScreen`, và tự refetch `GET /schedules/today` khi `AppState` trở lại `active`, refocus route qua `ScreenFocusProvider` hoặc qua 00:00 `Asia/Ho_Chi_Minh`.

---

## 5. Cấu trúc thư mục mã nguồn

```text
frontend/
├── assets/                      # Asset hình ảnh và icon SVG
├── src/
│   ├── app/                     # Tuyến điều hướng Expo Router (_layout, index, home, search, filter, plants, gardens, garden-detail, plant-detail, auth/, garden/, schedule/)
│   ├── components/              # UI Component dùng chung
│   ├── constants/theme.ts       # Bảng màu GoPlantColors và GoPlantTypography
│   ├── features/
│   │   ├── auth/                # Phân hệ Xác thực: AuthProvider, authHooks, authService, AuthScreens
│   │   ├── home/                # Trang chủ (HomeScreen, HomeGardensSection, HomePlantsSection) & Tìm kiếm/Lọc (SearchScreens)
│   │   ├── species/             # Phân hệ Loài cây & Yêu thích: speciesTypes, speciesApi, speciesHooks, FavoritesSection
│   │   ├── gardens/             # Phân hệ Khu vườn & Thêm/Sửa cây: gardenTypes, gardenApi, gardenHooks, GardenScreens
│   │   ├── plants/              # Phân hệ Cây trồng cá nhân: plantTypes, plantApi, plantHooks, PlantDetailScreen (& @deprecated PlantDataStore)
│   │   ├── schedule/            # Phân hệ Lịch chăm sóc: scheduleTypes, scheduleApi, scheduleHooks, useScheduleClock, ScheduleScreens
│   │   ├── main/                # Các tab chính (GardensScreen, PlantsScreen, JournalScreen, ScheduleScreen, MonitoringScreen)
│   │   └── ...
│   ├── services/
│   │   ├── api/                 # apiClient, apiConfig, apiError, apiTypes, tokenStorage
│   │   └── query/               # queryClient, queryKeys
│   ├── __tests__/               # Automated Test Suite (Vitest + Axios adapter mock — 181 tests)
│   │   ├── tokenStorage.test.ts         # Lưu trữ an toàn, AuthSession schema & phân loại lỗi (31 tests)
│   │   ├── apiClient.test.ts            # Trusted origin, baseURL guard, session identity guard, interceptor & HTTP 401 (31 tests)
│   │   ├── apiErrorAndRetry.test.ts     # Chuẩn hóa lỗi & chính sách retry (15 tests)
│   │   ├── authFlow.test.tsx            # Khôi phục session, cleanup error, retry, login, logout (12 tests)
│   │   ├── speciesAndFavorites.test.tsx # Species API, Favorites serialization/concurrency, placeholder/account isolation & UI integration (23 tests)
│   │   ├── gardensIntegration.test.tsx  # Gardens API, CRUD cache/account isolation & Home/Main/Garden/AddPlant UI (13 tests)
│   │   ├── userPlantsIntegration.test.tsx # User Plants API, validation, CRUD, UI, cross-cache sync, last-page delete pagination/pending refetch & A→B pending isolation (24 tests)
│   │   ├── schedulesIntegration.test.tsx # Care Schedules API, VN timezone, live clock (`useScheduleClock`, `AppState`, VN midnight), tri-state PUT, Complete/Skip 409, UI overview/create/detail, Plant/Garden cascade cleanup & A→B pending isolation (32 tests)
│   │   └── setup.ts                     # Cấu hình môi trường mock cho Vitest
├── vitest.config.mjs            # Cấu hình Vitest runner (`happy-dom`, alias `@/assets` & `@ -> src`, stub `@/assets/*` require khi test)
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

# 4. Chạy toàn bộ kiểm thử tự động với Vitest (181/181 PASS)
npm.cmd test

# 5. Xác minh cấu hình Expo hợp lệ
npx.cmd expo config --json

# 6. Kiểm tra toàn bộ test Backend Maven (96/96 PASS)
cd E:\GoPlant
.\backend\mvnw.cmd -f backend/pom.xml clean verify
```

---

## 8. Kế hoạch và Lộ trình tiếp theo

- [x] Khởi tạo dự án Expo SDK 57, React Native 0.86, TypeScript Strict.
- [x] Nền tảng API Client (Axios) và chuẩn hóa lỗi nghiệp vụ `AppApiError`.
- [x] Quản lý lưu trữ phiên JWT bằng `expo-secure-store` và in-memory trên Web.
- [x] Tích hợp TanStack React Query v5 với cơ chế cách ly cache và retry nghiêm ngặt.
- [x] Kết nối API Xác thực thật: Đăng ký, Đăng nhập, Lấy hồ sơ cá nhân, Đăng xuất, Route Guard.
- [x] Cấu hình ESLint v9 và hoàn thành kiểm tra chất lượng không lỗi.
- [x] **G5.2.1.1 – G5.2.1.1.4**: Hoàn thiện phân loại lỗi lưu trữ, khôi phục session an toàn, xử lý lỗi xóa token (`storage-cleanup-error`), loại bỏ request `/users/me` trùng lặp, siết chặt Trusted API Origin, từ chối `baseURL` override rỗng/không hợp lệ và chuẩn hóa `AuthSession` schema.
- [x] **G5.3**: Tích hợp Backend REST API cho Loài cây (`Species`), Yêu thích (`Favorites`) và Khu vườn (`Gardens`); phủ 103 tests Vitest frontend.
- [x] **G5.3.1**: Serialize thao tác Favorites chống multi-species rollback race, phân lập Query Cache & Mutation Identity Guard theo `userId` + `sessionGeneration`, bổ sung `SESSION_USER_MISMATCH` guard trong `apiClient`, sửa `HealthStatus` (`CRITICAL`) và mở rộng lên 120 tests Vitest.
- [x] **G5.3.1.2**: Khắc phục rò rỉ `placeholderData` giữa các tài khoản trong `useSpeciesList` / `useFavoriteSpecies` theo `cacheOwnerId` (`previousQuery.queryKey[1]`) và bổ sung 5 regression tests lúc chuyển A → B còn pending (125 tests Vitest).
- [x] **G5.4.1**: Tích hợp hoàn chỉnh Backend REST API cho Cây trồng cá nhân (`User Plants`: danh sách/lọc/phân trang, chi tiết + `plantCode` có điều kiện, tạo mới theo vườn & loài thật, cập nhật & cascade delete, đồng bộ cache chéo với `gardens.*`, phân lập A → B khi pending); đạt 140 tests Vitest.
- [x] **G5.4.1.1**: Khắc phục lỗi phân trang khi xóa cây cuối trang cuối tại `PlantsScreen` (`PageContent`) và `SearchScreen` (`scope="owned"`) với guard `isFetching` / `isPlaceholderData`; bổ sung regression tests đạt 145 tests Vitest.
- [x] **G5.4.1.1.2**: Sửa triệt để race condition khi GET refetch còn pending sau xóa cây trang cuối (`displayTotalPages` / `displayOwnedTotalPages` bảo toàn `Math.max(1, totalPages, page + 1)` và hiển thị trạng thái đồng bộ thay cho Empty State giả khi `totalElements > 0`); bổ sung regression tests đạt 149 tests Vitest.
- [x] **G5.4.2**: Tích hợp hoàn chỉnh Backend REST API cho Lịch chăm sóc (`Care Schedules`: tổng quan `/schedules/today`, lịch theo cây, tạo mới, chi tiết/sửa tri-state `PUT`, `Complete`/`Skip` + `409`, tạm ngưng/tiếp tục/`CANCELLED`/xóa bảo toàn Care Logs, chuẩn giờ VN `Asia/Ho_Chi_Minh`, đồng bộ cascade khi sửa/xóa cây & xóa vườn, cô lập phiên A → B); mở rộng lên 175 tests Vitest trên 8 file.
- [x] **G5.4.2.1**: Sửa triệt để reactivity theo thời gian thực cho trạng thái đến hạn / quá hạn (`useScheduleClock`, `getScheduleRuntimeState`, `ScreenFocusProvider`, xử lý `AppState` resume & chuyển ngày VN `Asia/Ho_Chi_Minh` đồng bộ `GET /schedules/today` trên Overview/Detail/PlantDetail); bổ sung 6 regression tests đạt **181 tests Vitest**.
- [ ] **G5.4.3**: Tích hợp Backend REST API cho Lịch sử chăm sóc (`Care Logs`) và Nhật ký sinh trưởng (`Growth Journals`).
- [ ] **G5.5**: Tích hợp các tính năng nâng cao (Chẩn đoán AI, Camera/Upload ảnh, QR định danh, Thông báo nhắc nhở).
