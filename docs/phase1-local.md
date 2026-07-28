# 📘 Giai đoạn 1 — Chạy Local (Development)

> **Mục tiêu**: Chạy game trực tiếp trên máy tính để phát triển và debug, không cần Docker.  
> **Yêu cầu**: Node.js 18+, PostgreSQL 14+

---

## 1.1 Cài đặt PostgreSQL

Dùng Docker để khởi chạy PostgreSQL nhanh (không cần cài tay):
```bash
docker run -d --name pg \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=arenablast \
  -p 5432:5432 postgres:16
```

Hoặc cài PostgreSQL trực tiếp: https://www.postgresql.org/download/

---

## 1.2 Cấu hình Backend

```bash
cd backend
cp .env.example .env
```

Mở file `.env` và điền vào:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=arenablast
DB_USER=postgres
DB_PASSWORD=yourpassword
JWT_SECRET=any-random-string-here
```

---

## 1.3 Khởi chạy Backend

```bash
cd backend
npm install
npm run dev
# Backend chạy tại http://localhost:3001
# Sequelize tự động tạo bảng khi khởi động (sync: alter)
```

Kiểm tra:
```bash
curl http://localhost:3001/health
```

---

## 1.4 Seed dữ liệu mẫu (tuỳ chọn)

```bash
cd database
node seed.js
# Tạo 5 users, 3 rooms, matches, leaderboard mẫu
```

---

## 1.5 Khởi chạy Frontend

```bash
cd frontend
npm install
npm run dev
# Frontend chạy tại http://localhost:5173
```

---

## 1.6 Kiểm tra hoạt động

| URL | Mô tả |
|---|---|
| http://localhost:5173 | Giao diện game |
| http://localhost:3001/health | Health check backend |
| http://localhost:3001/metrics | Basic metrics |
| http://localhost:3001/api/leaderboard | Leaderboard API |

### Tài khoản test (sau khi seed):
| Username | Password | Role |
|---|---|---|
| demo | demo123 | player |
| player1 | player123 | player |
| admin | admin123 | admin |

---

## 1.7 Luồng chơi game

1. Đăng ký tài khoản → tùy chỉnh avatar & vũ khí bằng cách upload ảnh
2. Vào Lobby → Tạo phòng hoặc nhập mã phòng
3. Nhấn **Ready for Battle**
4. Di chuyển: `WASD` hoặc `↑↓←→`  
   Tấn công: `Space`
5. Thu thập hạt vàng → điểm tăng → nhân vật to hơn → tầm chém xa hơn
6. Hạ gục đối thủ → hạt của họ rớt ra để tranh nhau

---

## 1.8 Cấu trúc code quan trọng

```
backend/src/game/
├── GameRoom.js     ← Engine chính: vật lý, va chạm, tick loop
├── GameManager.js  ← Quản lý nhiều phòng
└── Physics.js      ← normalizeMovement, circleCollide, clampToMap

frontend/src/
├── components/GameCanvas.jsx  ← Renderer Canvas 2D + input keyboard
├── components/MobileControls.jsx ← Virtual joystick cho mobile
└── hooks/useSocket.js         ← Kết nối Socket.IO
```

---

*← [README chính](../README.md) | Tiếp theo: [Giai đoạn 2 — Docker →](./phase2-docker.md)*
