# 🎮 Hướng Dẫn Phát Triển Dự Án ArenaBlast (Dành cho Team)

Chào mừng các bạn đến với dự án **ArenaBlast**! Tài liệu này sẽ hướng dẫn chi tiết cách cài đặt môi trường, quy trình làm việc nhóm bằng Git/GitHub để tránh xung đột (conflict), và cách hệ thống tự động triển khai (CI/CD).

---

## 1. 🛠 Cài Đặt Môi Trường Ban Đầu (Chỉ làm 1 lần)

Để bắt đầu code, mỗi thành viên cần setup dự án trên máy cá nhân:

**Bước 1: Clone dự án về máy**
```bash
git clone https://github.com/Tienanh4869/CloudComputing_AreaBlastGame.git
cd CloudComputing_AreaBlastGame
```

**Bước 2: Cài đặt thư viện**
Dự án được chia làm 2 phần độc lập là `frontend` và `backend`. Bạn cần cài đặt thư viện cho cả hai:
```bash
# Cài đặt Backend
cd backend
npm install

# Mở Terminal mới, cài đặt Frontend
cd ../frontend
npm install
```

**Bước 3: Thiết lập biến môi trường (.env)**
Tuyệt đối **không** push file `.env` chứa mật khẩu thật lên GitHub. Bạn hãy tạo file `.env` dựa trên file mẫu:
- Tại thư mục `backend`, tạo file `.env` và copy nội dung từ `.env.example` sang. (Điền thông tin database PostgreSQL local của bạn vào).
- Tại thư mục `frontend`, tạo file `.env.development` nếu cần tùy chỉnh URL API (Mặc định nó sẽ gọi tới localhost).

**Bước 4: Chạy dự án**
```bash
# Chạy Backend (Chạy tại port 3001)
cd backend
npm run dev

# Chạy Frontend (Chạy tại port 5173)
cd frontend
npm run dev
```

---

## 2. 🔀 Quy Trình Làm Việc Nhóm (Git Workflow)

Để không ai "đạp" lên code của ai, toàn team thống nhất sử dụng quy trình **GitHub Flow** như sau:

> ⚠️ **LUẬT THÉP:** Không ai được phép gõ lệnh `git push origin main` hoặc làm việc trực tiếp trên nhánh `main`. Nhánh `main` là code chuẩn đang chạy thực tế trên mạng (Production).

### Quy trình khi bạn được giao 1 task mới (Ví dụ: làm tính năng "Bảng xếp hạng")

**1. Cập nhật code mới nhất từ nhánh `main`**
```bash
git checkout main
git pull origin main
```

**2. Tạo nhánh làm việc riêng của bạn**
Tên nhánh nên bắt đầu bằng `feature/` (tính năng), `fix/` (sửa lỗi), hoặc tên của bạn.
```bash
git checkout -b feature/leaderboard
```

**3. Bắt tay vào code và chạy thử trên máy của bạn (Local)**
- Bạn có thể thoải mái thêm, xóa, sửa code trên nhánh này. Nó không ảnh hưởng tới ai cả.

**4. Lưu code và Đẩy nhánh của bạn lên GitHub**
```bash
git add .
git commit -m "Thêm tính năng Bảng xếp hạng"
git push origin feature/leaderboard
```

**5. Tạo Pull Request (PR)**
- Lên trang GitHub của dự án.
- GitHub sẽ hiện nút màu xanh **"Compare & pull request"**, hãy bấm vào đó.
- Viết mô tả ngắn gọn về những gì bạn đã làm và bấm **Create pull request** (Gửi yêu cầu gộp code vào nhánh `main`).

**6. Review & Gộp code (Merge)**
- Các thành viên khác sẽ vào xem code của bạn (Code Review).
- Nếu có xung đột (Conflict), GitHub sẽ báo đỏ. Bạn cần lấy code mới nhất của nhánh `main` về để xử lý xung đột.
- Nếu mọi người đều đồng ý (Approve), Trưởng nhóm sẽ bấm nút **Merge pull request**.
- Sau khi merge xong, bạn có thể xóa nhánh `feature/leaderboard` trên GitHub cho gọn.

---

## 3. 🚀 Hệ Thống Tự Động Triển Khai (CI/CD)

Dự án này đã được cấu hình **GitHub Actions**. Điều này có nghĩa là bạn không bao giờ phải tự tay gõ các lệnh rườm rà như Build Docker hay cấu hình lên server Azure nữa.

**Chuyện gì xảy ra khi Trưởng nhóm bấm nút "Merge pull request" vào nhánh `main`?**
1. GitHub Actions sẽ tự động chạy (Bạn có thể xem quá trình này ở tab **Actions** trên GitHub).
2. Nó sẽ tự động Test code của bạn xem có lỗi cú pháp không.
3. Nó tự động Build lại Docker cho Frontend và Backend.
4. Nó tự động đẩy code mới lên máy chủ **Azure Container Apps**.
5. Khoảng 2 phút sau, mọi tính năng mới bạn vừa viết sẽ xuất hiện trực tiếp trên trang web thật cho toàn thế giới chơi! 🎉

---

## 4. 💡 Xử Lý Lỗi Thường Gặp

- **Lỗi không kết nối được Database**: Kiểm tra lại file `backend/.env` xem thông tin đăng nhập PostgreSQL local đã đúng chưa.
- **Lỗi CORS khi gọi API**: Đảm bảo Backend đã cấu hình `CORS_ORIGIN` khớp với địa chỉ Frontend của bạn (thường là `http://localhost:5173`).
- **Lỗi Conflict Git**: Đừng hoảng sợ! Hãy gõ `git merge main` vào nhánh của bạn, sau đó dùng VS Code để giữ lại đoạn code đúng nhất, lưu lại và commit tiếp.

**Chúc team bạn có những giờ phút code thật vui và xây dựng ArenaBlast thành công rực rỡ!** 🎮🚀
