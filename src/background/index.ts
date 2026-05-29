import type { FacebookTokens, PageContext } from '../lib/tokens';

interface CreateNoteMessage {
  type: 'CREATE_NOTE';
  tokens: FacebookTokens;
  description: string | null;
  duration: number;
  audienceSetting: 'DEFAULT' | 'FRIENDS' | 'PUBLIC' | 'CONTACTS' | 'CUSTOM';
  selectedFriendIds?: string[];
  selectedMusic?: {
    id: string;
    songId?: string;
    audioClusterId?: string;
    title: string;
    artist: string;
  } | null;
  musicTrimStartMs?: number;
}

interface GetTokensMessage {
  type: 'GET_TOKENS';
}

interface GetCurrentNoteStatusMessage {
  type: 'GET_CURRENT_NOTE_STATUS';
  tokens: FacebookTokens;
}

interface DeleteNoteMessage {
  type: 'DELETE_NOTE';
  tokens: FacebookTokens;
  richStatusId: string;
}

interface SearchMusicMessage {
  type: 'SEARCH_MUSIC';
  tokens: FacebookTokens;
  query: string;
  count?: number;
}

interface PlayMusicMessage {
  type: 'PLAY_MUSIC';
  tokens: FacebookTokens;
  musicId: string;
  songId?: string;
  audioClusterId?: string;
}

interface SearchFriendsMessage {
  type: 'SEARCH_FRIENDS';
  tokens: FacebookTokens;
  query: string;
  cursor?: string | null;
  count?: number;
}

type ExtensionMessage = CreateNoteMessage | GetTokensMessage | GetCurrentNoteStatusMessage | DeleteNoteMessage | SearchMusicMessage | SearchFriendsMessage | PlayMusicMessage;

// inject content script khi fb load xong
chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return;
  if (details.url.includes('facebook.com')) {
    chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: checkInitialState
    }).catch(() => {});
  }
});

function checkInitialState() {
  chrome.runtime.sendMessage({
    type: 'PAGE_LOADED',
    url: window.location.href
  });
}

// chống spam request
const _lastReq: Record<string, number> = {};
const RATE_MS = 500;
const _limited = (t: string) => {
  const n = Date.now();
  if (_lastReq[t] && n - _lastReq[t] < RATE_MS) return true;
  _lastReq[t] = n;
  return false;
};

// helper chung: chạy 1 function trên tab FB đang active, có timeout + check url
function execOnFbTab<T>(
  func: (...args: any[]) => T | Promise<T>,
  args: any[],
  sendResponse: (resp: any) => void,
  errMsg = 'Lỗi xử lý'
) {
  let done = false;
  const reply = (p: any) => { if (!done) { done = true; sendResponse(p); } };
  const timer = setTimeout(() => reply({ success: false, error: 'Timeout' }), 20000);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      clearTimeout(timer);
      reply({ success: false, error: 'Không tìm thấy tab' });
      return;
    }
    if (!(tabs[0].url || '').includes('facebook.com')) {
      clearTimeout(timer);
      reply({ success: false, error: 'Mở facebook.com trước' });
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func, args
    }, (results) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError || !results?.[0]) {
        reply({ success: false, error: chrome.runtime.lastError?.message || errMsg });
      } else {
        reply(results[0].result);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type !== 'GET_TOKENS' && _limited(message.type)) {
    sendResponse({ success: false, error: 'Quá nhanh, đợi chút' });
    return true;
  }

  if (message.type === 'GET_TOKENS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) { sendResponse({ error: 'Không có tab' }); return; }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: getPageContext
      }, (results) => {
        if (chrome.runtime.lastError || !results?.[0]) {
          sendResponse({ error: 'Không lấy được token' });
          return;
        }
        const ctx = results[0].result as PageContext | null;
        sendResponse({ tokens: ctx?.tokens ?? null });
      });
    });
    return true;
  }

  if (message.type === 'CREATE_NOTE') {
    execOnFbTab(
      createNoteFromPage,
      [message.tokens, message.description, message.duration, message.audienceSetting, message.selectedFriendIds || [], message.selectedMusic || null, message.musicTrimStartMs || 0],
      sendResponse, 'Tạo note thất bại'
    );
    return true;
  }

  if (message.type === 'GET_CURRENT_NOTE_STATUS') {
    execOnFbTab(fetchCurrentNoteStatusFromPage, [message.tokens], sendResponse, 'Lấy trạng thái thất bại');
    return true;
  }

  if (message.type === 'SEARCH_MUSIC') {
    execOnFbTab(searchMusicFromPage, [message.tokens, message.query, message.count ?? 80], sendResponse, 'Tìm nhạc thất bại');
    return true;
  }

  if (message.type === 'SEARCH_FRIENDS') {
    execOnFbTab(searchFriendsFromPage, [message.tokens, message.query, message.cursor ?? null, message.count ?? 20], sendResponse, 'Tìm bạn thất bại');
    return true;
  }

  if (message.type === 'DELETE_NOTE') {
    execOnFbTab(deleteNoteFromPage, [message.tokens, message.richStatusId], sendResponse, 'Xoá note thất bại');
    return true;
  }

  if (message.type === 'PLAY_MUSIC') {
    execOnFbTab(playMusicFromPage, [message.tokens, message.musicId, message.songId, message.audioClusterId], sendResponse, 'Phát nhạc thất bại');
    return true;
  }
});

