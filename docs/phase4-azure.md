# ☁️ Giai đoạn 4 — Deploy lên Azure

> **Mục tiêu**: Đưa ArenaBlast lên Azure Container Apps.  
> **Chi phí tối ưu**: Không dùng Redis (có thể thêm sau) → ~$21/tháng → dùng được ~5 tháng với $100 student credit.  
> **Yêu cầu**: Azure CLI, Azure for Students ($100 credit miễn phí)

---

## ✅ Trạng thái triển khai

| Bước | Mô tả | Trạng thái |
|---|---|---|
| 4.1 | Tạo Resource Group | ✅ Hoàn thành |
| 4.2 | Tạo Container Registry (ACR) | ✅ Hoàn thành |
| 4.3 | Đăng ký PostgreSQL/App/Cache provider | ✅ Hoàn thành |
| 4.4 | Tạo PostgreSQL Flexible Server | ✅ Hoàn thành |
| 4.4b | Tạo database `arenablast` | ⏳ Cần chạy |
| 4.5 | ~~Redis~~ | ⏭️ Bỏ qua — thêm sau nếu cần |
| 4.6 | Tạo Container Apps Environment | ✅ Hoàn thành |
| 4.7 | Build & Push Docker images lên ACR | ✅ Hoàn thành |
| 4.8 | Deploy Backend Container App | ✅ Hoàn thành |
| 4.9 | Chạy Schema Database trên Azure | ✅ Hoàn thành (Tự động nhờ Sequelize) |
| 4.10 | Deploy Frontend Container App | ✅ Hoàn thành |
| 4.11 | Cấu hình GitHub Secrets → CI/CD auto-deploy | ⏳ Cần chạy |

---

## 4.0 Cài đặt Azure CLI

Download: https://aka.ms/installazurecliwindows  
```powershell
az --version   # Kiểm tra
az login       # Đăng nhập → trình duyệt mở ra
az account show  # Xác nhận đúng subscription Azure for Students
```

---

## 4.1 ✅ Tạo Resource Group

> Đã hoàn thành. Resource Group `arenablast-rg` đã được tạo tại `southeastasia`.

```powershell
# Đã chạy thành công:
az group create --name arenablast-rg --location southeastasia
```

---

## 4.2 ✅ Tạo Azure Container Registry (ACR)

> Đã hoàn thành. ACR `arenablastacr` đã được tạo.

```powershell
# Đã chạy thành công:
az acr create --resource-group arenablast-rg --name arenablastacr --sku Basic --admin-enabled true
```

Lấy ACR password (chạy lại nếu chưa lưu):
```powershell
az acr credential show --name arenablastacr
# Lưu lại: username = "arenablastacr" và passwords[0].value
```

---

## 4.3 ✅ Đăng ký Provider

> **Lỗi gặp phải**: `MissingSubscriptionRegistration` khi tạo PostgreSQL.  
> **Nguyên nhân**: Azure for Students cần đăng ký dịch vụ trước khi dùng lần đầu.  
> **Fix**: Chạy lệnh đăng ký provider.

```powershell
# Đăng ký provider PostgreSQL (bắt buộc)
az provider register --namespace Microsoft.DBforPostgreSQL --wait

# Đăng ký luôn các provider sẽ dùng sau
az provider register --namespace Microsoft.Cache --wait
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait

# Kiểm tra đã đăng ký chưa
az provider show --namespace Microsoft.DBforPostgreSQL --query registrationState
# Kết quả phải là: "Registered"
```

---

## 4.4 ✅ Tạo PostgreSQL Flexible Server

> Đã hoàn thành. PostgreSQL 18, host: `arenablast-db.postgres.database.azure.com`

### 4.4b ⏳ Tạo database `arenablast` (chạy sau khi provider đăng ký xong)

```powershell
az postgres flexible-server db create `
  --resource-group arenablast-rg `
  --server-name arenablast-db `
  --name arenablast
```

> **Lỗi gặp phải**: Dùng flag `--database-name` không hợp lệ với Flexible Server.  
> **Fix**: Bỏ `--database-name`, tạo database riêng ở bước phụ.

```powershell
# Tạo server (mất ~3-5 phút)
az postgres flexible-server create `
  --resource-group arenablast-rg `
  --name arenablast-db `
  --location southeastasia `
  --admin-user arenablast_admin `
  --admin-password "Arena@2026!" `
  --sku-name Standard_B1ms `
  --tier Burstable `
  --public-access 0.0.0.0
```

Sau khi tạo server xong, tạo database:
```powershell
az postgres flexible-server db create `
  --resource-group arenablast-rg `
  --server-name arenablast-db `
  --database-name arenablast
```

---

## 4.5 ⏭️ Redis — BỎ QUA (Thêm sau nếu cần)

> **Quyết định**: Không tạo Redis để tiết kiệm credit ($16/tháng).  
> **Không ảnh hưởng**: Backend đã có graceful fallback — tự động chạy không cần Redis.  
> **Thêm sau**: Khi cần, chạy 2 lệnh là xong (xem cuối file).

---

## 4.6 ✅ Tạo Container Apps Environment

> Đã hoàn thành. Domain: `icyhill-22f427c6.southeastasia.azurecontainerapps.io`

```powershell
az containerapp env create `
  --name arenablast-env `
  --resource-group arenablast-rg `
  --location southeastasia
```

---

## 4.7 ⏳ Build & Push Docker Images lên ACR

```powershell
# Đăng nhập ACR
az acr login --name arenablastacr

# Build & Push Backend
cd D:\Game\backend
docker build -t arenablastacr.azurecr.io/arenablast-backend:latest .
docker push arenablastacr.azurecr.io/arenablast-backend:latest

