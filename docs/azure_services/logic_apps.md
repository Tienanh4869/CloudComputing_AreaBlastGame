# GIẢI THÍCH DỊCH VỤ AZURE LOGIC APPS TRONG ARENABLAST

## 1. Dịch vụ này là gì?

Azure Logic Apps là một nền tảng đám mây (PaaS) giúp tạo và chạy các luồng công việc (workflows) tự động hóa mà không cần phải viết code (No-Code/Low-Code) hoặc viết rất ít code. Dịch vụ này cung cấp hàng trăm "đầu nối" (Connectors) để liên kết với các ứng dụng khác. Trong ArenaBlast, nhóm dùng Logic Apps để tự động hóa quy trình Gửi Email Chào Mừng cho người chơi mới.

## 2. Vì sao ArenaBlast cần dịch vụ này?

Nếu muốn gửi email từ máy chủ Node.js Backend, thông thường chúng ta phải cài đặt thư viện (như `nodemailer`), lập trình cấu hình máy chủ SMTP, xử lý lỗi khi rớt mạng, và lưu trữ mật khẩu email ngay trong code. Việc này tốn thời gian, khó bảo trì và dễ sinh lỗi kẹt luồng (blocking).

Azure Logic Apps giúp ArenaBlast:
1. Gửi email chuyên nghiệp thông qua đầu nối Office 365 Outlook mà không cần cấu hình SMTP phức tạp.
2. Thiết kế logic bằng giao diện trực quan (Visual Designer) trên trình duyệt.
3. Không cần lưu mật khẩu email trong source code của Backend.
4. Tách rời hoàn toàn tác vụ gửi thư (vốn chậm chạp) ra khỏi luồng xử lý API đăng ký (vốn cần phản hồi cực nhanh).

## 3. Dịch vụ hoạt động như thế nào?

```text
Người chơi mới đăng ký tài khoản trên Game
        ↓ (Hoàn tất lưu DB thành công)
Backend kích hoạt Webhook của Logic Apps (HTTP POST)
kèm theo tham số { "email": "...", "username": "..." }
        ↓ (Backend trả kết quả cho Client và kết thúc)

[Azure Logic Apps - Đang chạy ngầm độc lập]
        ↓ (Nhận HTTP Request)
Đầu nối Office 365 phân tích dữ liệu
        ↓ (Lấy địa chỉ email và tên)
Gửi thư chào mừng tự động vào hòm thư người chơi
```

## 4. Các dịch vụ Azure phối hợp

| Dịch vụ | Vai trò |
|---|---|
| Azure Logic Apps | Nhận Webhook và điều phối luồng công việc gửi thư |
| Azure Key Vault | Lưu trữ bảo mật URL Webhook của Logic Apps (`LOGIC-APP-WEBHOOK-URL`) |
| Azure App Service | Máy chủ Backend kích hoạt Webhook khi có người đăng ký |

## 5. Cách hệ thống kết nối và xác thực

Quy trình bảo mật của Webhook Logic Apps được thực hiện qua **SAS Token** (Shared Access Signature). 
Đường link URL mà Azure cung cấp chứa sẵn các tham số `sp` (permissions), `sv` (version), và `sig` (signature). Backend chỉ cần gửi request dạng `POST` đến URL này là đủ quyền kích hoạt quy trình mà không cần phải đăng nhập. Để đảm bảo link không bị lộ, nhóm đã nhét đường link dài ngoằng này vào Key Vault.

## 6. Kết quả trả về

### Phản hồi từ Logic Apps cho Backend

Vì đây là Webhook kích hoạt sự kiện ngầm, Logic Apps sẽ lập tức trả về mã HTTP `202 Accepted` cho Backend ngay khi nhận được tín hiệu, biểu thị rằng nó đã ghi nhận và sẽ xử lý gửi thư sau. 

### Kết quả tới Người chơi

Người chơi sẽ nhận được một bức thư có cấu trúc:
- **Tiêu đề:** Welcome to Area Blast!
- **Nội dung:** Chào mừng `<username>` đã đăng ký tài khoản thành công tại Area Blast...

## 7. Những phần code chính

| File | Nhiệm vụ |
|---|---|
| (Azure Portal) | Nơi thực hiện kéo-thả Workflow Designer, không có file code |
| `backend/src/routes/auth.js` | Hàm `POST /register`, dùng lệnh `fetch()` để gọi Webhook của Logic App |
| `backend/src/config/env.js` | Đọc biến môi trường `LOGIC_APP_WEBHOOK_URL` từ Key Vault |

## 8. Cách chứng minh dịch vụ đã hoạt động

1. Mở trang đăng ký tài khoản của game.
2. Điền thông tin đăng ký, đặc biệt mục `email` phải **nhập chính xác email thật của Giảng viên hoặc người demo**.
3. Bấm đăng ký. Chờ khoảng vài giây.
4. Mở hòm thư Email (Inbox) của địa chỉ email vừa nhập, sẽ thấy ngay một bức thư chào mừng tự động.
5. Lên Azure Portal -> Vào `arenablast-logic` -> Xem mục **Run history** sẽ thấy xuất hiện một giao dịch vừa báo `Succeeded`.

## 9. Cách trình bày ngắn gọn

> Thay vì phải tự viết code gửi email phức tạp trên máy chủ, nhóm em đã sử dụng Azure Logic Apps để làm tự động hoá. Tụi em chỉ cần kéo thả 2 khối lệnh trên màn hình Azure: Một khối nhận tín hiệu, một khối gửi email. Khi có ai đó tạo tài khoản, máy chủ game chỉ việc gõ cửa Webhook của Logic Apps, gửi cho nó cái tên và email, rồi bỏ đi làm việc khác. Logic Apps sẽ tự động lấy thông tin đó ghép vào một mẫu thư rồi dùng Outlook bắn đi cho người chơi. Giải pháp này cực kỳ gọn gàng và không làm chậm quá trình đăng ký của game.

## 10. Kết luận

Azure Logic Apps là minh chứng cho việc tận dụng các giải pháp Low-Code/No-Code của đám mây để giải quyết nhanh chóng các luồng công việc phụ trợ, giúp đội ngũ phát triển tiết kiệm tối đa thời gian tập trung vào logic cốt lõi của trò chơi.
