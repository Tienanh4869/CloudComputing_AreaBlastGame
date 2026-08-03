# GIẢI THÍCH DỊCH VỤ AZURE KEY VAULT TRONG ARENABLAST

## 1. Dịch vụ này là gì?

Azure Key Vault là một dịch vụ đám mây an toàn dùng để bảo vệ và quản lý các thông tin nhạy cảm (secrets) như mật khẩu, chuỗi kết nối (connection strings), chứng chỉ (certificates), và khoá API (API keys). Trong ArenaBlast, dịch vụ này là trung tâm bảo mật tuyệt đối của toàn bộ hệ thống Backend.

## 2. Vì sao ArenaBlast cần dịch vụ này?

Theo tiêu chuẩn bảo mật hiện đại và lưu ý đặc biệt từ Giảng viên: **"Không hardcode secret/API key trong mã nguồn công khai"**.
Nếu nhóm lưu các khoá như Database Password hay Vision API Key trực tiếp vào file `.env` rồi vô tình đẩy lên GitHub, tin tặc có thể lấy cắp để tấn công hệ thống hoặc tiêu sạch tiền trong tài khoản Azure.

Azure Key Vault giúp ArenaBlast:
1. Tách biệt hoàn toàn mã nguồn (Source Code) và thông tin nhạy cảm (Secrets).
2. Mã hoá dữ liệu lưu trữ ở cấp độ phần cứng.
3. Cấp quyền truy cập dựa trên danh tính (Managed Identity) thay vì dùng mật khẩu.
4. Quản lý tập trung mọi thông tin kết nối ở một nơi duy nhất.

## 3. Dịch vụ hoạt động như thế nào?

```text
Backend Khởi động (Container Apps)
        ↓ (Gửi yêu cầu xin cấp secret kèm danh tính Managed Identity)
[Azure Active Directory (Entra ID)]
        ↓ (Xác thực danh tính: Hợp lệ)
[Azure Key Vault] (areablast-kv-123)
        ↓ (Trả về toàn bộ Connection Strings)
Backend bắt đầu kết nối tới Database, Redis, PubSub...
```

Thay vì đọc từ file `.env` cục bộ, Backend của ArenaBlast dùng thư viện `@azure/keyvault-secrets` để tải toàn bộ bí mật từ Key Vault về RAM (bộ nhớ trong) lúc khởi động.

## 4. Các dịch vụ Azure phối hợp

| Dịch vụ | Vai trò |
|---|---|
| Azure Key Vault | Kho lưu trữ bí mật (Vault) an toàn |
| Managed Identity | Định danh cho máy chủ Backend để nó tự động đăng nhập vào Key Vault mà không cần mật khẩu |
| Azure Container Apps | Nơi chạy Backend, được gắn Managed Identity |
| Tất cả các dịch vụ khác | (Đều có Key kết nối được cất giữ trong Key Vault) |

## 5. Cách hệ thống quyết định ai được lấy Secret

Hệ thống sử dụng cơ chế **RBAC** (Role-Based Access Control) của Azure.
Chỉ những ứng dụng hoặc người dùng được cấp quyền **Key Vault Secrets User** mới có thể đọc được bí mật. Vì Backend Container Apps đã được cấp quyền này, nó có thể tự do lấy các key mà không cần bất kỳ dòng code mật khẩu nào.

## 6. Các Secret được lưu trữ

Trong Key Vault của ArenaBlast, nhóm đã lưu các secret quan trọng sau:
- `SERVICE-BUS-CONNECTION-STRING`
- `WEB-PUBSUB-CONNECTION-STRING`
- `CONTENT-SAFETY-KEY`, `CONTENT-SAFETY-ENDPOINT`
- `AZURE-VISION-KEY`
- `LOGIC-APP-WEBHOOK-URL`
- `JWT-SECRET`

## 7. Những phần code chính

| File | Nhiệm vụ |
|---|---|
| `backend/src/config/env.js` | Chứa logic kết nối Key Vault qua hàm `loadKeyVaultSecrets()` bằng thư viện `@azure/identity` |
| `backend/src/server.js` | Gọi hàm tải secret từ Key Vault *trước khi* khởi động máy chủ Express và kết nối Database |

## 8. Cách chứng minh dịch vụ đã hoạt động

1. Mở file mã nguồn `env.js` và `server.js` cho Giảng viên xem, chứng minh không có bất kỳ dòng code hardcode `password` hay `connection string` nào.
2. Mở Log Analytics của Container Apps, chỉ ra dòng log lúc khởi động: `[KeyVault] Successfully loaded AZURE-VISION-KEY`, `[KeyVault] Successfully loaded WEB-PUBSUB-CONNECTION-STRING`...
3. Mở giao diện Azure Key Vault trên Portal, vào mục Secrets và cho xem danh sách các Key đang được lưu an toàn.

## 9. Cách trình bày ngắn gọn

> Để tuân thủ tuyệt đối quy tắc bảo mật không hardcode API Key, nhóm em đã sử dụng Azure Key Vault làm "két sắt" trung tâm. Máy chủ Backend được cấp một danh tính điện tử (Managed Identity). Mỗi khi khởi động, Backend sẽ tự động mang thẻ căn cước này đến gõ cửa Key Vault để lấy các chuỗi kết nối Database, Redis, PubSub... về bộ nhớ đệm. Nhờ vậy, source code trên GitHub của nhóm hoàn toàn "sạch sẽ" và không bao giờ lo bị lộ mật khẩu.

## 10. Kết luận

Azure Key Vault là minh chứng cho việc nhóm không chỉ biết cách "gọi API cho chạy được", mà còn biết áp dụng các tiêu chuẩn bảo mật (Security Best Practices) cấp độ doanh nghiệp vào hệ thống thực tế.