// lấy token + metadata từ page context
function getPageContext() {
  const cookie = document.cookie;
  const html = document.documentElement.innerHTML;

  const userIdMatch = /c_user=(\d+)/.exec(cookie);
  const userId = userIdMatch ? userIdMatch[1] : '';

  const dtsgMatch = /"DTSG(?:Initia|Init)l?Data",\[],\{"token":"([^"\\]{8,300})"/m.exec(html);
  const fb_dtsg = dtsgMatch ? dtsgMatch[1] : '';
  if (!userId || !fb_dtsg) return null;

  let sum = 0;
  for (let i = 0; i < fb_dtsg.length; i++) sum += fb_dtsg.charCodeAt(i);
  const jazoest = '2' + sum;

  let lsdMatch = /name="lsd" value="([^"\\]{6,300})"/m.exec(html);
  if (!lsdMatch) lsdMatch = /"LSD",\[],\{"token":"([^"\\]{6,300})"/m.exec(html);
  const lsd = lsdMatch ? lsdMatch[1] : '';

  const ext = (re: RegExp) => { const m = re.exec(html); return m ? m[1] : ''; };

  return {
    tokens: { fb_dtsg, jazoest, userId, lsd },
    spinR: ext(/"__spin_r":(\d+)/),
    spinB: ext(/"__spin_b":"([^"]+)"/),
    spinT: ext(/"__spin_t":(\d+)/),
    rev: ext(/"client_revision":(\d+)/),
    hsi: ext(/"hsi":"(\d+)"/),
    ccg: ext(/"__ccg":"([^"]+)"/),
    cometReq: ext(/"__comet_req":"?([^",}]+)"?/),
  };
}

