# GoPlant

## Giới thiệu

GoPlant là ứng dụng di động hỗ trợ người dùng khám phá và quản lý cây trồng, khu vườn cùng các hoạt động chăm sóc. Phạm vi sản phẩm được thể hiện trong thiết kế Figma và tài liệu chức năng của dự án.

Repository hiện có giao diện frontend React Native theo Expo SDK 57, được tổ chức bằng Expo Router và TypeScript. Phase 3 đã bổ sung các màn hình và luồng frontend chính; nhiều phần vẫn dùng dữ liệu minh họa hoặc chưa kết nối dịch vụ. Ứng dụng chưa có backend, cơ sở dữ liệu hay xác thực thật.

## Trạng thái công nghệ

Phiên bản khai báo lấy từ `package.json`; phiên bản cài đặt được xác nhận bằng `npm ls` tại thời điểm cập nhật README.

| Công nghệ | Khai báo | Đã cài | Vai trò |
|---|---:|---:|---|
| Expo | `~57.0.31` | `57.0.31` | Nền tảng và công cụ phát triển ứng dụng |
| React | `19.2.3` | `19.2.3` | Xây dựng giao diện theo component |
| React Native | `0.86.3` | `0.86.3` | Giao diện di động đa nền tảng |
| TypeScript | `~6.0.3` | `6.0.3` | Kiểu tĩnh cho mã JavaScript |
| Expo Router | `~57.0.29` | `57.0.29` | Điều hướng theo file trong `src/app/` |
| npm | — | `11.19.1` trên môi trường kiểm tra | Quản lý package; đây không phải phiên bản khóa cho mọi máy |

Các package khác được khai báo trong `package.json`, gồm Expo modules, `react-native-reanimated`, `react-native-svg`, `react-native-safe-area-context` và font Plus Jakarta Sans.

## Giao diện và chức năng hiện có

| Khu vực | Trạng thái trong frontend |
|---|---|
| Chào mừng | Có giao diện và liên kết đến đăng nhập, đăng ký. |
| Đăng nhập | Có mock authentication trong môi trường development (`__DEV__`). Tài khoản demo hợp lệ đưa người dùng đến `/home`; đây không phải xác thực bảo mật và không dùng cho production. |
| Đăng ký | Có biểu mẫu, kiểm tra trường nhập và thông báo lỗi. Tạo tài khoản chưa kết nối backend và không lưu tài khoản. |
| Trang chủ | Có ô tìm kiếm, phím tắt, trạng thái vườn/cây rỗng và nội dung gợi ý. Một số thẻ như thời tiết, lời chào và gợi ý cây là dữ liệu giao diện mẫu. |
| Quản lý cây | Có tìm kiếm, trạng thái rỗng, danh sách cây, yêu thích và thao tác thêm/xem/sửa/xóa frontend. Hồ sơ và yêu thích được giữ trong bộ nhớ ứng dụng trong phiên, không lưu bền vững. |
| Tìm kiếm và bộ lọc | Tìm theo tên trong dữ liệu cục bộ; có nhóm bộ lọc và kết quả tính từ danh mục hiện có. Danh mục hiện chỉ có một số cây mẫu, phần lớn thuộc tính sinh trưởng còn thiếu. |
| Chi tiết cây | Có các khu vực thông tin cơ bản, đặc điểm và điều kiện sinh trưởng. Trường chưa có nguồn dữ liệu hiển thị “Chưa có dữ liệu”; chưa có số đo cảm biến hoặc ngưỡng sức khỏe thực. |
| Quản lý vườn | Có màn hình danh sách, chi tiết và biểu mẫu tạo vườn. Dữ liệu vườn và một số thao tác chỉ phục vụ xem trước, chưa được lưu. |
| Nhật ký | Có danh sách, chi tiết và biểu mẫu nhập/chỉnh sửa. Nội dung là mẫu; biểu mẫu chưa lưu nhật ký vào backend. Camera được hoãn. |
| Lịch chăm sóc | Có danh sách, chi tiết và biểu mẫu tạo lịch. Kiểm tra nhập liệu ở frontend; lịch chưa được lưu và chưa đồng bộ thông báo. |
| Theo dõi | Có giao diện tổng quan và chi tiết. Chưa kết nối cảm biến hoặc nguồn dữ liệu sức khỏe; nội dung hiển thị có thể là dữ liệu mẫu. |