# Build & Push Frontend
cd D:\Game\frontend
docker build -t arenablastacr.azurecr.io/arenablast-frontend:latest .
docker push arenablastacr.azurecr.io/arenablast-frontend:latest

# Xác nhận
az acr repository list --name arenablastacr
```

---

## 4.8 ⏳ Deploy Backend Container App

> Thay `<ACR_PASSWORD>` bằng password lấy ở bước 4.2.

```powershell
az containerapp create `
  --name arenablast-backend `
  --resource-group arenablast-rg `
  --environment arenablast-env `
  --image arenablastacr.azurecr.io/arenablast-backend:latest `
  --registry-server arenablastacr.azurecr.io `
  --registry-username arenablastacr `
  --registry-password "<ACR_PASSWORD>" `
  --target-port 3001 `
  --ingress external `
  --min-replicas 1 `
  --max-replicas 3 `
  --env-vars `
    NODE_ENV=production `
    PORT=3001 `
    DB_HOST=arenablast-db.postgres.database.azure.com `
    DB_PORT=5432 `
    DB_NAME=arenablast `
    DB_USER=arenablast_admin `
    DB_PASSWORD="Arena@2026!" `
    JWT_SECRET="super-secret-jwt-change-me-2026"
```

Lấy URL Backend:
```powershell
az containerapp show `
  --name arenablast-backend `
  --resource-group arenablast-rg `
  --query properties.configuration.ingress.fqdn `
  --output tsv
# Ví dụ: arenablast-backend.xxx.southeastasia.azurecontainerapps.io
```

---

## 4.9 ⏳ Chạy Schema Database trên Azure

```powershell
# Cần cài psql client: https://www.postgresql.org/download/
# Chọn "Command Line Tools" khi cài

psql "host=arenablast-db.postgres.database.azure.com port=5432 dbname=arenablast user=arenablast_admin password=Arena@2026! sslmode=require" `
  -f D:\Game\database\schema.sql

# Seed dữ liệu mẫu (tuỳ chọn)
$env:DB_HOST="arenablast-db.postgres.database.azure.com"
$env:DB_PASSWORD="Arena@2026!"
node D:\Game\database\seed.js
```

---

## 4.10 ⏳ Deploy Frontend Container App

> Thay `<BACKEND_FQDN>` bằng URL lấy ở bước 4.8 (không có https://).

```powershell
az containerapp create `
  --name arenablast-frontend `
  --resource-group arenablast-rg `
  --environment arenablast-env `
  --image arenablastacr.azurecr.io/arenablast-frontend:latest `
  --registry-server arenablastacr.azurecr.io `
  --registry-username arenablastacr `
  --registry-password "<ACR_PASSWORD>" `
  --target-port 80 `
  --ingress external `
  --min-replicas 1 `
  --max-replicas 2 `
  --env-vars `
    VITE_API_URL=https://<BACKEND_FQDN>/api `
    VITE_SOCKET_URL=https://<BACKEND_FQDN>
```

Lấy URL Frontend:
```powershell
az containerapp show `
  --name arenablast-frontend `
  --resource-group arenablast-rg `
  --query properties.configuration.ingress.fqdn `
  --output tsv
```

---

## 4.11 ⏳ Cấu hình GitHub Secrets → CI/CD tự động

```powershell
# Tạo Service Principal
az ad sp create-for-rbac `
  --name "arenablast-github-actions" `
  --role contributor `
  --scopes /subscriptions/$(az account show --query id -o tsv)/resourceGroups/arenablast-rg `
  --json-auth
# Copy toàn bộ JSON → GitHub Repo → Settings → Secrets → AZURE_CREDENTIALS
```

| GitHub Secret | Giá trị |
|---|---|
| `AZURE_CREDENTIALS` | JSON từ lệnh trên |
| `DB_PASSWORD` | `Arena@2026!` |
| `JWT_SECRET` | `super-secret-jwt-change-me-2026` |

---

## 4.12 Kiểm tra sau khi Deploy

```powershell
# Health check backend
curl https://<BACKEND_FQDN>/health

# Xem logs realtime
az containerapp logs show --name arenablast-backend --resource-group arenablast-rg --follow
```

---

## 💰 Ước tính chi phí (Không Redis)

| Resource | Tier | Chi phí/tháng |
|---|---|---|
| Container Registry | Basic | ~$5 |
| PostgreSQL | Burstable B1ms | ~$14 |
| Container Apps (2 apps) | Consumption | ~$2-3 |
| **Tổng** | | **~$21/tháng** |

> 💡 $100 student credit → dùng được ~**5 tháng**

**Tắt PostgreSQL khi không dùng để tiết kiệm thêm:**
```powershell
az postgres flexible-server stop --resource-group arenablast-rg --name arenablast-db
az postgres flexible-server start --resource-group arenablast-rg --name arenablast-db
```

---

## 🔌 Thêm Redis sau (khi cần)

```powershell
# Bước 1: Tạo Redis Cache
az redis create `
  --resource-group arenablast-rg `
  --name arenablast-redis `
  --location southeastasia `
  --sku Basic `
  --vm-size C0

# Bước 2: Lấy key
az redis list-keys --resource-group arenablast-rg --name arenablast-redis

# Bước 3: Cập nhật Backend Container App
az containerapp update `
  --name arenablast-backend `
  --resource-group arenablast-rg `
  --set-env-vars `
    REDIS_HOST=arenablast-redis.redis.cache.windows.net `
    REDIS_PORT=6380 `
    REDIS_PASSWORD="<REDIS_PRIMARY_KEY>"
```

---

## 🗑️ Dọn dẹp khi hoàn thành môn học

```powershell
az group delete --name arenablast-rg --yes --no-wait
```

---

*← [Giai đoạn 3 — GitHub CI/CD](./phase3-github-cicd.md) | [README chính →](../README.md)*
