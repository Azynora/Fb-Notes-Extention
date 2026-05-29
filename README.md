# Azynora FB Notes

[English Version](./README.en.md)

Extension hỗ trợ viết ghi chú Facebook dài hơn 60 ký tự, kèm nhạc, tuỳ chỉnh thời hạn, chọn đối tượng xem.

<img src="screenshots/QR.jpg" width="300" alt="screenshot"/>

## Tính năng chính

- Viết note dài tới 600 ký tự (bình thường FB giới hạn 60)
- Chọn thời hạn: từ 1h đến 8 ngày, hoặc nhập số phút tuỳ ý
- Chọn ai xem được: công khai / bạn bè / danh bạ / chọn người cụ thể
- Tìm nhạc, nghe thử, cắt đoạn 30s rồi đính kèm vào note
- Giao diện tối
- Hỗ trợ Tiếng Việt + English

## Bảo mật (v2.0)

- Token chỉ được trích xuất trong page context, cookie gốc không bao giờ gửi ra ngoài
- Content script dùng `textContent` thay vì `innerHTML` → không có XSS
- Tất cả token qua validate trước khi dùng
- Rate limiting 500ms giữa các request

## Cài đặt

### Tải bản build sẵn

1. Tải từ [Releases](https://github.com/cyber-lab-9198/Fb-Notes-Extention/releases)
2. Giải nén
3. **Chrome:** Mở `chrome://extensions/` → bật Developer mode → Load unpacked → chọn thư mục `chrome`
4. **Firefox:** Mở `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → chọn `manifest.json` trong thư mục `firefox`

### Build từ source

```bash
npm install
npm run build
```

Build xong:
- Chrome: `dist/chrome/`
- Firefox: `dist/firefox/`

## Cách dùng

1. Mở Facebook, đăng nhập
2. Click icon extension
3. Viết nội dung (tối đa 600 ký tự)
4. Chọn audience, thời hạn, nhạc (nếu muốn)
5. Bấm **Chia sẻ**

## Dev

```bash
npm install
npm run dev
npm run build
```

## Lưu ý

- Chỉ hoạt động trên facebook.com
- Giới hạn 600 ký tự (do API FB)
- Không gửi dữ liệu ra server ngoài

## License

MIT

---

**Developed by Azynora**