Tài khoản mock development được khai báo trong `src/services/mockAuth.ts`:

| Email | Mật khẩu | Vai trò |
|---|---|---|
| `admin@goplant.test` | `Admin123!` | `admin` |

Thông tin này chỉ dùng để thử giao diện trong development. Không dùng làm thông tin xác thực thật hoặc trong bản production. Tắt mock auth không thay thế cho một hệ thống xác thực an toàn.

### Thông tin cây và dữ liệu

Mô hình hồ sơ có chỗ cho tên cây, tên khoa học, loại cây, vị trí, ngày trồng, ghi chú, điều kiện sinh trưởng và một số đặc tính tham khảo. Danh mục hiện có năm mục Trầu bà với tên thường gọi, tên khoa học và loại cây; các trường sinh trưởng khác chưa được cung cấp.

Hồ sơ cây do người dùng thêm và danh sách yêu thích chỉ lưu trong state của ứng dụng. Chúng mất khi ứng dụng khởi động lại. Các màn hình sức khỏe, chỉ số môi trường, lịch sử đo đạc, cảnh báo và nhật ký chưa có dữ liệu thật hoặc đồng bộ backend.

## Điều hướng

Các route được đặt dưới `src/app/`:

```text
/
├── /auth/login
├── /auth/register
├── /home
├── /gardens
├── /garden/create
├── /garden-detail
├── /plants
├── /garden/add-plant
├── /plant-detail
├── /search
├── /filter
├── /journal
├── /journal/new
├── /journal/edit
├── /journal/detail
├── /schedule
├── /schedule/create
├── /schedule/detail
├── /monitoring
├── /monitoring/detail
└── /explore (màn hình mẫu Expo còn trong project)
```

Các route chi tiết nhận tham số qua Expo Router khi cần. Sự tồn tại của route không đồng nghĩa toàn bộ nghiệp vụ phía sau đã được triển khai.

## Cấu trúc dự án

```text
GOPLANTT/
├── assets/
│   ├── images/                 # Asset ứng dụng và ảnh xuất từ thiết kế
│   └── images/figma/            # Một số asset Figma được dùng trong giao diện
├── design-reference/           # Ảnh tham chiếu các màn hình Figma
├── src/
│   ├── app/                     # Route Expo Router
│   ├── components/              # Component dùng chung và component mẫu Expo
│   ├── constants/theme.ts       # Token màu và kiểu chữ
│   ├── features/                # Giao diện theo nhóm chức năng
│   ├── hooks/                   # Hook dùng chung và hỗ trợ theme
│   ├── services/                # Mock authentication
│   ├── types/                   # Khai báo kiểu bổ sung
│   └── global.css
├── scripts/                     # Script hỗ trợ project
├── app.json                     # Cấu hình Expo
├── package.json                 # Package và script
├── package-lock.json            # Lockfile npm
└── tsconfig.json                # Cấu hình TypeScript
```

Thư mục `android/` và `ios/` hiện không có trong repository. Expo có thể sinh native project theo quy trình cần thiết; không tạo hoặc chỉnh các thư mục này thủ công trong workflow Expo hiện tại.

## Yêu cầu môi trường

### Cài dependencies và chạy Metro

- Node.js và npm.
- Phiên bản đã kiểm tra trong môi trường cập nhật README: Node.js `v24.22.1`, npm `11.19.1`. Project không khai báo trường `engines`, vì vậy đây là phiên bản môi trường kiểm tra, không phải giới hạn bắt buộc cho tất cả máy.

### Chạy trên Android Emulator

- Android SDK, ADB và Android Emulator.
- Một AVD đã được tạo và khởi chạy.
- Android Studio là công cụ để cài đặt/quản lý SDK và AVD. Trạng thái cài trên từng máy cần tự kiểm tra.
- JDK/native build chỉ cần cấu hình phù hợp nếu sử dụng workflow native hoặc Gradle; project hiện chưa có native folders được commit.

