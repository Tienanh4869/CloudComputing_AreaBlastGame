# Hướng dẫn Azure App Configuration cho Attack Damage

## 1. Mục tiêu

ArenaBlast dùng Azure App Configuration để quản lý cấu hình:

```text
Game:AttackDamage = 25
```

Backend tải giá trị này khi khởi động. Quản trị viên có thể thay đổi giá trị
trên Azure và gọi API refresh mà không cần sửa code, build Docker hoặc deploy
lại. Nếu Azure chưa được cấu hình hoặc tạm thời lỗi, game tiếp tục dùng giá trị
mặc định `25` từ biến `ATTACK_DAMAGE`.

Giá trị hợp lệ là số nguyên từ `1` đến `100`. Giá trị sai sẽ bị từ chối và
Backend tiếp tục dùng giá trị hợp lệ gần nhất.

## 2. Những file đã tích hợp

- `backend/src/config/appConfiguration.js`: kết nối, kiểm tra và refresh cấu hình.
- `backend/src/server.js`: tải cấu hình khi Backend khởi động.
- `backend/src/routes/admin.js`: API xem và refresh cấu hình dành cho admin.
- `backend/src/socket/index.js`: gửi đúng damage thực tế đã áp dụng cho đòn đánh.
- `backend/package.json`: thêm Azure App Configuration Provider.
- `.env.example`: khai báo các biến môi trường cần thiết.

## 3. Tạo Azure App Configuration

1. Đăng nhập Azure Portal.
2. Tìm dịch vụ `App Configuration`.
3. Chọn `Create`.
4. Chọn subscription của nhóm.
5. Chọn Resource Group `arenablast-rg`.
6. Nhập tên duy nhất, ví dụ `arenablast-appconfig-123`.
7. Chọn region gần hệ thống hiện tại, ưu tiên `Southeast Asia` nếu Portal hỗ trợ.
8. Chọn pricing tier `Free` cho bài tập.
9. Chọn `Review + create`, sau đó `Create`.

## 4. Tạo cấu hình Attack Damage

1. Mở App Configuration vừa tạo.
2. Chọn `Operations` > `Configuration explorer`.
3. Chọn `Create` > `Key-value`.
4. Nhập chính xác:

```text
Key: Game:AttackDamage
Value: 25
Label: Production
Content type: text/plain (hoặc để trống)
```

5. Chọn `Apply`.

Tên key và label phân biệt chữ hoa chữ thường. `Production` phải giống hệt biến
môi trường của Backend.

## 5. Cấp quyền Managed Identity

### 5.1 Kiểm tra identity của Backend

1. Mở Container App `arenablast-backend`.
2. Chọn `Settings` > `Identity`.
3. Trong `System assigned`, đặt `Status` thành `On`.
4. Chọn `Save` nếu trước đó chưa bật.

Nhóm đã sử dụng Managed Identity cho Key Vault nên nhiều khả năng bước này đã
được bật. Không tạo connection string hoặc đưa access key vào source code.

### 5.2 Cấp quyền đọc App Configuration

1. Quay lại tài nguyên App Configuration.
2. Chọn `Access control (IAM)`.
3. Chọn `Add` > `Add role assignment`.
4. Chọn role `App Configuration Data Reader`.
5. Chọn `Next`.
6. Chọn `Managed identity` > `Select members`.
7. Chọn loại tài nguyên `Container App`.
8. Chọn `arenablast-backend`.
9. Chọn `Review + assign` hai lần.

Azure có thể cần vài phút để quyền mới có hiệu lực.

## 6. Thêm biến môi trường vào Container App

1. Mở `arenablast-backend`.
2. Chọn `Application` > `Containers` hoặc `Revisions and replicas`.
3. Chọn tạo revision mới / edit and deploy.
4. Trong phần Environment variables, thêm:

```text
AZURE_APPCONFIG_ENABLED=true
AZURE_APPCONFIG_ENDPOINT=https://arenablast-appconfig-123.azconfig.io
AZURE_APPCONFIG_LABEL=Production
AZURE_APPCONFIG_REFRESH_INTERVAL_MS=5000
```

Thay endpoint mẫu bằng endpoint ở trang `Overview` của App Configuration.
Endpoint không phải secret nên dùng `Manual entry`. Không nhập connection string.

