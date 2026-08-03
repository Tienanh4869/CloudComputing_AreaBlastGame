# Azure App Configuration - `Game:MapRotation`

## 1. Mục đích

`Game:MapRotation` quản lý danh sách map được phép sử dụng cho **phòng game mới**.

```text
ice_map.json                    → Chỉ map băng
fire_map.json                   → Chỉ map lửa
ice_map.json,fire_map.json      → Chọn ngẫu nhiên một trong hai map
```

Quản trị viên có thể thay đổi rotation trên Azure mà không cần sửa code hoặc deploy lại. Phòng đang tồn tại giữ nguyên map; chỉ phòng tạo sau khi refresh dùng cấu hình mới.

## 2. Những file đã sửa

```text
backend/src/config/appConfiguration.js
backend/src/config/__tests__/appConfiguration.test.js
backend/src/game/GameManager.js
backend/src/game/__tests__/GameManager.test.js
.env.example
```

Frontend không cần sửa vì đã nhận `mapUrl`, `mapWidth`, `mapHeight` và `mapTheme` từ backend qua Socket.IO.

## 3. Tạo cấu hình trên Azure

1. Mở resource **arenablast-appconfig-123**.
2. Chọn **Operations → Configuration explorer**.
3. Chọn **Create → Key-value**.
4. Nhập chính xác:

```text
Key: Game:MapRotation
Value: ice_map.json,fire_map.json
Label: Production
Content type: để trống
```

5. Nhấn **Apply**.

Không cần tạo dịch vụ Azure mới, không cần thêm biến môi trường mới. Backend tiếp tục dùng:

```text
AZURE_APPCONFIG_ENABLED=true
AZURE_APPCONFIG_ENDPOINT=https://arenablast-appconfig-123.azconfig.io
AZURE_APPCONFIG_LABEL=Production
AZURE_APPCONFIG_REFRESH_INTERVAL_MS=5000
```

Managed Identity của `arenablast-backend` phải có role **App Configuration Data Reader** trên resource App Configuration. Nếu `Game:AttackDamage` đang hoạt động thì phần này thường đã đúng.

## 4. Đẩy code và deploy

Mở Git Bash tại thư mục dự án đã sửa:

```bash
cd "/c/Users/Thu Trang/Documents/Codex/2026-07-29/gia-2/CloudComputing_AreaBlastGame-MapRotation-FINAL"

git status
git add .env.example backend/src/config/appConfiguration.js backend/src/config/__tests__/appConfiguration.test.js backend/src/game/GameManager.js backend/src/game/__tests__/GameManager.test.js docs/AZURE_APP_CONFIGURATION_MAP_ROTATION_VI.md
git commit -m "feat: add Azure map rotation configuration"
git push origin tt
```

Tạo Pull Request từ `tt` sang `main`, chờ job **Test** xanh rồi merge. Sau khi merge, chờ tiếp:

```text
Build & Push Docker
Deploy to Azure
```

## 5. Lấy token admin trong Git Bash

Thay `MAT_KHAU_CUA_BAN` bằng mật khẩu thật:

```bash
API="https://arenablast-backend.icyhill-22f427c6.southeastasia.azurecontainerapps.io/api"

LOGIN=$(curl -sS -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  --data '{"username":"ttrang","password":"MAT_KHAU_CUA_BAN"}')

TOKEN=$(printf '%s' "$LOGIN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token||""))')

echo "Do dai token: ${#TOKEN}"
```

## 6. Kiểm tra cấu hình

```bash
curl -sS "$API/admin/config" \
  -H "Authorization: Bearer $TOKEN"

echo
```

Kết quả cần có:

```json
{
  "connected": true,
  "mapRotation": ["ice_map.json", "fire_map.json"],
  "mapRotationSource": "azure-app-configuration",
  "lastError": null
}
```

## 7. Demo map băng

Trên Azure, sửa key `Game:MapRotation`:

```text
Value: ice_map.json
Label: Production
```

Nhấn **Apply**, đợi 6 đến 10 giây rồi chạy:

```bash
curl -sS -X POST "$API/admin/config/refresh" \
  -H "Authorization: Bearer $TOKEN"

echo
```

Kết quả phải có:

```json
"changed": true,
"mapRotation": ["ice_map.json"]
```

Tạo **phòng hoàn toàn mới** và vào game. Phòng mới phải hiển thị map băng.

## 8. Demo map lửa

Trên Azure đổi value thành:

```text
fire_map.json
```

Nhấn **Apply**, đợi 6 đến 10 giây rồi gọi lại API refresh. Kết quả phải có:

```json
"mapRotation": ["fire_map.json"]
```

Tạo một phòng mới khác. Phòng đó phải hiển thị map lửa. Phòng cũ, nếu vẫn tồn tại, vẫn giữ map băng.

## 9. Khôi phục sau demo

Đổi value trên Azure về:

```text
ice_map.json,fire_map.json
```

Đợi 6 đến 10 giây rồi gọi refresh thêm một lần.

## 10. Lỗi thường gặp

```text
mapRotationSource = application-default
→ Key chưa tồn tại hoặc label không phải Production.

403 Forbidden
→ Tài khoản chưa có role admin.

404 Not Found
→ Code mới chưa được deploy lên backend.

503 hoặc lastError có unsupported map
→ Value chứa tên khác ice_map.json hoặc fire_map.json.

changed = false
→ Giá trị không đổi hoặc gọi refresh trước khi hết 5 giây.

Map trong phòng không đổi
→ Đây là hành vi đúng đối với phòng cũ; phải tạo phòng mới để kiểm tra.
```

## 11. Câu trình bày

> Nhóm dùng Azure App Configuration để điều khiển `Game:MapRotation`. Khi quản trị viên thay đổi danh sách map trên Azure và refresh backend, các phòng mới sử dụng rotation mới mà không cần sửa code hoặc deploy lại. Phòng đang chơi giữ nguyên map để bảo đảm ổn định tọa độ và va chạm.