## Cài đặt và chạy trên Windows

### 1. Mở PowerShell tại thư mục dự án

```powershell
cd path\to\GOPLANTT
```

### 2. Cài đúng dependency theo lockfile

```powershell
npm.cmd ci
```

### 3. Khởi động Android Emulator

Mở Android Studio, vào **Device Manager** và khởi chạy AVD. Có thể kiểm tra thiết bị bằng:

```powershell
adb devices
```

Emulator cần xuất hiện với trạng thái `device`.

### 4. Khởi chạy Expo/Metro

```powershell
npx.cmd expo start
```

Khi Metro sẵn sàng, nhấn `a` trong terminal để yêu cầu Expo mở ứng dụng trên Android Emulator. Quy trình này chạy ứng dụng trong môi trường phát triển, thường qua Expo Go tương thích; `expo start` không tạo APK. Nếu cần native module không có trong Expo Go thì cần đánh giá development build riêng.

Dừng Metro bằng `Ctrl + C`. Trên PowerShell, dùng `npm.cmd`/`npx.cmd` nếu lệnh không hậu tố bị Execution Policy chặn.

## Kiểm tra

Các lệnh phù hợp với project:

```powershell
npm.cmd ls expo react react-native expo-router typescript --depth=0
npx.cmd tsc --noEmit
npx.cmd expo install --check
npx.cmd expo-doctor
```

Kết quả được xác minh khi cập nhật README:

- `npm.cmd ls expo react-native expo-router typescript --depth=0`: các package chính hiện diện với Expo `57.0.31`, React `19.2.3`, React Native `0.86.3`, Expo Router `57.0.29` và TypeScript `6.0.3`.
- `npx.cmd tsc --noEmit`: hoàn tất thành công.
- `npm.cmd run lint`: chưa chạy được. Script `expo lint` của project cố tự tạo cấu hình ESLint; lệnh đã được dừng để tránh sửa cấu hình ngoài phạm vi README.
- `expo install --check` và Expo Doctor 21/21: kết quả đã được báo cáo ở lần kiểm tra Phase 3 trước đó, không chạy lại trong nhiệm vụ README này.
- Android Emulator: không khởi chạy hoặc kiểm thử UI trong nhiệm vụ này.

## Giới hạn hiện tại và tiến độ

- [x] Khởi tạo frontend bằng Expo SDK 57, React Native và TypeScript.
- [x] Bổ sung các route UI chính cho chào mừng, đăng nhập/đăng ký, trang chủ, cây trồng, vườn, tìm kiếm, nhật ký, lịch và theo dõi.
- [x] Bổ sung mock login development và quản lý cây cục bộ trong phiên.
- [x] Chạy TypeScript và kiểm tra dependency chính khi cập nhật tài liệu.
- [ ] Hoàn thiện dữ liệu nội dung cây, gồm điều kiện sinh trưởng có nguồn xác định.
- [ ] Kết nối lưu trữ/backend/API và xác thực thật.
- [ ] Hoàn thiện các nghiệp vụ vườn, nhật ký, lịch chăm sóc và theo dõi.
- [ ] Đối chiếu toàn bộ giao diện trực tiếp trên Android Emulator với ảnh Figma.
- [ ] Thiết lập ESLint riêng nếu nhóm muốn dùng script lint hiện tại.

Các mục đánh dấu hoàn thành chỉ mô tả phần frontend hoặc kiểm tra đã có bằng chứng; chúng không đồng nghĩa với backend hoặc kiểm thử UI trên thiết bị.

## Bảo trì

Các mục sau là hướng dẫn phát triển:

- Giữ phiên bản package tương thích với Expo SDK đang dùng; ưu tiên `npx expo install <package>` cho package có hỗ trợ Expo.
- Chạy lại kiểm tra TypeScript và tương thích sau khi thay đổi dependency hoặc cấu hình.
- Không commit secret, token hoặc API key. Tài khoản mock trong source không phải bí mật và không được dùng cho production.
- Cập nhật README khi route, quy trình chạy hoặc phạm vi chức năng thay đổi.
