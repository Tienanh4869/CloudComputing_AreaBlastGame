# GIẢI THÍCH DỊCH VỤ AZURE CONTENT SAFETY TRONG ARENABLAST

## 1. Dịch vụ này là gì?

Azure Content Safety là một dịch vụ Trí tuệ Nhân tạo (AI) chuyên biệt thuộc nhóm Azure AI Services. Nó có khả năng phân tích ngôn ngữ tự nhiên để phát hiện các nội dung độc hại trong văn bản. Trong ArenaBlast, dịch vụ này đóng vai trò như một "người kiểm duyệt" (Moderator) tự động cho toàn bộ hệ thống Chat và hệ thống tạo phòng.

## 2. Vì sao ArenaBlast cần dịch vụ này?

Trong các tựa game nhiều người chơi, vấn nạn chửi bậy, xúc phạm (toxic behavior) là rất phổ biến, làm ảnh hưởng xấu đến cộng đồng người chơi. Nếu dùng cách lọc từ khoá (Keyword filtering) thủ công truyền thống:
- Rất dễ bị qua mặt (ví dụ: gõ "f.u.c.k", "ch3t di").
- Không hiểu được ngữ cảnh của câu nói.
- Tốn công sức cập nhật từ điển liên tục.

Azure Content Safety giúp ArenaBlast:
1. Phân tích ngữ cảnh câu nói bằng AI (Hiểu được ý nghĩa thực sự của câu).
2. Phân loại mức độ vi phạm theo 4 hạng mục: Bạo lực (Violence), Tình dục (Sexual), Tự hại (Self-harm), và Ngôn từ kích động (Hate).
3. Đánh giá mức độ nghiêm trọng (Severity) từ 0 (An toàn) đến 6 (Rất nghiêm trọng).

## 3. Dịch vụ hoạt động như thế nào?

```text
Người chơi A gõ tin nhắn vào World Chat
        ↓ (Socket.IO gửi sự kiện 'global_chat_message')
Backend chặn tin nhắn lại và gửi sang Azure Content Safety
        ↓
Azure AI đọc và chấm điểm 4 hạng mục
        ↓
Nếu an toàn (Severity < 2) → Phát tin nhắn cho mọi người
Nếu vi phạm (Severity >= 2) → Thay thế tin nhắn bằng "***" rồi mới phát đi
```

Trong chức năng tạo phòng, nếu Tên phòng có chứa từ nhạy cảm, API sẽ trả về lỗi `400 Bad Request` và từ chối tạo phòng ngay lập tức.

## 4. Các dịch vụ Azure phối hợp

| Dịch vụ | Vai trò |
|---|---|
| Azure Content Safety | AI phân tích văn bản và chấm điểm vi phạm |
| Azure Key Vault | Lưu trữ bảo mật Endpoint và API Key của Content Safety |
| Azure App Service | Máy chủ gọi API kiểm duyệt trước khi lưu dữ liệu |

## 5. Cách hệ thống quyết định văn bản an toàn

Nhóm thiết lập cơ chế **Fail-Open** kết hợp kiểm duyệt ngặt nghèo:
- Ngưỡng chặn: Chỉ cần **bất kỳ** hạng mục nào trong 4 hạng mục (Hate, Sexual, SelfHarm, Violence) có mức độ `severity >= 2` (Mức độ Nhẹ trở lên), văn bản đó sẽ bị coi là không an toàn.
- Nếu dịch vụ Azure gặp sự cố không phản hồi, hệ thống sẽ tạm thời cho qua (Fail-Open) để không làm gián đoạn trải nghiệm chơi game của người dùng.

## 6. Kết quả trả về

### API gọi sang Azure

Backend gọi REST API của Azure: `POST /contentsafety/text:analyze?api-version=2023-10-01`

**JSON Trả về từ Azure:**
```json
{
  "categoriesAnalysis": [
    { "category": "Hate", "severity": 2 },
    { "category": "SelfHarm", "severity": 0 },
    { "category": "Sexual", "severity": 0 },
    { "category": "Violence", "severity": 4 }
  ]
}
```
*Kết luận: Câu nói này mang tính bạo lực cao (4) và kích động (2) -> Xử lý thành `***`.*

## 7. Những phần code chính

| File | Nhiệm vụ |
|---|---|
| `backend/src/services/contentSafetyService.js` | Đóng gói logic gọi REST API tới Azure Content Safety bằng hàm `moderateText()` |
| `backend/src/socket/index.js` | Gọi `moderateText()` trước khi phát sóng sự kiện `global_chat_message` |
| `backend/src/routes/rooms.js` | Gọi `moderateText()` để kiểm tra biến `req.body.name` trước khi cho phép tạo phòng |

## 8. Cách chứng minh dịch vụ đã hoạt động

1. Mở cửa sổ World Chat trong game.
2. Gõ một câu chửi thề tiếng Anh (ví dụ: "shut the fuck up" hoặc "kill yourself").
3. Nhấn gửi. Ngay lập tức trên màn hình chat, dòng tin nhắn đó sẽ hiển thị là `***`.
4. Thử tạo một phòng chơi mới với tên phòng là "fucking room". Hệ thống sẽ hiện thông báo lỗi màu đỏ: *"Tên phòng chứa từ ngữ không phù hợp."* và không cho tạo.

## 9. Cách trình bày ngắn gọn

> Để xây dựng một cộng đồng game văn minh, nhóm em tích hợp AI Azure Content Safety làm bộ lọc ngôn từ tự động. Thay vì lọc từ khoá thủ công kém hiệu quả, AI của Azure sẽ đọc hiểu ngữ cảnh của từng tin nhắn chat hay tên phòng. Ngay khi phát hiện các yếu tố bạo lực, khiêu dâm hay kích động thù địch, tin nhắn đó sẽ bị biến thành các dấu sao `***` trước khi đến mắt người chơi khác, hoặc bị chặn không cho tạo phòng. 

## 10. Kết luận

Việc tích hợp Content Safety chứng minh khả năng áp dụng Trí tuệ Nhân tạo (AI) vào các bài toán thực tiễn của quy trình quản lý cộng đồng, giảm bớt gánh nặng cho người quản trị (Admin) và đảm bảo tựa game luôn thân thiện, an toàn.
