# GIẢI THÍCH DỊCH VỤ AZURE CACHE FOR REDIS TRONG ARENABLAST

## 1. Dịch vụ này là gì?
**Azure Cache for Redis** là dịch vụ lưu trữ dữ liệu trong bộ nhớ RAM (In-Memory Data Store) tốc độ cực cao được quản lý bởi Microsoft Azure. 

Trong ArenaBlast, Redis đóng vai trò làm tầng tăng tốc hiệu năng (Caching Layer):
- Cache Bảng xếp hạng All-Time, Tuần và Ngày (`leaderboard:v3:all_time`, `leaderboard:v3:weekly`, `leaderboard:v3:daily`).
- Quản lý phiên làm việc và trạng thái người chơi trực tuyến.
- Giảm tải trực tiếp cho cơ sở dữ liệu PostgreSQL khi có hàng ngàn lượt tải trang cùng lúc.

## 2. Vì sao ArenaBlast cần dịch vụ này?
Bảng xếp hạng là tính năng được người chơi mở liên tục (trước, trong và sau mỗi trận đấu). Nếu mỗi lần xem đều chạy câu lệnh SQL tổng hợp phức tạp (CTE, JOIN, SUM, COUNT) trên PostgreSQL:
- Cơ sở dữ liệu sẽ nhanh chóng bị nghẽn CPU và hết kết nối khả dụng (Connection Exhaustion).
- Tốc độ phản hồi API bị chậm (vài trăm mili-giây).

Azure Cache for Redis giúp ArenaBlast:
1. Phản hồi yêu cầu lấy bảng xếp hạng với độ trễ cực thấp (< 5 mili-giây).
2. Giảm đến **90%** tải truy vấn đọc (Read Load) lên cơ sở dữ liệu PostgreSQL.
3. Cơ chế tự động hết hạn (TTL) giúp dữ liệu luôn tươi mới mà không cần can thiệp thủ công.

## 3. Dịch vụ hoạt động như thế nào?

```text
Người dùng mở trang Leaderboard (GET /api/leaderboard?period=all_time)
        ↓
Backend kiểm tra Key trong Azure Cache for Redis (`leaderboard:v3:all_time`)
        ↓
- [CACHE HIT] (Có dữ liệu trong RAM) ──→ Trả kết quả ngay lập tức (1-5ms)
- [CACHE MISS] (Chưa có hoặc đã hết hạn):
    ↓
    Backend truy vấn SQL phức tạp từ Azure PostgreSQL
    ↓
    Lưu kết quả vào Azure Redis với thời gian sống TTL = 5 giây
    ↓
    Trả kết quả về cho người dùng
```

## 4. Các dịch vụ Azure phối hợp

| Dịch vụ | Vai trò |
|---|---|
| Azure Cache for Redis | Lưu trữ bộ nhớ đệm In-Memory tốc độ cao |
| Azure Key Vault | Lưu trữ an toàn mật khẩu `REDIS-PASSWORD` |
| Azure PostgreSQL | Nguồn dữ liệu gốc (Source of Truth) khi cache bị miss |
| Azure Container Apps | Ứng dụng Backend kết nối và quản lý vòng đời Cache |

## 5. Cách hệ thống cấu hình và tối ưu
- Kết nối thông qua thư viện `ioredis` hỗ trợ tự động kết nối lại (Auto-reconnect) và Keep-alive.
- Khóa Cache được phân tách phiên bản (`leaderboard:v3:*`) để tránh xung đột dữ liệu cũ.
- Thiết lập thời gian sống **TTL = 5 giây**: Đảm bảo bảng xếp hạng cập nhật gần như thời gian thực sau mỗi trận đấu nhưng vẫn gom được hàng trăm request đồng thời vào 1 lần truy vấn DB duy nhất.

## 6. Kết quả trả về & Cơ chế hoạt động

### Cache Hit (Lấy từ RAM)
Log Backend ghi nhận:
```text
[Leaderboard] Cache HIT for key leaderboard:v3:all_time (latency: 2ms)
```

### Cơ chế Fallback an toàn (Resilient Design)
Nếu Azure Redis gặp sự cố mạng hoặc khởi động lại:
- Hệ thống bắt lỗi nhẹ nhàng (`try...catch`), tự động bypass qua tầng Cache và truy vấn trực tiếp từ PostgreSQL.
- Trò chơi vẫn hoạt động bình thường, không gây gián đoạn trải nghiệm người dùng.

## 7. Những phần code chính

| File | Nhiệm vụ |
|---|---|
| `backend/src/cache/redis.js` | Khởi tạo client kết nối Azure Redis, các hàm `getCache`, `setCache`, `delCache` |
| `backend/src/routes/leaderboard.js` | Triển khai mô hình Cache-Aside Pattern với TTL 5s cho các bảng xếp hạng |

## 8. Cách chứng minh dịch vụ đã hoạt động
1. Kiểm tra Azure Portal > Azure Cache for Redis thấy đồ thị **Cache Hits / Cache Misses** và **Connected Clients**.
2. Gọi API Bảng xếp hạng lần 1 (Cache Miss) mất ~60ms; gọi liên tiếp các lần sau (Cache Hit) thời gian phản hồi giảm còn ~2-4ms.
3. Log của Backend hiển thị rõ các lượt đọc ghi vào Redis.
4. Mật khẩu kết nối Redis được đọc tự động từ Key Vault khi khởi động.

## 9. Cách trình bày ngắn gọn
> Để tối ưu hóa hiệu năng cho tính năng Bảng xếp hạng thời gian thực, nhóm em áp dụng mô hình Cache-Aside Pattern với Azure Cache for Redis. Dữ liệu bảng xếp hạng được lưu đệm trong bộ nhớ RAM với thời gian sống 5 giây, giúp giảm thiểu 90% tải truy vấn lên PostgreSQL và rút ngắn thời gian phản hồi API xuống dưới 5 mili-giây.

## 10. Kết luận
Azure Cache for Redis là thành phần cốt lõi giúp hệ thống đạt độ trễ cực thấp và khả năng chịu tải cao trong môi trường Game nhiều người chơi.
