# GIẢI THÍCH DỊCH VỤ GRAFANA & OPENTELEMETRY MONITORING TRONG ARENABLAST

## 1. Dịch vụ này là gì?
**Grafana (Azure Managed Grafana / Grafana Cloud)** là nền tảng giám sát và trực quan hóa dữ liệu (Observability & Visualization Platform) hàng đầu, cho phép tổng hợp các chỉ số (Metrics), nhật ký (Logs) và luồng phân tích phân tán (Distributed Traces) lên các bảng điều khiển (Dashboards) trực quan theo thời gian thực.

Trong ArenaBlast, Grafana kết hợp với **OpenTelemetry (OTel)** và endpoint `/metrics` để theo dõi toàn diện hệ sinh thái game:
- **Game Metrics**: Số người chơi đang online (`activePlayers`), số phòng đấu đang diễn ra (`activeRooms`), tổng số trận đã chơi (`matchesPlayed`), số kết nối WebSocket (`connections`).
- **Server Health**: Tần suất yêu cầu API (`totalRequests`), thời gian máy chủ hoạt động (`uptimeSeconds`).
- **Distributed Traces**: Thời gian thực thi từng request từ Frontend qua Backend tới PostgreSQL và các dịch vụ Azure AI.

## 2. Vì sao ArenaBlast cần dịch vụ này?
Một trò chơi trực tuyến thời gian thực nhiều người chơi cần được giám sát liên tục 24/7 để:
- Phát hiện tức thì tình trạng nghẽn mạng (lag), tăng đột biến lượng người chơi (CCU Spike), hoặc crash server.
- Theo dõi hiệu năng của máy chủ game (Tick-rate, CPU/Memory) để quyết định mở rộng hạ tầng (Autoscaling).
- Phân tích và truy vết nguyên nhân lỗi khi người chơi gặp sự cố kết nối hoặc mất dữ liệu trận đấu.

Grafana & OpenTelemetry giúp ArenaBlast:
1. Thu thập tự động số liệu hiệu năng bằng OpenTelemetry SDK (`@opentelemetry/sdk-node`).
2. Hiển thị Dashboard thời gian thực với biểu đồ trực quan, sinh động.
3. Cảnh báo tự động (Alerting) khi lượng request lỗi tăng hoặc kết nối DB bị quá tải.
4. Cung cấp góc nhìn toàn diện cho Game Master và đội ngũ vận hành kỹ thuật (DevOps/SRE).

## 3. Dịch vụ hoạt động như thế nào?

```text
Người chơi thao tác trong Game (Chơi game, chat, đăng ký, upload ảnh)
        ↓
1. `metrics.js` ghi nhận số liệu game (activePlayers, activeRooms, matchesPlayed)
2. `instrumentation.js` (OpenTelemetry SDK) tự động bắt Traces & Metrics
        ↓
Đẩy dữ liệu qua OTLP HTTP Exporter (OTEL_EXPORTER_OTLP_ENDPOINT)
hoặc Grafana Agent cào (scrape) định kỳ từ API: GET /metrics
        ↓
Grafana tiếp nhận và tổng hợp dữ liệu vào cơ sở dữ liệu Time-Series (Prometheus/Loki/Tempo)
        ↓
Hiển thị lên các Dashboard trực quan thời gian thực trên Grafana Portal
```

API đo lường Backend:
```text
GET /metrics   (Trả về JSON chứa toàn bộ chỉ số game và hệ thống theo thời gian thực)
GET /health    (Health Probe kiểm tra trạng thái hoạt động của server)
```

## 4. Các dịch vụ phối hợp

| Dịch vụ | Vai trò |
|---|---|
| Grafana (Azure Managed Grafana / Grafana Cloud) | Trực quan hóa dữ liệu lên các biểu đồ Dashboard chuyên nghiệp |
| OpenTelemetry SDK (OTel) | Tự động thu thập và xuất (Export) Metrics, Traces từ Node.js |
| Azure Container Apps | Máy chủ Backend chạy OTel Instrumentation và phục vụ `/metrics` |
| Azure Key Vault | Lưu trữ các biến cấu hình kết nối OTLP an toàn |

Biến môi trường cấu hình trên Container Apps:
```text
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-...
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer ...
```

