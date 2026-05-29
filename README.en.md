# Azynora FB Notes

[Phiên bản Tiếng Việt](./README.md)

Chrome/Firefox extension that lets you write longer Facebook notes (up to 600 chars), attach music clips, and control who sees them.

## Features

- Write notes up to 600 characters (normally FB limits to 60)
- Custom duration: 1 hour to 8 days, or enter any number of minutes
- Audience control: public, friends, contacts, or pick specific people
- Music: search, preview, trim a 30s clip
- Dark theme
- Vietnamese + English UI

## Security (v2.0)

- Tokens extracted in page context only, raw cookies never leave the page
- Content script uses `textContent` instead of `innerHTML` — no XSS
- All tokens validated before use
- 500ms rate limiting between requests

## Install

### Pre-built

1. Grab from [Releases](https://github.com/cyber-lab-9198/Fb-Notes-Extention/releases)
2. Unzip
3. **Chrome:** `chrome://extensions/` → Developer mode → Load unpacked → pick the `chrome` folder
4. **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → pick `manifest.json` in the `firefox` folder

### Build yourself

```bash
npm install
npm run build
```

Output goes to `dist/chrome/` and `dist/firefox/`.

## Usage

1. Open Facebook, log in
2. Click the extension icon
3. Write your note (max 600 chars)
4. Pick audience, duration, music if you want
5. Hit **Share**

## Dev

```bash
npm install
npm run dev
npm run build
```

## Notes

- Only works on facebook.com
- 600 char limit is a Facebook API thing
- No data sent to external servers

## License

MIT

---

**Developed by Azynora**
