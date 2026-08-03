# GIẢI THÍCH DỊCH VỤ AZURE WEB PUBSUB TRONG ARENABLAST

## 1. Dịch vụ này là gì?

Azure Web PubSub là dịch vụ nhắn tin thời gian thực (Real-time Messaging) được quản lý toàn diện trên đám mây, sử dụng công nghệ WebSockets. Trong ArenaBlast, nhóm sử dụng dịch vụ này (gói Standard_S1) làm xương sống để kết nối và đồng bộ toạ độ, trạng thái giữa tất cả các người chơi trong một trận đấu.

## 2. Vì sao ArenaBlast cần dịch vụ này?

Với một game sinh tồn nhiều người chơi, Backend phải xử lý truyền toạ độ (x, y), hướng súng, lượng máu liên tục 30 lần/giây (30 FPS) cho mỗi người chơi. Nếu server Node.js tự xử lý toàn bộ các kết nối WebSocket này:
- CPU và RAM của máy chủ sẽ quá tải ngay lập tức.
- Băng thông mạng bị thắt nút cổ chai gây giật lag.

Azure Web PubSub giúp ArenaBlast:
1. Gánh 100% tải quản lý kết nối WebSocket (Lên tới hàng ngàn người).
2. Tách rời (Decouple) máy chủ Backend khỏi kết nối mạng của Client.
3. Đồng bộ toạ độ game siêu tốc (độ trễ < 20ms).
4. Phân loại người chơi vào các "Group" (tương ứng với các phòng chơi/Lobby).

## 3. Dịch vụ hoạt động như thế nào?

```text
Người chơi A (Client)
        ↓ (WebSocket tới Web PubSub)
[Azure Web PubSub] (Phân phối tin nhắn theo Group/Phòng)
        ↓
Người chơi B, C, D (Nhận toạ độ của A ngay lập tức)

(Backend chỉ đứng ngoài theo dõi hoặc nhận sự kiện từ Web PubSub khi cần)
```

Client kết nối trực tiếp đến Azure qua URL an toàn được Backend cấp phép:
```text
wss://arenablast-pubsub.webpubsub.azure.com/client/hubs/arenablast_hub
```

## 4. Các dịch vụ Azure phối hợp

| Dịch vụ | Vai trò |
|---|---|
| Azure Web PubSub | Giao tiếp thời gian thực, truyền toạ độ |
| Azure Key Vault | Lưu trữ an toàn Chuỗi kết nối (Connection String) của PubSub |
| Azure App Service | Máy chủ cấp phát Token truy cập (Access Token) cho người chơi |
| Azure Cache for Redis | Lưu trữ danh sách ai đang ở phòng nào để đối chiếu |

## 5. Cách hệ thống cấp quyền kết nối an toàn

Hệ thống không cho phép Client kết nối tuỳ tiện. Quy trình:
1. Client gửi yêu cầu `GET /api/negotiate`.
2. Backend kiểm tra người dùng hợp lệ, dùng SDK của Azure để tạo ra một `Client Access URL` có kèm Token hết hạn trong 1 giờ.
3. Client dùng URL đó để kết nối thẳng tới Azure Web PubSub.

## 6. Kết quả trả về

### Cấp phép kết nối

Backend trả về HTTP `200`:

```json
{
  "url": "wss://arenablast-pubsub.webpubsub.azure.com/client/hubs/arenablast_hub?access_token=eyJhb..."
}
```

## 7. Những phần code chính

| File | Nhiệm vụ |
|---|---|
| `backend/src/socket/index.js` | Tích hợp Web PubSub Server, quản lý sự kiện kết nối/ngắt kết nối |
| `frontend/src/hooks/useSocket.js` | Client gọi API lấy Token và kết nối WebSockets tới Azure |
| `backend/src/config/env.js` | Đọc `WEB-PUBSUB-CONNECTION-STRING` từ Key Vault |

## 8. Cách chứng minh dịch vụ đã hoạt động

1. Mở Console trình duyệt (F12) -> tab Network -> lọc `WS` (WebSocket). Sẽ thấy kết nối báo `101 Switching Protocols` trực tiếp tới tên miền `webpubsub.azure.com`.
2. Di chuyển nhân vật ở cửa sổ 1, cửa sổ 2 thấy nhân vật di chuyển ngay lập tức mà Backend CPU không hề tăng cao.
3. Vào Azure Portal, phần Metrics của `arenablast-pubsub` thấy biểu đồ *Connection Count* và *Outbound Traffic* nhảy lên khi có người chơi.

## 9. Cách trình bày ngắn gọn

> Thay vì để máy chủ tự gồng gánh kết nối mạng, nhóm em dùng Azure Web PubSub làm trạm trung chuyển. Người chơi sẽ giao tiếp trực tiếp với Azure để đồng bộ toạ độ 30 hình/giây. Máy chủ Backend chỉ đóng vai trò cấp thẻ bài (Token) để người chơi được quyền bước vào phòng game. Việc uỷ thác này giúp game không bị giật lag và Server không bao giờ bị nghẽn băng thông.

## 10. Kết luận

Dịch vụ này là trái tim của trò chơi. Nó thể hiện kiến trúc thiết kế Realtime chuẩn doanh nghiệp, cho phép game scale lên hàng ngàn người chơi mà không cần thay đổi code máy chủ.
