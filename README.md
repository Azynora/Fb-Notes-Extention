# Azynora FB Notes

[English Version](./README.en.md)

Tiện ích Chrome mở rộng cho phép viết ghi chú Facebook dài, cắt nhạc, nghe thử và tuỳ chỉnh thời hạn hiển thị — với bảo mật được tăng cường.

## Có gì mới ở bản 2.0.0 (Security Hardened)

- **Bảo mật nâng cao:** Toàn bộ cookie và HTML gốc không còn rời khỏi page context — chỉ các token đã được trích xuất và sanitize mới được truyền ra.
- **Chống XSS:** Content script sử dụng `textContent` + DOM API thay vì `innerHTML`, loại bỏ hoàn toàn nguy cơ XSS.
- **Token validation nhất quán:** Tất cả token đều qua `isSafeToken()` / `isSafeNumericId()` trước khi sử dụng.
- **Rate limiting:** Giới hạn tần suất gọi API để tránh lạm dụng.
- **Code refactor:** Module `tokens.ts` cung cấp `PageContext` extraction tập trung, giảm code trùng lặp.

### Từ bản 1.1.0

- **Cắt nhạc & nghe thử:** Chọn đoạn 30 giây bất kỳ, kéo thả trực quan dạng sóng âm thanh.
- **Phát nhạc trực tiếp:** Phát/preview nhạc ngay từ kết quả tìm kiếm.
- **Giới hạn nội dung:** Tối đa 600 ký tự (tương thích API Facebook).

## Tính năng

- **Vượt giới hạn 60 ký tự:** Viết ghi chú dài tới 600 ký tự
- **Thời hạn tuỳ chỉnh:** Từ 1 giờ đến 8 ngày, hoặc nhập số phút tuỳ ý
- **Chọn đối tượng:** Công khai, bạn bè, danh bạ, hoặc tuỳ chỉnh danh sách
- **Đính kèm & cắt nhạc:** Tìm kiếm, nghe thử, cắt đoạn 30s
- **Giao diện tối:** Thiết kế tối giản, dễ nhìn
- **Đa ngôn ngữ:** Hỗ trợ Tiếng Việt và English
- **Bảo mật cao:** Không gửi dữ liệu ra server bên ngoài

<img src="screenshots/QR.jpg" width="300" alt="screenshot"/>

## Cải tiến bảo mật v2.0.0

| Vấn đề (v1.x) | Giải pháp (v2.0) |
|---|---|
| `document.cookie` gốc bị trả ra extension context | Chỉ trích xuất `c_user` trong page context, raw cookie không bao giờ rời trang |
| `document.documentElement.innerHTML` bị gửi nguyên vẹn | Chỉ trích xuất token cụ thể bằng regex, HTML gốc không rời trang |
| `innerHTML` trong content script (nguy cơ XSS) | Dùng `textContent` + `createElement` — không còn XSS vector |
| Không validate token nhất quán | `isSafeToken()`, `isSafeNumericId()`, `sanitizePageMeta()` áp dụng mọi nơi |
| Không giới hạn tần suất gọi API | Rate limiting 500ms giữa các request cùng loại |

## Cài đặt

### Cách 1: Tải extension đã build sẵn (Khuyên dùng)

1. Tải file từ [Releases](https://github.com/cyber-lab-9198/Fb-Notes-Extention/releases)
2. Giải nén vào thư mục bất kỳ
3. **Đối với Chrome:**
   - Mở Chrome → `chrome://extensions/`
   - Bật **Chế độ dành cho nhà phát triển**
   - Nhấn **Tải tiện ích đã giải nén** → chọn thư mục `chrome` vừa giải nén.
4. **Đối với Firefox (bao gồm cả Linux):**
   - Mở Firefox → nhập `about:debugging#/runtime/this-firefox` vào thanh địa chỉ.
   - Nhấn **Tải thành phần bổ trợ tạm thời...** (Load Temporary Add-on...) → chọn file `manifest.json` trong thư mục `firefox` vừa giải nén.

### Cách 2: Build từ source (hỗ trợ Windows và Linux)

```bash
npm install
npm run build
```

Sau khi build thành công:
- Phiên bản cho **Chrome** nằm ở thư mục `dist/chrome/`. Load thư mục này như extension unpacked trong Chrome.
- Phiên bản cho **Firefox** nằm ở thư mục `dist/firefox/`. Load file `manifest.json` trong thư mục này thông qua `about:debugging` trong Firefox.

## Hướng dẫn sử dụng

1. Mở [Facebook](https://facebook.com) và đăng nhập
2. Nhấn vào icon extension trên thanh công cụ Chrome
3. Viết nội dung ghi chú (tối đa 600 ký tự)
4. Chọn đối tượng, thời hạn, nhạc (tuỳ chọn)
5. Nhấn **Chia sẻ**

## Cấu trúc project

```
├── dist/                  # Extension đã build
├── public/
│   ├── icons/            # Icons
│   └── manifest.json     # Chrome extension manifest
├── src/
│   ├── background/       # Service worker (GraphQL API calls)
│   ├── content/          # Content script (decode hidden notes)
│   ├── lib/              # Token extraction & security utilities
│   └── popup/            # Popup UI (React)
├── popup.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Development

```bash
npm install       # Cài đặt dependencies
npm run dev       # Development mode
npm run build     # Production build
```

## Lưu ý

- Extension chỉ hoạt động khi đang ở trang facebook.com
- Giới hạn ký tự thực tế là 600 (do giới hạn API Facebook)
- Không có dữ liệu nào được gửi ra server bên ngoài — tất cả request chỉ đến facebook.com

## Giấy phép

MIT License

---

**Developed by Azynora**
# Fb-Notes-Extention
