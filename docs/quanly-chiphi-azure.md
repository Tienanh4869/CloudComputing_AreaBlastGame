# 💰 Quản Lý Chi Phí Azure (Bật / Tắt Server)

Dự án này sử dụng Azure theo hình thức tính phí theo thời gian chạy (pay-as-you-go). Do đó, khi không có nhu cầu sử dụng (ví dụ: chờ đến ngày báo cáo), **bạn cần tắt các dịch vụ để bảo toàn số dư $100 Student Credit**.

> ⚠️ **LƯU Ý:** Các lệnh dưới đây phải được chạy trong **PowerShell hệ thống** (Win + R -> gõ `powershell`), không chạy trong Terminal của VS Code.

---

## 🛑 1. Lệnh Ngủ Đông (TẮT) để tiết kiệm tiền

Khi bạn đã code xong, demo xong và muốn cất dự án đi, hãy chạy lần lượt các lệnh này:

**1. Tắt Database (Quan trọng nhất - ngốn nhiều tiền nhất):**
Khi tắt, Azure chỉ tính một khoản phí lưu trữ vô cùng nhỏ, không tính phí CPU/RAM nữa.
```powershell
az postgres flexible-server stop --name arenablast-db --resource-group arenablast-rg
```
*(Lưu ý: Azure sẽ tự động bật lại Database sau 7 ngày nếu bạn không đụng tới nó. Nếu sau 7 ngày vẫn chưa báo cáo, bạn cần vào chạy lệnh stop này thêm 1 lần nữa).*

**2. Tắt máy chủ Game (Backend) & Giao diện (Frontend):**
```powershell
az containerapp stop --name arenablast-backend --resource-group arenablast-rg
az containerapp stop --name arenablast-frontend --resource-group arenablast-rg
```

---

## 🚀 2. Lệnh Đánh Thức (BẬT) vào ngày Demo/Báo cáo

Khoảng 5 phút trước khi lên báo cáo cho giảng viên, bạn hãy bật máy lên và gõ các lệnh sau để đánh thức toàn bộ hệ thống:

**1. Bật lại Database (Nên bật trước tiên):**
```powershell
az postgres flexible-server start --name arenablast-db --resource-group arenablast-rg
```

**2. Bật lại máy chủ Game (Backend) & Giao diện (Frontend):**
```powershell
az containerapp start --name arenablast-backend --resource-group arenablast-rg
az containerapp start --name arenablast-frontend --resource-group arenablast-rg
```

*Đợi khoảng 1-2 phút sau khi chạy xong các lệnh trên, bạn có thể truy cập lại link Frontend và chơi game bình thường, dữ liệu cũ vẫn còn nguyên vẹn!*

---

## 🔍 Kiểm tra nhanh trạng thái
Nếu bạn không chắc dịch vụ đang chạy hay đã tắt, dùng lệnh này để xem trạng thái của Database:
```powershell
az postgres flexible-server show --name arenablast-db --resource-group arenablast-rg --query "state" -o tsv
```
*(Nếu nó in ra `Stopped` là an toàn, in ra `Ready` là đang bị trừ tiền).*