5. Lưu container và tạo revision mới.

Việc thêm biến môi trường chỉ tạo revision ở lần cấu hình ban đầu. Những lần sau
đổi `Game:AttackDamage` trong App Configuration sẽ không cần revision mới.

## 7. Deploy code

Sau khi push nhánh và merge Pull Request vào `main`, GitHub Actions sẽ:

1. Cài dependency và chạy test.
2. Build Docker image Backend.
3. Push image vào Azure Container Registry.
4. Cập nhật Container App `arenablast-backend`.
5. Chạy health check.

Chỉ bắt đầu kiểm tra khi ba job `Test`, `Build & Push Docker` và `Deploy to
Azure` đều thành công.

## 8. Kiểm tra tích hợp

### 8.1 Xem log khởi động

Mở `arenablast-backend` > `Log stream`. Khi thành công sẽ có log:

```text
[AppConfig] Azure App Configuration connected
```

Log cũng hiển thị key, label và `attackDamage: 25` nhưng không chứa secret.

### 8.2 Lấy token admin

Gọi API đăng nhập bằng tài khoản có role `admin`:

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "<tài-khoản-admin>",
  "password": "<mật-khẩu>"
}
```

Lấy trường `token` trong response và dùng dưới dạng Bearer Token.

### 8.3 Xem cấu hình hiện tại

```http
GET /api/admin/config
Authorization: Bearer <token-admin>
```

Kết quả đúng cần có:

```json
{
  "appConfiguration": {
    "service": "Azure App Configuration",
    "key": "Game:AttackDamage",
    "enabled": true,
    "connected": true,
    "source": "azure-app-configuration",
    "label": "Production",
    "attackDamage": 25
  }
}
```

### 8.4 Refresh sau khi thay đổi

1. Trong Azure Configuration explorer, đổi value từ `25` thành `40`.
2. Chọn `Apply` và chờ ít nhất 5 giây.
3. Gọi:

```http
POST /api/admin/config/refresh
Authorization: Bearer <token-admin>
```

Response phải hiển thị `attackDamage: 40`. Đòn đánh tiếp theo sẽ trừ 40 HP.
Sau khi quay video hoặc chụp minh chứng, đổi value trở lại `25`, chờ 5 giây và
gọi refresh thêm một lần.

## 9. Kịch bản trình bày

1. Mở Configuration explorer, cho thấy `Game:AttackDamage = 25`.
2. Gọi `GET /api/admin/config`, chứng minh Backend đang đọc từ Azure.
3. Vào game và chứng minh một đòn đánh trừ 25 HP.
4. Đổi Azure thành 40 và lưu.
5. Gọi `POST /api/admin/config/refresh`.
6. Đánh lại và chứng minh một đòn trừ 40 HP.
7. Cho thấy Container App không tạo revision mới do thay đổi gameplay setting.
8. Đổi cấu hình về 25 sau khi demo.

Câu trình bày ngắn:

> Nhóm sử dụng Azure App Configuration để quản lý Attack Damage tập trung.
> Backend xác thực bằng Managed Identity, kiểm tra giá trị từ 1 đến 100 và giữ
> mặc định 25 khi Azure lỗi. Quản trị viên thay đổi cân bằng game mà không cần
> sửa code hoặc deploy lại Container App.

## 10. Lỗi thường gặp

### `connected: false`

- Kiểm tra `AZURE_APPCONFIG_ENABLED=true`.
- Kiểm tra endpoint có đúng đuôi `.azconfig.io`.
- Kiểm tra revision mới đang Active.

### HTTP 403 từ Azure

- Managed Identity chưa có role `App Configuration Data Reader`.
- Chờ quyền IAM cập nhật rồi restart revision.

### Không tìm thấy key

- Key phải là `Game:AttackDamage`.
- Label phải là `Production`.
- Không thêm khoảng trắng vào key hoặc label.

### API admin trả 401 hoặc 403

- 401: thiếu hoặc sai Bearer Token.
- 403: tài khoản đăng nhập không có role `admin`.

### Giá trị bị từ chối

Chỉ dùng số nguyên từ 1 đến 100. Các giá trị như `0`, `101`, `25.5` hoặc chữ
sẽ bị từ chối và game giữ giá trị hợp lệ trước đó.
