# ⚔️ ArenaBlast — Multiplayer 2D Real-Time Game

> **Dự án nghiên cứu môn Điện toán đám mây**  
> Game 2D multiplayer real-time sử dụng Node.js, React, Socket.IO, PostgreSQL, Redis, triển khai trên Microsoft Azure.

---

## 🗺️ Lộ trình triển khai

| Giai đoạn | Mô tả | Tài liệu |
|---|---|---|
| **Giai đoạn 1** | 🖥️ Chạy Local — Node.js + PostgreSQL thủ công | [📘 docs/phase1-local.md](./docs/phase1-local.md) |
| **Giai đoạn 2** | 🐳 Docker Compose — Đóng gói toàn bộ stack | [📘 docs/phase2-docker.md](./docs/phase2-docker.md) |
| **Giai đoạn 3** | ⚙️ GitHub & CI/CD — Tự động hóa pipeline | [📘 docs/phase3-github-cicd.md](./docs/phase3-github-cicd.md) |
| **Giai đoạn 4** | ☁️ Deploy Azure — Container Apps + PostgreSQL + Redis | [📘 docs/phase4-azure.md](./docs/phase4-azure.md) |

---

## 🎮 Giới thiệu

**ArenaBlast** là game 2D arena multiplayer real-time chạy hoàn toàn trên trình duyệt:
- Đăng ký / đăng nhập với nickname, **tùy chỉnh avatar & vũ khí bằng hình ảnh**
- Tạo hoặc tham gia phòng chơi bằng mã phòng
- Di chuyển `WASD` / `↑↓←→` (desktop) hoặc **Virtual Joystick** (mobile)
- Thu thập hạt vàng → điểm tăng → nhân vật **to hơn** → tầm chém **xa hơn**
- Tấn công đối thủ bằng `Space` — vũ khí có **animation vung chém**
- Hạ gục đối thủ → hạt của họ **rớt ra** để tranh nhau
- Xem leaderboard real-time và lịch sử trận đấu

---

## 🏗️ Kiến trúc hệ thống

```
Browser (React + Canvas 2D + Socket.IO)
         │ HTTP REST          │ WebSocket
         ▼                    ▼
   Backend (Node.js + Express + Socket.IO)
   ├── REST API (/api/*)
   ├── Socket.IO (game events)
   └── Game Engine (GameRoom.js — 30fps tick)
         │                    │
         ▼                    ▼
   PostgreSQL             Redis
   (users, matches,       (game state,
    events — persist)      cache — temp)

Azure Cloud:
├── Azure Container Apps   (Frontend + Backend)
├── Azure Database PostgreSQL  (Flexible Server)
├── Azure Cache for Redis
├── Azure Container Registry  (Docker images)
├── Azure Functions           (Leaderboard worker)
└── GitHub Actions            (CI/CD pipeline)
```

---

## 🚀 Bắt đầu nhanh

```bash
# Clone về
git clone https://github.com/YOUR_USERNAME/arenablast.git
cd arenablast

# Chạy với Docker Compose (cần Docker Desktop)
cp backend/.env.example .env
docker-compose up --build

# Mở trình duyệt
# Frontend: http://localhost:80
# Backend:  http://localhost:3001/health
```

---

## 📁 Cấu trúc thư mục

```
Game/
├── docs/
│   ├── phase1-local.md         ← Hướng dẫn chạy Local
│   ├── phase2-docker.md        ← Docker Compose
│   ├── phase3-github-cicd.md   ← GitHub & CI/CD
│   └── phase4-azure.md         ← Deploy Azure
├── frontend/                   ← React + Vite + Canvas 2D
├── backend/                    ← Node.js + Express + Socket.IO
│   └── src/game/               ← GameRoom.js, Physics.js, GameManager.js
├── database/
│   ├── schema.sql              ← PostgreSQL schema
│   └── seed.js                 ← Dữ liệu mẫu
├── worker/leaderboard-updater/ ← Azure Function
├── .github/workflows/ci.yml   ← GitHub Actions CI/CD
└── docker-compose.yml
```

---

## 🔑 Tài khoản Test

Sau khi chạy `node database/seed.js`:

| Username | Password | Role |
|---|---|---|
| demo | demo123 | player |
| player1 | player123 | player |
| admin | admin123 | admin |

---

## 🔗 API nhanh

| Endpoint | Mô tả |
|---|---|
| `GET /health` | Health check |
| `GET /metrics` | Basic metrics |
| `POST /api/auth/register` | Đăng ký |
| `POST /api/auth/login` | Đăng nhập |
| `GET /api/leaderboard` | Bảng xếp hạng |

Xem đầy đủ tại [docs/phase1-local.md#api](./docs/phase1-local.md).

---

## 🗺️ Cloud Mapping

| Khái niệm | Tính năng trong ArenaBlast |
|---|---|
| **SaaS** | Game chạy trên trình duyệt, không cài phần mềm |
| **PaaS** | Azure Container Apps cho Frontend + Backend |
| **Serverless** | Azure Function xử lý leaderboard async |
| **CI/CD** | GitHub Actions: Test → Docker Build → Deploy |
| **Auto-scaling** | Container Apps scale 1→3 replica tự động |
| **Observability** | /health, /metrics, Azure App Insights |

---

*⚔️ ArenaBlast — Môn Điện toán đám mây — 2026*