## 5. Cách hệ thống cấu hình và thu thập chỉ số
- **Auto-Instrumentation**: Sử dụng `@opentelemetry/auto-instrumentations-node` để tự động đo thời gian phản hồi của Express.js, câu lệnh SQL Sequelize, và HTTP client.
- **Tần suất xuất dữ liệu**: Thiết lập `exportIntervalMillis: 10000` (10 giây/lần) để đảm bảo dữ liệu hiển thị gần như thời gian thực mà không làm tốn tài nguyên server.
- **Khởi tạo thông minh**: File `backend/src/instrumentation.js` tự động bỏ qua nếu không có biến `OTEL_EXPORTER_OTLP_ENDPOINT`, giúp hệ thống chạy nhẹ nhàng ở môi trường phát triển cục bộ.

## 6. Kết quả trả về & Cơ chế hoạt động

### Dữ liệu API /metrics (GET /metrics)
Backend trả về HTTP `200` với cấu trúc JSON chuẩn:
```json
{
  "connections": 12,
  "totalRequests": 1845,
  "activeRooms": 3,
  "activePlayers": 8,
  "matchesPlayed": 27,
  "startTime": 1785300000000,
  "uptimeSeconds": 3600,
  "timestamp": "2026-08-03T08:45:00.000Z"
}
```

### Dashboard hiển thị trên Grafana
- **Panel 1 - Game Overview**: Single Stat hiển thị *Active Players*, *Live Rooms*, *Total Matches*.
- **Panel 2 - Traffic & Throughput**: Time-series graph biểu diễn lượng Requests/Second.
- **Panel 3 - Latency & Response Time**: Đo lường p95, p99 Latency của các API Auth, Match, Leaderboard.
- **Panel 4 - Error Rate**: Theo dõi tỷ lệ phản hồi HTTP 4xx và 5xx.

## 7. Những phần code chính

| File | Nhiệm vụ |
|---|---|
| `backend/src/instrumentation.js` | Khởi tạo OpenTelemetry NodeSDK, cấu hình `OTLPMetricExporter` và `OTLPTraceExporter` |
| `backend/src/utils/metrics.js` | Quản lý bộ đếm in-memory (`connections`, `activeRooms`, `activePlayers`, `matchesPlayed`) |
| `backend/src/app.js` | Khai báo middleware `requestCounter` và endpoint `GET /metrics` |
| `backend/src/game/GameManager.js` | Cập nhật `metrics.set('activeRooms', ...)` và `activePlayers` khi tạo/hủy phòng |
| `backend/src/socket/index.js` | Tăng giảm `metrics.connections` khi người chơi kết nối / ngắt kết nối WebSocket |

## 8. Cách chứng minh dịch vụ đã hoạt động
1. Truy cập trực tiếp endpoint `/metrics` trên trình duyệt: Thấy dữ liệu JSON cập nhật liên tục khi có người chơi vào phòng đấu.
2. Khi người chơi tham gia phòng đấu mới: Giá trị `activeRooms` và `activePlayers` tăng lên tương ứng.
3. Đăng nhập vào Grafana Dashboard: Thấy các biểu đồ Time-series hiển thị đường cong lượng người chơi và số lượng request theo thời gian.
4. Log stream của Backend khi khởi động: `[OTel] Auto-instrumentation started successfully`.
5. Khi người chơi thoát game: `connections` và `activePlayers` tự động giảm, biểu đồ trên Grafana phản ánh tức thì.

## 9. Cách trình bày ngắn gọn
> Nhóm em sử dụng Grafana kết hợp với OpenTelemetry và endpoint /metrics tùy biến để xây dựng hệ thống giám sát toàn diện (Observability) cho ArenaBlast. Hệ thống tự động thu thập các chỉ số quan trọng trong game như số người chơi trực tuyến, số phòng đấu, số trận đã hoàn thành và độ trễ phản hồi của server. Toàn bộ dữ liệu được trực quan hóa trên các Dashboard thời gian thực của Grafana, giúp đội ngũ vận hành dễ dàng theo dõi sức khỏe hệ thống và phát hiện sự cố kịp thời.

## 10. Kết luận
Giải pháp giám sát với Grafana và OpenTelemetry đem lại khả năng quan sát sâu (Deep Observability), đảm bảo trò chơi ArenaBlast luôn vận hành ổn định, mượt mà và sẵn sàng mở rộng quy mô.
