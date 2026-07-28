# ⚙️ Giai đoạn 3 — GitHub & CI/CD

> **Mục tiêu**: Đẩy code lên GitHub, cấu hình pipeline tự động (Test → Build Docker → Deploy Azure).  
> Mỗi khi push lên nhánh `main`, GitHub Actions sẽ tự động chạy toàn bộ quá trình.

---

## 3.1 Khởi tạo Git và Push lên GitHub

```bash
cd D:\Game

# Khởi tạo repo git
git init
git branch -M main

# Stage tất cả file
git add .

# Commit đầu tiên
git commit -m "feat: initial commit - ArenaBlast multiplayer game"

# Kết nối với GitHub (thay YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/arenablast.git

# Đẩy lên
git push -u origin main
```

> ⚠️ Tạo repo GitHub trước tại https://github.com/new  
> Chọn **Private**, **KHÔNG tích** "Add README" hay "Add .gitignore"

---

## 3.2 Cấu trúc GitHub Actions Pipeline

File: `.github/workflows/ci.yml`

```
Push lên nhánh main
        │
        ▼
┌─────────────────┐
│   Job 1: Test   │  ← npm ci + npm test (backend)
└────────┬────────┘
         │ (chỉ khi test pass)
         ▼
┌──────────────────────┐
│  Job 2: Build        │  ← Docker build & push lên Azure ACR
│  (chỉ chạy trên main)│
└────────┬─────────────┘
         │ (chỉ khi build pass)
         ▼
┌──────────────────────┐
│  Job 3: Deploy       │  ← az containerapp update
│  environment: prod   │
└──────────────────────┘
```

---

## 3.3 Cấu hình GitHub Secrets

Vào **GitHub Repo → Settings → Secrets and variables → Actions → New repository secret**

| Tên Secret | Giá trị | Lấy từ đâu |
|---|---|---|
| `AZURE_CREDENTIALS` | JSON Service Principal | Lệnh `az ad sp create-for-rbac` (xem Bước 3.4) |
| `DB_PASSWORD` | Mật khẩu PostgreSQL Azure | Tự đặt khi tạo DB |
| `JWT_SECRET` | Chuỗi bí mật ngẫu nhiên | Tự tạo |

---

## 3.4 Tạo Azure Service Principal (cho AZURE_CREDENTIALS)

Sau khi đã login Azure CLI và tạo Resource Group:

```bash
az ad sp create-for-rbac \
  --name "arenablast-github-actions" \
  --role contributor \
  --scopes /subscriptions/$(az account show --query id -o tsv)/resourceGroups/arenablast-rg \
  --json-auth
```

Output JSON mẫu (copy toàn bộ vào Secret `AZURE_CREDENTIALS`):
```json
{
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "subscriptionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

---

## 3.5 Quy trình làm việc sau khi setup xong

```bash
# Phát triển tính năng mới
git checkout -b feature/ten-tinh-nang

# ... code ...

git add .
git commit -m "feat: mô tả tính năng"
git push origin feature/ten-tinh-nang

# Tạo Pull Request trên GitHub → merge vào main
# → GitHub Actions tự động chạy test + deploy
```

---

## 3.6 Xem kết quả CI/CD

1. Vào GitHub Repo → tab **Actions**
2. Click vào workflow run mới nhất
3. Xem từng job: Test ✅ → Build ✅ → Deploy ✅

Nếu có lỗi, click vào job để xem log chi tiết.

---

## 3.7 Kiểm tra `.gitignore`

Các file/thư mục đã được loại trừ (không push lên GitHub):
```
node_modules/   ← Dependencies (quá nặng)
.env            ← Chứa mật khẩu, secrets
dist/           ← Build output
*.log           ← Log files
uploads/        ← Ảnh upload của người dùng (nên dùng Azure Blob Storage sau)
```

---

## 3.8 Nhánh và chiến lược Git

| Nhánh | Mục đích |
|---|---|
| `main` | Production — mỗi push đều deploy tự động |
| `develop` | Tích hợp tính năng trước khi merge vào main |
| `feature/*` | Tính năng mới |

---

*← [Giai đoạn 2 — Docker](./phase2-docker.md) | Tiếp theo: [Giai đoạn 4 — Azure →](./phase4-azure.md)*
