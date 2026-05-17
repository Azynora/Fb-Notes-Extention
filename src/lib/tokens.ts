/**
 * Facebook token extraction and validation utilities.
 *
 * Security notes:
 * - Tokens are extracted within the page context only. Raw cookie strings and
 *   full HTML bodies are never sent outside the page context.
 * - All extracted values pass through strict sanitization before use.
 */

export interface FacebookTokens {
  fb_dtsg: string;
  jazoest: string;
  userId: string;
  lsd: string;
}

/**
 * Extended page context containing all parameters needed for GraphQL requests.
 * Extracted once per session from the active Facebook page so that subsequent
 * operations never need to read cookies or DOM again.
 */
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

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

/**
 * Validates that a string looks like a safe Facebook token (short ASCII,
 * no embedded JSON/HTML/script).
 */
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

/**
 * Validates that a string is a numeric-only Facebook ID.
 */
export const isSafeNumericId = (value: unknown): value is string => {
  return typeof value === 'string' && /^\d{5,30}$/.test(value);
};

/**
 * Validates a spin/revision metadata value (numeric or short alphanumeric).
 */
const sanitizePageMeta = (value: string): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length > 100) return '';
  if (!/^[A-Za-z0-9:_\-.]+$/.test(trimmed)) return '';
  return trimmed;
};

// ---------------------------------------------------------------------------
// Token extraction (runs inside page context)
// ---------------------------------------------------------------------------

const extractUserId = (cookie: string): string => {
  // Only extract the c_user value – never expose the full cookie string.
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

/**
 * High-level helper: extracts only the four Facebook tokens from the page.
 *
 * @param cookie - `document.cookie` value (only `c_user` is read)
 * @param html   - `document.documentElement.innerHTML`
 * @returns FacebookTokens or null if essential tokens are missing.
 */
export const extractTokens = (cookie: string, html: string): FacebookTokens | null => {
  const userId = extractUserId(cookie);
  const fb_dtsg = sanitizeToken(extractFbDtsg(html));
  const jazoest = extractJazoest(fb_dtsg);
  const lsd = sanitizeToken(extractLsd(html));

  if (!userId || !fb_dtsg) {
    return null;
  }

  return { fb_dtsg, jazoest, userId, lsd };
};

/**
 * Extracts the full PageContext from the current page.
 * This is designed to be called **once** per session so that raw cookie
 * and HTML data never need to be accessed again.
 *
 * @param cookie - `document.cookie`
 * @param html   - `document.documentElement.innerHTML`
 */
export const extractPageContext = (cookie: string, html: string): PageContext | null => {
  const tokens = extractTokens(cookie, html);
  if (!tokens) return null;

  const extract = (regex: RegExp): string => {
    const match = regex.exec(html);
    return match ? match[1] : '';
  };

  return {
    tokens,
    spinR: sanitizePageMeta(extract(/"__spin_r":(\d+)/)),
    spinB: sanitizePageMeta(extract(/"__spin_b":"([^"]+)"/)),
    spinT: sanitizePageMeta(extract(/"__spin_t":(\d+)/)),
    rev: sanitizePageMeta(extract(/"client_revision":(\d+)/)),
    hsi: sanitizePageMeta(extract(/"hsi":"(\d+)"/)),
    ccg: sanitizePageMeta(extract(/"__ccg":"([^"]+)"/)),
    cometReq: sanitizePageMeta(extract(/"__comet_req":"?([^",}]+)"?/)),
  };
};

/**
 * Generates a v4-style UUID (not cryptographically secure – used for
 * client_mutation_id only).
 */
export const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
