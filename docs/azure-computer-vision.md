# Azure Computer Vision - Kiem duyet anh ArenaBlast

## Muc tieu

Truoc khi avatar hoac vu khi duoc luu vao Azure Blob Storage, Backend gui
noi dung anh den Azure Computer Vision API 3.2 voi tinh nang `Adult`.

Luot upload chi duoc chap nhan khi:

- Azure Computer Vision phan tich thanh cong.
- Anh khong bi danh dau `adult`, `racy` hoac `gory`.
- Diem tin cay khong vuot cac nguong cau hinh.

Neu dich vu kiem duyet dang bat nhung Azure khong phan hoi, Backend tra ve
HTTP `503` va khong upload anh. Anh bi tu choi tra ve HTTP `422`.

## Tai nguyen Azure

1. Tao Computer Vision resource ten `arenablast-vision` trong
   resource group `arenablast-rg`.
2. Uu tien pricing tier `F0` cho bai demo neu subscription cho phep.
3. Tai `Keys and Endpoint`, sao chep Endpoint va Key 1.
4. Luu Key 1 vao Key Vault `areablast-kv-123` bang secret:

```text
AZURE-VISION-KEY
```

Khong dua Key 1 vao source code, file `.env`, anh chup man hinh hoac GitHub.

## Cau hinh Backend Container App

Mo `arenablast-backend` > `Containers` > tao revision moi va them:

```text
AZURE_KEY_VAULT_NAME=areablast-kv-123
AZURE_VISION_ENDPOINT=https://<vision-resource>.cognitiveservices.azure.com/
AZURE_VISION_MODERATION_ENABLED=true
AZURE_VISION_ADULT_THRESHOLD=0.60
AZURE_VISION_RACY_THRESHOLD=0.70
AZURE_VISION_GORE_THRESHOLD=0.60
```

Managed Identity cua Backend Container App can co quyen doc secret trong
Key Vault. Khi khoi dong thanh cong, log phai co:

```text
[KeyVault] Successfully loaded AZURE-VISION-KEY
```

## Kiem tra

### Anh an toan

1. Mo trang Register hoac Lobby.
2. Chon anh JPG, PNG hoac WebP nho hon 2 MB.
3. Kiem tra API `POST /api/auth/upload` tra HTTP `200`.
4. Response phai co:

```json
{
  "url": "https://...",
  "moderation": {
    "checked": true,
    "safe": true,
    "provider": "azure-computer-vision-v3.2"
  }
}
```

5. Xac nhan anh moi xuat hien trong Blob container `arenablast-uploads`.

### Anh bi tu choi

Khong can tim hoac tai anh phan cam. De demo an toan, tao mot revision test
tam thoi voi `AZURE_VISION_ADULT_THRESHOLD=0`. Tai lai mot anh binh thuong:
API phai tra HTTP `422`, `code` la `UNSAFE_IMAGE`, va Blob Storage khong
duoc tao file moi. Sau khi chup bang chung, khoi phuc threshold ve `0.60`
va tao lai revision production.

### Loi cau hinh

Tam thoi dat sai Endpoint tren mot revision test. API phai tra HTTP `503`
voi `code` la `MODERATION_UNAVAILABLE`. Khoi phuc Endpoint ngay sau khi
chup bang chung.

## Bang chung bao cao

- Overview cua Computer Vision resource.
- Ten secret `AZURE-VISION-KEY` trong Key Vault, khong hien thi value.
- Container App revision co cac bien cau hinh, khong co API key.
- Network response HTTP `200` cua anh an toan.
- Network response HTTP `422` cua anh bi chan.
- Blob Storage co anh an toan va khong co anh bi chan.
- Log `Image moderation completed` cua Backend.

## Chay test

```bash
cd backend
npm install
npm test -- --runInBand
```
