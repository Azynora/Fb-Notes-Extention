// Xử lý token Facebook - trích xuất và validate

export interface FacebookTokens {
  fb_dtsg: string;
  jazoest: string;
  userId: string;
  lsd: string;
}

export interface PageContext {
  tokens: FacebookTokens;
  spinR: string;
  spinB: string;
  spinT: string;
  rev: string;
  hsi: string;
  ccg: string;
  cometReq: string;
}

// check token có hợp lệ không (chỉ cho phép ASCII an toàn)
export const isSafeToken = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 6 || trimmed.length > 300) return false;
  return /^[A-Za-z0-9:_\-]+$/.test(trimmed);
};

const sanitizeToken = (value: string): string => {
  if (!value) return '';
  const trimmed = value.trim();
  return isSafeToken(trimmed) ? trimmed : '';
};

// check FB user ID (chỉ số)
export const isSafeNumericId = (value: unknown): value is string => {
  return typeof value === 'string' && /^\d{5,30}$/.test(value);
};

const sanitizePageMeta = (value: string): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length > 100) return '';
  if (!/^[A-Za-z0-9:_\-.]+$/.test(trimmed)) return '';
  return trimmed;
};

// --- trích xuất token từ page ---

const extractUserId = (cookie: string): string => {
  const match = /c_user=(\d+)/.exec(cookie);
  return match ? match[1] : '';
};

const extractFbDtsg = (html: string): string => {
  const regex = /"DTSG(?:Initia|Init)l?Data",\[],\{"token":"([^"\\]{8,300})"/m;
  const match = regex.exec(html);
  return match ? match[1] : '';
};

const extractJazoest = (dtsg: string): string => {
  if (!dtsg) return '';
  let sum = 0;
  for (let i = 0; i < dtsg.length; i++) {
    sum += dtsg.charCodeAt(i);
  }
  return '2' + sum;
};

const extractLsd = (html: string): string => {
  let match = /name="lsd" value="([^"\\]{6,300})"/m.exec(html);
  if (match) return match[1];
  match = /"LSD",\[],\{"token":"([^"\\]{6,300})"/m.exec(html);
  return match ? match[1] : '';
};

// lấy 4 token chính từ page
export const extractTokens = (cookie: string, html: string): FacebookTokens | null => {
  const userId = extractUserId(cookie);
  const fb_dtsg = sanitizeToken(extractFbDtsg(html));
  const jazoest = extractJazoest(fb_dtsg);
  const lsd = sanitizeToken(extractLsd(html));

  if (!userId || !fb_dtsg) return null;
  return { fb_dtsg, jazoest, userId, lsd };
};

// lấy full context 1 lần, sau đó ko cần đọc cookie/HTML nữa
export const extractPageContext = (cookie: string, html: string): PageContext | null => {
  const tokens = extractTokens(cookie, html);
  if (!tokens) return null;

  const ext = (regex: RegExp): string => {
    const match = regex.exec(html);
    return match ? match[1] : '';
  };

  return {
    tokens,
    spinR: sanitizePageMeta(ext(/"__spin_r":(\d+)/)),
    spinB: sanitizePageMeta(ext(/"__spin_b":"([^"]+)"/)),
    spinT: sanitizePageMeta(ext(/"__spin_t":(\d+)/)),
    rev: sanitizePageMeta(ext(/"client_revision":(\d+)/)),
    hsi: sanitizePageMeta(ext(/"hsi":"(\d+)"/)),
    ccg: sanitizePageMeta(ext(/"__ccg":"([^"]+)"/)),
    cometReq: sanitizePageMeta(ext(/"__comet_req":"?([^",}]+)"?/)),
  };
};

// tạo UUID v4 (cho client_mutation_id thôi, ko cần crypto)
export const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