async function createNoteFromPage(
  tokens: FacebookTokens,
  description: string | null,
  duration: number,
  audienceSetting: 'DEFAULT' | 'FRIENDS' | 'PUBLIC' | 'CONTACTS' | 'CUSTOM',
  selectedFriendIds: string[],
  selectedMusic: { id: string; songId?: string; audioClusterId?: string; title: string; artist: string } | null,
  musicTrimStartMs: number
): Promise<{ success: boolean; error?: string }> {
  const isSafeToken = (value: unknown): value is string => {
    return typeof value === 'string' && /^[A-Za-z0-9:_-]{6,300}$/.test(value);
  };

  const extract = (source: string, regex: RegExp): string => {
    const match = regex.exec(source);
    return match?.[1] || '';
  };

  const pageHtml = document.documentElement.outerHTML;
  const spinR = extract(pageHtml, /"__spin_r":(\d+)/);
  const spinB = extract(pageHtml, /"__spin_b":"([^"]+)"/);
  const spinT = extract(pageHtml, /"__spin_t":(\d+)/);
  const rev = extract(pageHtml, /"client_revision":(\d+)/);
  const hsi = extract(pageHtml, /"hsi":"(\d+)"/);
  const ccg = extract(pageHtml, /"__ccg":"([^"]+)"/);
  const cometReq = extract(pageHtml, /"__comet_req":"?([^",}]+)"?/);

  const sendGraphQL = async (
    friendlyName: string,
    docId: string,
    variables: object
  ): Promise<{ ok: boolean; json?: any; error?: string }> => {
    const body = new URLSearchParams();
    body.append('av', tokens.userId);
    body.append('__user', tokens.userId);
    body.append('__a', '1');
    body.append('__comet_req', cometReq || '15');
    if (ccg) body.append('__ccg', ccg);
    body.append('dpr', String(self.devicePixelRatio || 1));
    body.append('fb_dtsg', tokens.fb_dtsg);
    body.append('jazoest', tokens.jazoest);
    if (isSafeToken(tokens.lsd)) body.append('lsd', tokens.lsd);
    if (spinR) body.append('__spin_r', spinR);
    if (spinB) body.append('__spin_b', spinB);
    body.append('__spin_t', spinT || String(Math.floor(Date.now() / 1000)));
    if (rev) body.append('__rev', rev);
    if (hsi) body.append('__hsi', hsi);
    body.append('fb_api_caller_class', 'RelayModern');
    body.append('fb_api_req_friendly_name', friendlyName);
    body.append('server_timestamps', 'true');
    body.append('variables', JSON.stringify(variables));
    body.append('doc_id', docId);

    const response = await fetch('/api/graphql/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-FB-Friendly-Name': friendlyName,
      },
      body: body.toString(),
    });

    const text = await response.text();
    const jsonText = text.replace('for (;;);', '').trim();

    let json: any;
    try {
      json = JSON.parse(jsonText);
    } catch {
      return { ok: false, error: `JSON lỗi: ${jsonText.slice(0, 200)}` };
    }

    if (json?.error) {
      const s = json.errorSummary || 'Request lỗi';
      const d = json.errorDescription || '';
      return { ok: false, error: `${s}${d ? ` - ${d}` : ''} (${json.error})` };
    }

    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      return { ok: false, error: json.errors[0]?.message || 'GraphQL lỗi' };
    }

    return { ok: true, json };
  };

  const normalizedDescription = typeof description === 'string' ? description.trim() : '';
  const hasMusic = Boolean(selectedMusic?.id);

  if (!normalizedDescription && !hasMusic) {
    return { success: false, error: 'Chưa nhập nội dung hoặc chọn nhạc' };
  }

  const mapPrivacy = (s: string) => {
    if (s === 'PUBLIC' || s === 'FRIENDS' || s === 'CONTACTS' || s === 'CUSTOM') return s;
    return 'CUSTOM';
  };

  const baseInput: Record<string, unknown> = {
    actor_id: tokens.userId,
    client_mutation_id: String((Date.now() % 9) + 1),
    audience_list_type: null,
    description: normalizedDescription,
    duration,
    note_type: 'TEXT_NOTE',
    privacy: mapPrivacy(audienceSetting),
    session_id: ''
  };

  const preferredAudioClusterId = selectedMusic
    ? (selectedMusic.songId || selectedMusic.audioClusterId || null)
    : null;

  const withMusicInput: Record<string, unknown> | null = selectedMusic
    ? (normalizedDescription
      ? {
        ...baseInput,
        description: normalizedDescription,
        note_type: 'MUSIC_NOTE_WITH_TEXT',
        audio_cluster_id: preferredAudioClusterId,
        song_start_time_ms: musicTrimStartMs,
      }
      : {
        ...baseInput,
        description: null,
        note_type: 'MUSIC_NOTE_MUSIC_ONLY',
        audio_cluster_id: preferredAudioClusterId,
        song_start_time_ms: musicTrimStartMs,
      })
    : null;

  const buildMusicVariants = (): Array<Record<string, unknown>> => {
    if (!selectedMusic) return [];

    const clusterIds = Array.from(
      new Set(
        [selectedMusic.songId, selectedMusic.audioClusterId]
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
      )
    );

    const out: Array<Record<string, unknown>> = [];
    for (const cid of clusterIds) {
      if (normalizedDescription) {
        out.push({
          ...baseInput, client_mutation_id: String((Date.now() % 9) + 1),
          description: normalizedDescription, note_type: 'MUSIC_NOTE_WITH_TEXT',
          audio_cluster_id: cid, song_start_time_ms: musicTrimStartMs,
        });
        out.push({
          ...baseInput, client_mutation_id: String((Date.now() % 9) + 1),
          description: normalizedDescription, note_type: 'MUSIC_NOTE',
          audio_cluster_id: cid, song_start_time_ms: musicTrimStartMs,
        });
      } else {
        out.push({
          ...baseInput, client_mutation_id: String((Date.now() % 9) + 1),
          description: null, note_type: 'MUSIC_NOTE_MUSIC_ONLY',
          audio_cluster_id: cid, song_start_time_ms: musicTrimStartMs,
        });
        out.push({
          ...baseInput, client_mutation_id: String((Date.now() % 9) + 1),
          description: '', note_type: 'MUSIC_NOTE',
          audio_cluster_id: cid, song_start_time_ms: musicTrimStartMs,
        });
      }
    }
    return out;
  };

  try {
    if (selectedMusic && !preferredAudioClusterId) {
      return { success: false, error: 'Thiếu ID nhạc, chọn lại bài' };
    }

    if (audienceSetting === 'CUSTOM') {
      if (!Array.isArray(selectedFriendIds) || selectedFriendIds.length === 0) {
        return { success: false, error: 'Chọn ít nhất 1 người bạn' };
      }

      const r = await sendGraphQL(
        'MWInboxTrayNoteCreationSelectorCustomParticipantsMutation',
        '23863727389920891',
        { input: { user_ids: selectedFriendIds, actor_id: tokens.userId, client_mutation_id: String(Date.now()) } }
      );
      if (!r.ok) return { success: false, error: `Lưu danh sách bạn lỗi: ${r.error}` };
    }

    const candidates: Array<Record<string, unknown>> = [];
    if (withMusicInput) {
      candidates.push(withMusicInput, ...buildMusicVariants());
    } else {
      candidates.push(baseInput);
    }

    // bỏ duplicate
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      const k = JSON.stringify(c);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    let result: { ok: boolean; json?: any; error?: string } = { ok: false, error: 'Không có input' };
    const errs: string[] = [];

    for (const c of unique) {
      result = await sendGraphQL('useMWInboxTrayCreateNoteMutation', '25742693715382390', { input: c });
      if (result.ok) break;
      if (result.error) errs.push(result.error);
    }

    if (!result.ok) {
      if (withMusicInput) {
        return { success: false, error: `Tạo note nhạc lỗi. ${errs.slice(0, 3).join(' | ') || result.error || ''}` };
      }
      const merged = errs.length > 0 ? ` (${errs.slice(0, 3).join(' | ')})` : '';
      return { success: false, error: `${result.error || 'Tạo note lỗi'}${merged}` };
    }

    const data = result.json?.data;
    if (!data || typeof data !== 'object') {
      return { success: false, error: `Response trống: ${JSON.stringify(result.json).slice(0, 200)}` };
    }

    const createdStatus = (data as Record<string, any>).xfb_rich_status_create?.status;
    const hasCreatedStatus = Boolean(createdStatus?.id);
    const hasMutationPayload = hasCreatedStatus || Object.entries(data).some(([key, value]) => {
      const k = key.toLowerCase();
      return (k.includes('createnote') || k.includes('inboxtray') || k.includes('rich_status'))
        && value !== null && value !== undefined;
    });

    if (!hasMutationPayload) {
      return { success: false, error: `Mutation trống: ${JSON.stringify(data).slice(0, 200)}` };
    }

    // cập nhật audience nếu cần
    if (audienceSetting !== 'DEFAULT' && audienceSetting !== 'CUSTOM') {
      const ar = await sendGraphQL(
        'MWInboxTrayNoteCreationAudienceSettingDialogPageMutation',
        '9845542138876958',
        { input: { actor_id: tokens.userId, client_mutation_id: String(Date.now()), new_audience_setting: audienceSetting } }
      );
      if (!ar.ok) return { success: false, error: `Tạo xong nhưng đổi audience lỗi: ${ar.error}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Lỗi không xác định' };
  }
}

async function deleteNoteFromPage(
  tokens: FacebookTokens,
  richStatusId: string
): Promise<{ success: boolean; error?: string }> {
  const isSafeToken = (value: unknown): value is string => {
    return typeof value === 'string' && /^[A-Za-z0-9:_-]{6,300}$/.test(value);
  };

  const extract = (source: string, regex: RegExp): string => {
    const match = regex.exec(source);
    return match?.[1] || '';
  };

  const safeId = typeof richStatusId === 'string' ? richStatusId.trim() : '';
  if (!/^[0-9]{5,30}$/.test(safeId)) {
    return { success: false, error: 'ID không hợp lệ' };
  }

  const pageHtml = document.documentElement.outerHTML;
  const spinR = extract(pageHtml, /"__spin_r":(\d+)/);
  const spinB = extract(pageHtml, /"__spin_b":"([^"]+)"/);
  const spinT = extract(pageHtml, /"__spin_t":(\d+)/);
  const rev = extract(pageHtml, /"client_revision":(\d+)/);
  const hsi = extract(pageHtml, /"hsi":"(\d+)"/);
  const ccg = extract(pageHtml, /"__ccg":"([^"]+)"/);
  const cometReq = extract(pageHtml, /"__comet_req":"?([^",}]+)"?/);

  const body = new URLSearchParams();
  body.append('av', tokens.userId);
  body.append('__user', tokens.userId);
  body.append('__a', '1');
  body.append('__comet_req', cometReq || '15');
  if (ccg) body.append('__ccg', ccg);
  body.append('dpr', String(self.devicePixelRatio || 1));
  body.append('fb_dtsg', tokens.fb_dtsg);
  body.append('jazoest', tokens.jazoest);
  if (isSafeToken(tokens.lsd)) body.append('lsd', tokens.lsd);
  if (spinR) body.append('__spin_r', spinR);
  if (spinB) body.append('__spin_b', spinB);
  body.append('__spin_t', spinT || String(Math.floor(Date.now() / 1000)));
  if (rev) body.append('__rev', rev);
  if (hsi) body.append('__hsi', hsi);
  body.append('fb_api_caller_class', 'RelayModern');
  body.append('fb_api_req_friendly_name', 'useMWInboxTrayDeleteNoteMutation');
  body.append('server_timestamps', 'true');
  body.append('variables', JSON.stringify({
    input: { actor_id: tokens.userId, client_mutation_id: String((Date.now() % 9) + 1), rich_status_id: safeId }
  }));
  body.append('doc_id', '9532619970198958');

  try {
    const response = await fetch('/api/graphql/', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-FB-Friendly-Name': 'useMWInboxTrayDeleteNoteMutation' },
      body: body.toString(),
    });
    const text = await response.text();
    const jsonText = text.replace('for (;;);', '').trim();

    let json: any;
    try { json = JSON.parse(jsonText); }
    catch { return { success: false, error: `JSON lỗi: ${jsonText.slice(0, 200)}` }; }

    if (json?.error) {
      return { success: false, error: `${json.errorSummary || 'Lỗi'} (${json.error})` };
    }
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      return { success: false, error: json.errors[0]?.message || 'GraphQL lỗi' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Xoá note lỗi' };
  }
}

async function searchFriendsFromPage(
  tokens: FacebookTokens,
  query: string,
  cursor: string | null,
  count: number
): Promise<{ success: boolean; error?: string; items?: Array<{ id: string; name: string; imageUri?: string }>; nextCursor?: string | null; hasNextPage?: boolean }> {
  const extract = (source: string, regex: RegExp): string => {
    const match = regex.exec(source);
    return match?.[1] || '';
  };

  const pageHtml = document.documentElement.outerHTML;
  const spinR = extract(pageHtml, /"__spin_r":(\d+)/);
  const spinB = extract(pageHtml, /"__spin_b":"([^"]+)"/);
  const spinT = extract(pageHtml, /"__spin_t":(\d+)/);
  const rev = extract(pageHtml, /"client_revision":(\d+)/);
  const hsi = extract(pageHtml, /"hsi":"(\d+)"/);
  const ccg = extract(pageHtml, /"__ccg":"([^"]+)"/);
  const cometReq = extract(pageHtml, /"__comet_req":"?([^",}]+)"?/);
  const normalizedQuery = (query || '').normalize('NFC');

  const body = new URLSearchParams();
  body.append('av', tokens.userId);
  body.append('__user', tokens.userId);
  body.append('__a', '1');
  body.append('__comet_req', cometReq || '15');
  if (ccg) body.append('__ccg', ccg);
  body.append('dpr', String(self.devicePixelRatio || 1));
  body.append('fb_dtsg', tokens.fb_dtsg);
  body.append('jazoest', tokens.jazoest);
  if (tokens.lsd) body.append('lsd', tokens.lsd);
  if (spinR) body.append('__spin_r', spinR);
  if (spinB) body.append('__spin_b', spinB);
  body.append('__spin_t', spinT || String(Math.floor(Date.now() / 1000)));
  if (rev) body.append('__rev', rev);
  if (hsi) body.append('__hsi', hsi);
  body.append('fb_api_caller_class', 'RelayModern');
  const isPagination = Boolean(cursor);
  body.append(
    'fb_api_req_friendly_name',
    isPagination
      ? 'StoriesCometPrivacySelectorFriendsBootstrapPaginationQuery'
      : 'StoriesCometPrivacySelectorFriendsBootstrapViewQuery'
  );
  body.append('server_timestamps', 'true');
  body.append('variables', JSON.stringify({ query: normalizedQuery, count, cursor, id: tokens.userId }));
  body.append('doc_id', isPagination ? '30431034176487438' : '9876530802468059');

  try {
    const response = await fetch('/api/graphql/', {
      method: 'POST', credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-FB-Friendly-Name': isPagination
          ? 'StoriesCometPrivacySelectorFriendsBootstrapPaginationQuery'
          : 'StoriesCometPrivacySelectorFriendsBootstrapViewQuery',
      },
      body: body.toString(),
    });
    const text = await response.text();
    const jsonText = text.replace('for (;;);', '').trim();

    let json: any;
    try { json = JSON.parse(jsonText); }
    catch { return { success: false, error: `JSON lỗi: ${jsonText.slice(0, 200)}` }; }

    if (json?.error) {
      return { success: false, error: `${json.errorSummary || 'Lỗi'} (${json.error})` };
    }
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      return { success: false, error: json.errors[0]?.message || 'GraphQL lỗi' };
    }

    const edges = json?.data?.user?.friends?.edges;
    const pageInfo = json?.data?.user?.friends?.page_info;

    if (!Array.isArray(edges)) {
      return { success: true, items: [], nextCursor: null, hasNextPage: false };
    }

    const items: Array<{ id: string; name: string; imageUri?: string }> = [];
    for (const edge of edges as any[]) {
      const node = edge?.node;
      if (!node || typeof node !== 'object') continue;
      const id = typeof node.id === 'string' ? node.id : '';
      const name = typeof node.name === 'string' ? node.name : '';
      const imageUri = typeof node?.photo?.uri === 'string' ? node.photo.uri : undefined;
      if (!id || !name) continue;
      items.push({ id, name, imageUri });
    }

    return {
      success: true, items,
      nextCursor: typeof pageInfo?.end_cursor === 'string' ? pageInfo.end_cursor : null,
      hasNextPage: Boolean(pageInfo?.has_next_page),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Tìm bạn lỗi' };
  }
}

async function searchMusicFromPage(
  tokens: FacebookTokens,
  query: string,
  count: number
): Promise<{ success: boolean; error?: string; items?: Array<{ id: string; songId?: string; audioClusterId?: string; title: string; artist: string; imageUri?: string; durationMs?: number; progressiveDownloadUrl?: string }> }> {
  const extract = (source: string, regex: RegExp): string => {
    const match = regex.exec(source);
    return match?.[1] || '';
  };

  const pageHtml = document.documentElement.outerHTML;
  const spinR = extract(pageHtml, /"__spin_r":(\d+)/);
  const spinB = extract(pageHtml, /"__spin_b":"([^"]+)"/);
  const spinT = extract(pageHtml, /"__spin_t":(\d+)/);
  const rev = extract(pageHtml, /"client_revision":(\d+)/);
  const hsi = extract(pageHtml, /"hsi":"(\d+)"/);
  const ccg = extract(pageHtml, /"__ccg":"([^"]+)"/);
  const cometReq = extract(pageHtml, /"__comet_req":"?([^",}]+)"?/);
  const normalizedQuery = (query || '').normalize('NFC');

  const toStringId = (value: unknown): string | undefined => {
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return undefined;
  };

  const pickClusterId = (item: any): string | undefined => {
    return (
      toStringId(item?.audio_cluster_id)
      || toStringId(item?.audio_cluster?.id)
      || toStringId(item?.audio_cluster?.audio_cluster_id)
      || toStringId(item?.audio_asset?.audio_cluster_id)
      || toStringId(item?.audio_asset?.id)
      || toStringId(item?.music_asset?.audio_cluster_id)
      || toStringId(item?.music_asset?.id)
      || toStringId(item?.track?.audio_cluster_id)
      || toStringId(item?.cluster_id)
    );
  };

  const body = new URLSearchParams();
  body.append('av', tokens.userId);
  body.append('__user', tokens.userId);
  body.append('__a', '1');
  body.append('__comet_req', cometReq || '15');
  if (ccg) body.append('__ccg', ccg);
  body.append('dpr', String(self.devicePixelRatio || 1));
  body.append('fb_dtsg', tokens.fb_dtsg);
  body.append('jazoest', tokens.jazoest);
  if (tokens.lsd) body.append('lsd', tokens.lsd);
  if (spinR) body.append('__spin_r', spinR);
  if (spinB) body.append('__spin_b', spinB);
  body.append('__spin_t', spinT || String(Math.floor(Date.now() / 1000)));
  if (rev) body.append('__rev', rev);
  if (hsi) body.append('__hsi', hsi);
  body.append('fb_api_caller_class', 'RelayModern');
  body.append('fb_api_req_friendly_name', 'useMWInboxTrayMusicNoteTypeaheadDataSourceQuery');
  body.append('server_timestamps', 'true');
  const safeCount = Math.max(1, Math.min(count || 80, 120));
  body.append('variables', JSON.stringify({ params: { first: safeCount, search_text: normalizedQuery }, product: 'FB_NOTES' }));
  body.append('doc_id', '24439058322365411');

  try {
    const response = await fetch('/api/graphql/', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-FB-Friendly-Name': 'useMWInboxTrayMusicNoteTypeaheadDataSourceQuery' },
      body: body.toString(),
    });
    const text = await response.text();
    const jsonText = text.replace('for (;;);', '').trim();

    let json: any;
    try { json = JSON.parse(jsonText); }
    catch { return { success: false, error: `JSON lỗi: ${jsonText.slice(0, 200)}` }; }

    if (json?.error) {
      return { success: false, error: `${json.errorSummary || 'Lỗi'} (${json.error})` };
    }
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      return { success: false, error: json.errors[0]?.message || 'GraphQL lỗi' };
    }

    const edges = json?.data?.xfb_music_picker_connection_container?.items?.edges;
    const itemsFromEdges = Array.isArray(edges)
      ? edges
        .flatMap((edge: any) => Array.isArray(edge?.node?.sub_items) ? edge.node.sub_items : [])
        .map((item: any) => ({
          id: String(item?.display_id || item?.id || ''),
          songId: item?.song_id ? String(item.song_id) : undefined,
          audioClusterId: toStringId(item?.song_id) || pickClusterId(item),
          title: String(item?.display_title?.text || ''),
          artist: String(item?.display_subtitle?.text || ''),
          imageUri: item?.display_image?.uri ? String(item.display_image.uri) : undefined,
          durationMs: typeof item?.duration_in_ms === 'number' ? item.duration_in_ms : undefined,
          progressiveDownloadUrl: Array.isArray(item?.progressive_download) && item.progressive_download[0]?.url
            ? String(item.progressive_download[0].url) : undefined,
        }))
        .filter((item: { id: string; title: string }) => Boolean(item.id) && Boolean(item.title))
      : [];

    const items: Array<{ id: string; songId?: string; audioClusterId?: string; title: string; artist: string; imageUri?: string; durationMs?: number; progressiveDownloadUrl?: string }> = [];
    const seen = new Set<string>();

    for (const item of itemsFromEdges) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      if (items.length >= safeCount) break;
    }

    // fallback: duyệt sâu nếu không tìm được từ edges
    if (items.length === 0) {
      const scan = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        const isAudio = node.__typename === 'AudioAsset'
          || (node.display_id && node.display_title && node.display_subtitle);
        if (isAudio) {
          const id = String(node?.display_id || node?.id || '');
          const title = String(node?.display_title?.text || '');
          if (id && title && !seen.has(id)) {
            seen.add(id);
            items.push({
              id,
              songId: node?.song_id ? String(node.song_id) : undefined,
              audioClusterId: toStringId(node?.song_id) || pickClusterId(node),
              title,
              artist: String(node?.display_subtitle?.text || ''),
              imageUri: node?.display_image?.uri ? String(node.display_image.uri) : undefined,
              durationMs: typeof node?.duration_in_ms === 'number' ? node.duration_in_ms : undefined,
              progressiveDownloadUrl: Array.isArray(node?.progressive_download) && node.progressive_download[0]?.url
                ? String(node.progressive_download[0].url) : undefined,
            });
            if (items.length >= safeCount) return;
          }
        }
        for (const value of Object.values(node)) {
          if (items.length >= safeCount) return;
          if (Array.isArray(value)) {
            for (const child of value) { scan(child); if (items.length >= safeCount) return; }
          } else if (value && typeof value === 'object') {
            scan(value);
          }
        }
      };
      scan(json?.data);
    }

    return { success: true, items };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Tìm nhạc lỗi' };
  }
}

async function fetchCurrentNoteStatusFromPage(
  tokens: FacebookTokens
): Promise<{
  success: boolean;
  error?: string;
  status?: {
    richStatusId?: string | null;
    avatarUri?: string;
    description?: string | null;
    noteType?: string | null;
    visibility?: string | null;
    expirationTime?: number | null;
    musicTitle?: string | null;
    musicArtist?: string | null;
    customAudienceNames?: string[];
    customAudienceSize?: number | null;
    defaultAudienceSetting?: string | null;
  };
}> {
  const isSafeToken = (value: unknown): value is string => {
    return typeof value === 'string' && /^[A-Za-z0-9:_-]{6,300}$/.test(value);
  };

  const extract = (source: string, regex: RegExp): string => {
    const match = regex.exec(source);
    return match?.[1] || '';
  };

  const pageHtml = document.documentElement.outerHTML;
  const spinR = extract(pageHtml, /"__spin_r":(\d+)/);
  const spinB = extract(pageHtml, /"__spin_b":"([^"]+)"/);
  const spinT = extract(pageHtml, /"__spin_t":(\d+)/);
  const rev = extract(pageHtml, /"client_revision":(\d+)/);
  const hsi = extract(pageHtml, /"hsi":"(\d+)"/);
  const ccg = extract(pageHtml, /"__ccg":"([^"]+)"/);
  const cometReq = extract(pageHtml, /"__comet_req":"?([^",}]+)"?/);

  const body = new URLSearchParams();
  body.append('av', tokens.userId);
  body.append('__user', tokens.userId);
  body.append('__a', '1');
  body.append('__comet_req', cometReq || '15');
  if (ccg) body.append('__ccg', ccg);
  body.append('dpr', String(self.devicePixelRatio || 1));
  body.append('fb_dtsg', tokens.fb_dtsg);
  body.append('jazoest', tokens.jazoest);
  if (isSafeToken(tokens.lsd)) body.append('lsd', tokens.lsd);
  if (spinR) body.append('__spin_r', spinR);
  if (spinB) body.append('__spin_b', spinB);
  body.append('__spin_t', spinT || String(Math.floor(Date.now() / 1000)));
  if (rev) body.append('__rev', rev);
  if (hsi) body.append('__hsi', hsi);
  body.append('fb_api_caller_class', 'RelayModern');
  body.append('fb_api_req_friendly_name', 'MWInboxTrayNoteCreationDialogQuery');
  body.append('server_timestamps', 'true');
  body.append('variables', JSON.stringify({ scale: 1 }));
  body.append('doc_id', '26067429279547490');

  try {
    const response = await fetch('/api/graphql/', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-FB-Friendly-Name': 'MWInboxTrayNoteCreationDialogQuery' },
      body: body.toString(),
    });
    const text = await response.text();
    const jsonText = text.replace('for (;;);', '').trim();

    let json: any;
    try { json = JSON.parse(jsonText); }
    catch { return { success: false, error: `JSON lỗi: ${jsonText.slice(0, 200)}` }; }

    if (json?.error) {
      return { success: false, error: `${json.errorSummary || 'Lỗi'} (${json.error})` };
    }
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      return { success: false, error: json.errors[0]?.message || 'GraphQL lỗi' };
    }

    const actor = json?.data?.viewer?.actor;
    const status = actor?.msgr_user_rich_status;

    // tìm richStatusId, duyệt sâu nếu cần
    const findStatusId = (root: any): string | null => {
      const visited = new Set<any>();
      const stack: any[] = [root];
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== 'object' || visited.has(node)) continue;
        visited.add(node);

        const cand = (node as any).rich_status_id ?? (node as any).richStatusId;
        if (typeof cand === 'string' && /^[0-9]{5,30}$/.test(cand)) return cand;

        const maybeId = (node as any).id;
        const maybeType = (node as any).__typename;
        if (typeof maybeId === 'string' && /^[0-9]{5,30}$/.test(maybeId)
          && (typeof maybeType !== 'string' || /rich|status/i.test(maybeType))) {
          return maybeId;
        }

        for (const value of Object.values(node)) {
          if (value && typeof value === 'object') stack.push(value);
        }
      }
      return null;
    };

    const richStatusId = typeof status?.id === 'string' && /^[0-9]{5,30}$/.test(status.id)
      ? status.id
      : (typeof status?.rich_status_id === 'string' && /^[0-9]{5,30}$/.test(status.rich_status_id)
        ? status.rich_status_id
        : findStatusId(json?.data));

    const musicMeta = status?.music_metadata;
    const licenseMusic = Array.isArray(musicMeta?.license_music) ? musicMeta.license_music[0] : null;
    const musicTitle = typeof licenseMusic?.title?.text === 'string'
      ? licenseMusic.title.text
      : (typeof musicMeta?.title === 'string' ? musicMeta.title : null);
    const musicArtist = typeof licenseMusic?.display_artist?.text === 'string'
      ? licenseMusic.display_artist.text
      : (typeof musicMeta?.artist_name === 'string' ? musicMeta.artist_name : null);

    const customAudience = Array.isArray(status?.custom_audience)
      ? status.custom_audience
      : Array.isArray(actor?.lightweight_status_custom_audience_list)
        ? actor.lightweight_status_custom_audience_list : [];

    const customAudienceNames = customAudience
      .map((item: any) => {
        if (typeof item?.short_name === 'string' && item.short_name.length > 0) return item.short_name;
        if (typeof item?.name === 'string' && item.name.length > 0) return item.name;
        return null;
      })
      .filter((name: string | null): name is string => Boolean(name));

    return {
      success: true,
      status: {
        richStatusId,
        avatarUri: typeof actor?.profilePicture?.uri === 'string' ? actor.profilePicture.uri : undefined,
        description: typeof status?.description === 'string' ? status.description : null,
        noteType: typeof status?.note_type === 'string' ? status.note_type : null,
        visibility: typeof status?.visibility === 'string' ? status.visibility : null,
        expirationTime: typeof status?.expiration_time === 'number' ? status.expiration_time : null,
        musicTitle,
        musicArtist,
        customAudienceNames,
        customAudienceSize: typeof status?.custom_audience_size === 'number' ? status.custom_audience_size : null,
        defaultAudienceSetting: typeof json?.data?.xfb_fetch_default_note_audience_setting === 'string'
          ? json.data.xfb_fetch_default_note_audience_setting : null,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Lấy trạng thái lỗi' };
  }
}

async function playMusicFromPage(
  tokens: FacebookTokens,
  musicId: string,
  songId?: string,
  audioClusterId?: string
): Promise<{ success: boolean; error?: string; progressiveDownload?: string }> {
  const isSafeToken = (value: unknown): value is string => {
    return typeof value === 'string' && /^[A-Za-z0-9:_-]{6,300}$/.test(value);
  };

  const extract = (source: string, regex: RegExp): string => {
    const match = regex.exec(source);
    return match?.[1] || '';
  };

  const pageHtml = document.documentElement.outerHTML;
  const spinR = extract(pageHtml, /"__spin_r":(\d+)/);
  const spinB = extract(pageHtml, /"__spin_b":"([^"]+)"/);
  const spinT = extract(pageHtml, /"__spin_t":(\d+)/);
  const rev = extract(pageHtml, /"client_revision":(\d+)/);
  const hsi = extract(pageHtml, /"hsi":"(\d+)"/);
  const ccg = extract(pageHtml, /"__ccg":"([^"]+)"/);
  const cometReq = extract(pageHtml, /"__comet_req":"?([^",}]+)"?/);

  const clusterId = songId || audioClusterId || musicId;

  const body = new URLSearchParams();
  body.append('av', tokens.userId);
  body.append('__user', tokens.userId);
  body.append('__a', '1');
  body.append('__comet_req', cometReq || '15');
  if (ccg) body.append('__ccg', ccg);
  body.append('dpr', String(self.devicePixelRatio || 1));
  body.append('fb_dtsg', tokens.fb_dtsg);
  body.append('jazoest', tokens.jazoest);
  if (isSafeToken(tokens.lsd)) body.append('lsd', tokens.lsd);
  if (spinR) body.append('__spin_r', spinR);
  if (spinB) body.append('__spin_b', spinB);
  body.append('__spin_t', spinT || String(Math.floor(Date.now() / 1000)));
  if (rev) body.append('__rev', rev);
  if (hsi) body.append('__hsi', hsi);
  body.append('fb_api_caller_class', 'RelayModern');
  body.append('fb_api_req_friendly_name', 'MWInboxTrayMusicNotePlayerQuery');
  body.append('server_timestamps', 'true');
  body.append('variables', JSON.stringify({ audio_cluster_id: clusterId, product: 'FB_NOTES' }));
  body.append('doc_id', '7296254287127256');

  try {
    const response = await fetch('/api/graphql/', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-FB-Friendly-Name': 'MWInboxTrayMusicNotePlayerQuery' },
      body: body.toString(),
    });
    const text = await response.text();
    const jsonText = text.replace('for (;;);', '').trim();

    let json: any;
    try { json = JSON.parse(jsonText); }
    catch { return { success: false, error: `JSON lỗi: ${jsonText.slice(0, 200)}` }; }

    if (json?.error) {
      return { success: false, error: `${json.errorSummary || 'Lỗi'} (${json.error})` };
    }
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      return { success: false, error: json.errors[0]?.message || 'GraphQL lỗi' };
    }

    // tìm url audio trong response
    const findAudioUrl = (node: any): string | null => {
      if (!node || typeof node !== 'object') return null;
      for (const key of ['progressive_download', 'progressive_download_url', 'audio_url', 'play_url']) {
        if (typeof node[key] === 'string' && node[key].length > 0) return node[key];
      }
      if (typeof node.uri === 'string' && node.uri.includes('audio')) return node.uri;
      if (typeof node.url === 'string' && node.url.includes('audio')) return node.url;
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object') {
          const r = findAudioUrl(value);
          if (r) return r;
        }
      }
      return null;
    };

    const url = findAudioUrl(json?.data);
    if (!url) return { success: false, error: 'Không tìm thấy URL audio' };
    return { success: true, progressiveDownload: url };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Phát nhạc lỗi' };
  }
}

export {};
