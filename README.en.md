# Azynora FB Notes

[Phiên bản Tiếng Việt](./README.md)

A Chrome extension for writing extended Facebook notes with music, custom durations, and enhanced security.

## What's New in v2.0.0 (Security Hardened)

- **Enhanced security:** Raw cookies and HTML never leave the page context — only extracted, sanitized tokens are passed to the extension.
- **XSS prevention:** Content script uses `textContent` + DOM API instead of `innerHTML`, completely eliminating XSS vectors.
- **Consistent token validation:** All tokens pass through `isSafeToken()` / `isSafeNumericId()` before use.
- **Rate limiting:** API call frequency is throttled to prevent abuse.
- **Code refactor:** Centralized `PageContext` extraction in `tokens.ts` reduces code duplication.

## Features

- **Beyond 60 characters:** Write notes up to 600 characters
- **Custom durations:** From 1 hour to 8 days, or enter custom minutes
- **Audience control:** Public, Friends, Contacts, or custom friend list
- **Music attachment:** Search, preview, trim 30-second clips
- **Dark theme:** Clean, minimal design
- **Multilingual:** Vietnamese and English
- **High security:** No data sent to external servers

## Security Improvements v2.0.0

| Issue (v1.x) | Fix (v2.0) |
|---|---|
| Raw `document.cookie` exposed to extension context | Only `c_user` extracted in page context; raw cookie never leaves the page |
| Full `document.documentElement.innerHTML` sent as-is | Only specific tokens extracted via regex; raw HTML never leaves the page |
| `innerHTML` in content script (XSS risk) | Uses `textContent` + `createElement` — no XSS vector |
| Inconsistent token validation | `isSafeToken()`, `isSafeNumericId()`, `sanitizePageMeta()` applied everywhere |
| No API rate limiting | 500ms rate limit between same-type requests |

## Installation

### Option 1: Pre-built (Recommended)

1. Download from [Releases](https://github.com/cyber-lab-9198/Fb-Notes-Extention/releases)
2. Extract to any folder
3. **For Chrome:**
   - Open Chrome → `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** → select the `chrome` folder inside the extracted directory.
4. **For Firefox (including Linux):**
   - Open Firefox → enter `about:debugging#/runtime/this-firefox` in the address bar.
   - Click **Load Temporary Add-on...** → select the `manifest.json` file inside the `firefox` folder of the extracted directory.

### Option 2: Build from source (supports Windows & Linux)

```bash
npm install
npm run build
```

After a successful build:
- The **Chrome** version is generated in `dist/chrome/`. Load this folder as an unpacked extension in Chrome.
- The **Firefox** version is generated in `dist/firefox/`. Load the `manifest.json` file in this folder via Firefox `about:debugging`.

## Usage

1. Open [Facebook](https://facebook.com) and log in
2. Click the extension icon in the Chrome toolbar
3. Write your note content (up to 600 characters)
4. Choose audience, duration, music (optional)
5. Click **Share**

## Development

```bash
npm install       # Install dependencies
npm run dev       # Development mode
npm run build     # Production build
```

## Notes

- Extension only works on facebook.com pages
- Character limit is 600 (Facebook API constraint for music notes)
- No data is sent to external servers — all requests go to facebook.com only

## License

MIT License

---

**Developed by Azynora**
