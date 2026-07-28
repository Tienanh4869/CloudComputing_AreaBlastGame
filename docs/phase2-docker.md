# 🐳 Giai đoạn 2 — Docker Compose

> **Mục tiêu**: Đóng gói toàn bộ stack (Frontend + Backend + PostgreSQL + Redis) vào Docker.  
> Chạy đúng 1 lệnh, môi trường đồng nhất trên mọi máy.  
> **Yêu cầu**: Docker Desktop 4+

---

## 2.1 Chuẩn bị file `.env`

```bash
# Từ thư mục gốc D:\Game
cp backend/.env.example .env
```

Mở `.env` và điền:
```env
DB_PASSWORD=yourpassword
JWT_SECRET=your-random-secret-string
```

---

## 2.2 Khởi chạy toàn bộ stack

```bash
# Từ thư mục gốc D:\Game
docker-compose up --build
```

| Service | URL | Ghi chú |
|---|---|---|
| Frontend | http://localhost:80 | Nginx phục vụ React build |
| Backend API | http://localhost:3001 | Node.js + Express |
| Health Check | http://localhost:3001/health | Kiểm tra backend |
| PostgreSQL | localhost:5432 | Dùng để kết nối tools |
| Redis | localhost:6379 | Cache & pub/sub |

---

## 2.3 Seed dữ liệu mẫu (lần đầu)

```bash
# Sau khi containers đã chạy và healthy:
docker exec arenablast-backend node database/seed.js
```

---

## 2.4 Xem và quản lý Database

### Cách 1 — Dùng tab Exec trong Docker Desktop
1. Mở **Docker Desktop** → Click container **`arenablast-postgres`**
2. Chọn tab **Exec**
3. Gõ:
```bash
psql -U postgres -d arenablast
```
```sql
\dt                          -- Danh sách tất cả bảng
SELECT * FROM users;         -- Dữ liệu users
SELECT * FROM matches;       -- Lịch sử trận
SELECT count(*) FROM match_events;  -- Số events
\q                           -- Thoát
```

### Cách 2 — Kết nối từ DBeaver / pgAdmin
- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `arenablast`
- **User**: `postgres`
- **Password**: `yourpassword` (giá trị trong `.env`)

---

## 2.5 Các lệnh Docker hữu ích

```bash
# Xem logs realtime
docker-compose logs -f backend
docker-compose logs -f frontend

# Dừng tất cả
docker-compose down

# Dừng và xóa volume (reset database)
docker-compose down -v

# Rebuild chỉ 1 service
docker-compose up --build backend

# Vào terminal container backend
docker exec -it arenablast-backend sh

# Kiểm tra containers đang chạy
docker ps
```

---

## 2.6 Cấu trúc Docker

```
docker-compose.yml
├── postgres          ← PostgreSQL 16 Alpine
│   └── schema.sql mount → /docker-entrypoint-initdb.d/
├── redis             ← Redis 7 Alpine (no persistence)
├── backend           ← Node.js 20 Alpine
│   └── depends: postgres (healthy), redis (healthy)
└── frontend          ← Nginx + React build
    └── depends: backend (healthy)
```

### Healthchecks:
- **postgres**: `pg_isready -U postgres -d arenablast`
- **redis**: `redis-cli ping`
- **backend**: HTTP GET `/health` → 200

---

## 2.7 So sánh với Giai đoạn 1

| | Giai đoạn 1 (Local) | Giai đoạn 2 (Docker) |
|---|---|---|
| Cài đặt | Node.js, PostgreSQL thủ công | Chỉ cần Docker Desktop |
| Khởi chạy | 3 terminal riêng | 1 lệnh `docker-compose up` |
| Môi trường | Phụ thuộc máy dev | Đồng nhất mọi máy |
| Hot reload | ✅ (npm run dev) | ❌ (cần rebuild) |
| Phù hợp | Phát triển, debug | Test tích hợp, demo |

---

*← [Giai đoạn 1 — Local](./phase1-local.md) | Tiếp theo: [Giai đoạn 3 — GitHub CI/CD →](./phase3-github-cicd.md)*
