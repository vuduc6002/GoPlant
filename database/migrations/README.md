# Flyway Database Migrations

Các script migration cơ sở dữ liệu chính thức được quản lý tập trung và thực thi bởi Flyway từ classpath chuẩn của Spring Boot Backend:

📂 **Đường dẫn chính thức:**  
[`backend/src/main/resources/db/migration/`](../../backend/src/main/resources/db/migration/)

- `V1__initial_schema.sql`: Khởi tạo 11 bảng, khóa ngoại kép bảo vệ sở hữu dữ liệu, CHECK constraints, GIN indexes và seed data chuẩn (roles, 5 giống cây).

> [!NOTE]  
> Nhằm tránh rủi ro lệch đồng bộ giữa hai bản sao SQL độc lập, toàn bộ mã nguồn migration được duy trì tại một vị trí duy nhất tại thư mục resources của Backend.
