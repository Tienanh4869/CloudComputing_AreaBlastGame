# ⚔️ ArenaBlast — Multiplayer 2D Real-Time Game

> **Dự án nghiên cứu môn Điện toán đám mây**  
> Game 2D multiplayer real-time sử dụng Node.js, React, Socket.IO, PostgreSQL, Redis, triển khai trên Microsoft Azure.

---

## 📋 Mục lục

1. [Giới thiệu](#giới-thiệu)
2. [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
3. [Cấu trúc thư mục](#cấu-trúc-thư-mục)
4. [Chạy local (bước đầu)](#chạy-local)
5. [Chạy với Docker Compose](#docker-compose)
6. [Deploy lên Azure](#azure-deployment)
7. [API Endpoints](#api-endpoints)
8. [Socket.IO Events](#socketio-events)
9. [Database Schema](#database-schema)
10. [Cloud Mapping](#cloud-mapping)
11. [Tài khoản test](#tài-khoản-test)

---

## Giới thiệu

**ArenaBlast** là game 2D arena multiplayer real-time chạy trên trình duyệt. Người chơi:
- Đăng ký / đăng nhập với nickname
- Tạo hoặc tham gia phòng chơi
- Di chuyển bằng WASD / Arrow keys
- Thu thập hạt vàng để tăng điểm
- Tấn công người chơi khác (Space)
- Xem leaderboard real-time và lịch sử trận đấu

---

## Kiến trúc hệ thống

```
┌────────────────────────────────────────────────────────────────┐
│                     BROWSER (Client)                           │
│  React + Vite + Canvas 2D    │    Socket.IO Client             │
└──────────────┬───────────────┴───────────────┬────────────────┘
               │ HTTP REST                     │ WebSocket
               ▼                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  BACKEND (Node.js + Express)                  │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  REST API   │  │  Socket.IO   │  │   Game Engine    │   │
│  │  /api/auth  │  │  Server      │  │   GameRoom.js    │   │
│  │  /api/rooms │  │  join_room   │  │   Physics.js     │   │
│  │  /api/match │  │  player_move │  │   30fps tick     │   │
│  │  /api/lb    │  │  player_atk  │  │                  │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
└──────────┬────────────────────────────────────────────────────┘
           │
     ┌─────┴────────┐
     │              │
     ▼              ▼
┌─────────┐   ┌──────────┐
│Postgres │   │  Redis   │
│(persist)│   │(game     │
│users    │   │ state,   │
│matches  │   │ cache)   │
│events   │   │          │
└─────────┘   └──────────┘

Azure Cloud:
┌─────────────────────────────────────────────────────────┐
│  Azure Container Apps (Frontend + Backend)              │
│  Azure Database for PostgreSQL (Flexible Server)        │
│  Azure Cache for Redis                                  │
│  Azure Container Registry (Docker images)               │
│  Azure Functions (Leaderboard updater, cleanup)         │
│  Azure Key Vault (Secrets)                              │
│  Azure Monitor / Application Insights (Observability)  │
│  GitHub Actions CI/CD                                   │
└─────────────────────────────────────────────────────────┘
```

---

## Cấu trúc thư mục

```
Game/
├── frontend/                   # React + Vite
│   ├── src/
│   │   ├── pages/              # Login, Register, Lobby, Game, Leaderboard, History
│   │   ├── components/         # GameCanvas (Canvas 2D renderer)
│   │   ├── hooks/              # useSocket.js (Socket.IO hook)
│   │   ├── store/              # Zustand stores (auth, game)
│   │   ├── api/                # Axios API clients
│   │   ├── App.jsx             # Router + auth guards
│   │   └── index.css           # Design system
│   ├── Dockerfile
│   └── package.json
│
├── backend/                    # Node.js + Express + Socket.IO
│   ├── src/
│   │   ├── config/             # database.js, redis.js, env.js
│   │   ├── models/             # Sequelize models (6 models)
│   │   ├── routes/             # auth, players, rooms, matches, leaderboard, admin
│   │   ├── middleware/         # auth.js, rbac.js, errorHandler.js
│   │   ├── socket/             # Socket.IO handlers (game events)
│   │   ├── game/               # GameRoom.js, GameManager.js, Physics.js
│   │   ├── utils/              # logger.js, metrics.js, helpers.js
│   │   ├── app.js              # Express setup
│   │   └── server.js           # Entry point
│   ├── Dockerfile
│   └── package.json
│
├── database/
│   ├── schema.sql              # PostgreSQL schema
│   └── seed.js                 # Seed data script
│
├── worker/
│   └── leaderboard-updater/    # Azure Function
│
├── infra/                      # Azure Bicep templates (mô tả)
├── .github/workflows/ci.yml    # GitHub Actions CI/CD
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Chạy Local

### Yêu cầu
- Node.js 18+ và npm
- PostgreSQL 14+ (cài local hoặc dùng Docker)
- Redis (tùy chọn — game vẫn chạy nếu không có Redis)

### Bước 1: Cài đặt PostgreSQL
```bash
# Windows: Tải từ https://www.postgresql.org/download/
# Hoặc dùng Docker cho chỉ PostgreSQL:
docker run -d --name pg -e POSTGRES_PASSWORD=yourpassword -e POSTGRES_DB=arenablast -p 5432:5432 postgres:16
```

### Bước 2: Tạo database
```bash
# Kết nối vào PostgreSQL và tạo database
psql -U postgres -c "CREATE DATABASE arenablast;"
```

### Bước 3: Cấu hình Backend
```bash
cd backend
cp .env.example .env
# Chỉnh sửa .env với thông tin PostgreSQL của bạn:
# DB_PASSWORD=yourpassword
# JWT_SECRET=any-random-string
```

### Bước 4: Cài dependencies và chạy backend
```bash
cd backend
npm install
npm run dev
# Backend chạy tại http://localhost:3001
# Tự động sync database models khi khởi động
```

### Bước 5: Seed dữ liệu mẫu
```bash
cd database
node seed.js
# Tạo users, rooms, matches, leaderboard mẫu
```

### Bước 6: Cài và chạy Frontend
```bash
cd frontend
npm install
npm run dev
# Frontend chạy tại http://localhost:5173
```

### Kiểm tra
- Mở http://localhost:5173
- Đăng nhập: `demo / demo123`
- Tạo phòng → bắt đầu chơi

---

## Docker Compose

Sau khi local đã ổn, chạy toàn bộ stack bằng Docker:

```bash
# Từ thư mục gốc D:\Game
cp backend/.env.example .env
# Chỉnh DB_PASSWORD và JWT_SECRET trong .env

docker-compose up --build
# Frontend:  http://localhost:80
# Backend:   http://localhost:3001
# Health:    http://localhost:3001/health
```

### Seed dữ liệu (Docker)
```bash
# Sau khi containers đã chạy:
docker exec arenablast-backend node database/seed.js
```

---

## Azure Deployment

### Yêu cầu
- Azure CLI
- Azure subscription
- GitHub repository (fork project này)

### Bước 1: Tạo resources Azure
```bash
# Login Azure
az login

# Tạo Resource Group
az group create --name arenablast-rg --location southeastasia

# Tạo Container Registry
az acr create --resource-group arenablast-rg \
  --name arenablastacr --sku Basic

# Tạo PostgreSQL Flexible Server
az postgres flexible-server create \
  --resource-group arenablast-rg \
  --name arenablast-db \
  --admin-user arenablast_admin \
  --admin-password "YourStrongPassword123!" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --database-name arenablast

# Tạo Azure Cache for Redis
az redis create \
  --resource-group arenablast-rg \
  --name arenablast-redis \
  --sku Basic --vm-size C0

# Tạo Container Apps Environment
az containerapp env create \
  --name arenablast-env \
  --resource-group arenablast-rg \
  --location southeastasia
```

### Bước 2: Cấu hình GitHub Secrets
Thêm vào GitHub repo → Settings → Secrets:
- `AZURE_CREDENTIALS` — Service principal JSON
- `DB_PASSWORD`
- `JWT_SECRET`

### Bước 3: Push lên main → CI/CD tự động deploy

---

### So sánh IaaS vs PaaS
| | IaaS (Azure VM) | PaaS (Container Apps) |
|---|---|---|
| Control | Full control | Managed runtime |
| Setup | Cài Node.js thủ công | Chỉ cần Docker image |
| Scaling | Manual | Auto-scale |
| Maintenance | Tự vá OS | Azure lo |
| Phù hợp | Cần custom OS | **Khuyến nghị cho project này** |

---

## API Endpoints

| Method | URL | Auth | Mô tả |
|--------|-----|------|-------|
| POST | /api/auth/register | - | Đăng ký |
| POST | /api/auth/login    | - | Đăng nhập |
| GET  | /api/auth/me       | JWT | Thông tin hiện tại |
| GET  | /api/rooms         | JWT | Danh sách phòng |
| POST | /api/rooms         | JWT | Tạo phòng mới |
| GET  | /api/rooms/code/:code | JWT | Tìm phòng theo code |
| GET  | /api/matches       | JWT | Lịch sử trận |
| GET  | /api/matches/my/history | JWT | Trận của tôi |
| GET  | /api/leaderboard   | - | Bảng xếp hạng |
| GET  | /api/admin/users   | JWT+Admin | Danh sách users |
| GET  | /api/admin/stats   | JWT+Admin | Dashboard stats |
| POST | /api/admin/seed    | JWT+Admin | Chạy seed data |
| GET  | /health            | - | Health check |
| GET  | /metrics           | - | Basic metrics |

---

## Socket.IO Events

### Client → Server
| Event | Data | Mô tả |
|-------|------|-------|
| `join_room` | `{roomId, roomCode}` | Vào phòng |
| `leave_room` | - | Rời phòng |
| `ready` | - | Sẵn sàng chơi |
| `player_move` | `{dx, dy}` | Di chuyển (-1, 0, 1) |
| `player_attack` | - | Tấn công (Space) |

### Server → Client
| Event | Data | Mô tả |
|-------|------|-------|
| `room_joined` | `{roomId, state, mapWidth, mapHeight}` | Xác nhận vào phòng |
| `game_state` | `{players[], particles[]}` | State mỗi 33ms |
| `player_joined` | `{nickname, playerCount}` | Player mới vào |
| `player_left` | `{nickname}` | Player rời |
| `match_started` | `{matchId, mapWidth, mapHeight}` | Trận bắt đầu |
| `player_hit` | `{damage, targetHp, killed}` | Bị tấn công |
| `player_died` | `{killerNickname, targetNickname}` | Player chết |
| `particles_collected` | `[{particleId, score}]` | Hạt bị ăn |
| `leaderboard_update` | `{scores[]}` | Cập nhật xếp hạng |
| `match_ended` | `{results[], winner, duration}` | Kết thúc trận |

---

## Database Schema

```sql
users          — Tài khoản người dùng (id, username, email, password_hash, role)
players        — Profile game (id, user_id, nickname, score, kills, deaths, wins)
rooms          — Phòng chơi (id, name, code, status, max_players)
matches        — Trận đấu (id, room_id, status, winner_id, duration)
match_players  — Stats mỗi người trong trận (score, kills, deaths, rank)
match_events   — Event log bất biến (event_type, player_id, data JSONB)
leaderboard_scores — Bảng xếp hạng (period: all_time/weekly/daily)
```

---

## Cloud Mapping

| Chủ đề Cloud | Tính năng trong ArenaBlast |
|---|---|
| **SaaS** | Game chạy hoàn toàn trên trình duyệt, không cài phần mềm |
| **PaaS** | Deploy frontend + backend lên Azure Container Apps |
| **IaaS** | Có thể deploy backend trên Azure VM (so sánh với PaaS) |
| **Cloud-Native** | Containers riêng biệt: frontend, backend. Stateless design |
| **Event-Driven** | Match events (player_killed, match_ended) → MatchEvent table → có thể publish lên Azure Service Bus |
| **Serverless** | Azure Function `leaderboard-updater` xử lý score updates không đồng bộ |
| **CI/CD** | GitHub Actions: test → build Docker → push ACR → deploy Container Apps |
| **Security** | JWT auth, RBAC (player/admin), Helmet.js, rate limiting, env secrets |
| **Observability** | Winston logs (JSON format), /health endpoint, /metrics, Azure App Insights ready |
| **Scalability** | Redis cho game state (multi-instance ready), PostgreSQL cho persist, stateless backend |

---

## Tài khoản Test

Sau khi chạy seed:

| Username | Password | Role | Nickname |
|----------|----------|------|----------|
| admin    | admin123 | admin  | Administrator |
| demo     | demo123  | player | DemoPlayer |
| player1  | player123 | player | DragonSlayer |
| player2  | player123 | player | ShadowWolf |
| player3  | player123 | player | BlazeFist |

---

## Mẹo Demo

1. **Mở 2 tab trình duyệt** → đăng nhập 2 tài khoản khác nhau → vào cùng 1 phòng
2. **Tab 1**: Nhấn Ready → trận bắt đầu
3. **Tab 2**: Di chuyển WASD, tấn công Space → thấy real-time sync
4. **Leaderboard** cập nhật mỗi khi hạt bị ăn
5. **/health** và **/metrics** endpoint để demo observability

---

## Yêu cầu hệ thống

- **Local**: Node.js 18+, PostgreSQL 14+, RAM 2GB
- **Docker**: Docker Desktop 4+
- **Azure**: Subscription với quota cho Container Apps

---

*Được xây dựng cho môn Điện toán đám mây — 2026*
