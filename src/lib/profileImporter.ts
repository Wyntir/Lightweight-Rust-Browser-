import { BookmarkItem, HistoryItem, parseBookmarksImport } from './browserEngine';
import { VaultCredential } from './vaultCrypto';

export type BrowserSourceId = 'operagx' | 'firefox';

export interface ImportedProfilePreview {
  source: BrowserSourceId;
  bookmarks: BookmarkItem[];
  history: HistoryItem[];
  credentials: VaultCredential[];
  detectedFormats: string[];
}

export interface BrowserProfileSourceMeta {
  id: BrowserSourceId;
  name: string;
  windowsPath: string;
  macPath: string;
  linuxPath: string;
  supportedFiles: string;
}

export const BROWSER_PROFILE_SOURCES: Record<BrowserSourceId, BrowserProfileSourceMeta> = {
  operagx: {
    id: 'operagx',
    name: 'Opera GX',
    windowsPath: '%APPDATA%\\Opera Software\\Opera GX Stable\\',
    macPath: '~/Library/Application Support/com.operasoftware.OperaGX/',
    linuxPath: '~/.config/opera-gx/',
    supportedFiles: 'Bookmarks (JSON), bookmarks.html, Opera Passwords.csv, History JSON',
  },
  firefox: {
    id: 'firefox',
    name: 'Mozilla Firefox',
    windowsPath: '%APPDATA%\\Mozilla\\Firefox\\Profiles\\<profile>\\',
    macPath: '~/Library/Application Support/Firefox/Profiles/<profile>/',
    linuxPath: '~/.mozilla/firefox/<profile>/',
    supportedFiles: 'bookmarks-*.json, bookmarks.html, logins.csv, history.json',
  },
};

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function parseBrowserPasswordsCsv(
  csvText: string,
  source: BrowserSourceId
): VaultCredential[] {
  const rows = parseCsvRows(csvText.trim());
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const urlIdx = header.findIndex((h) => h === 'url' || h === 'origin' || h === 'hostname');
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'site');
  const userIdx = header.findIndex(
    (h) => h === 'username' || h === 'user' || h === 'email' || h === 'login'
  );
  const passIdx = header.findIndex((h) => h === 'password' || h === 'pass');

  if (userIdx === -1 || passIdx === -1) return [];

  const creds: VaultCredential[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const rawUrl = (urlIdx !== -1 ? cols[urlIdx] : cols[nameIdx] ?? '')?.trim() ?? '';
    const username = cols[userIdx]?.trim() ?? '';
    const password = cols[passIdx] ?? '';
    if (!rawUrl || !username || !password) continue;

    let site = rawUrl;
    try {
      site = new URL(rawUrl).hostname.replace(/^www\./, '');
    } catch {
      site = rawUrl;
    }

    creds.push({
      id: `imp-${source}-cred-${Date.now()}-${i}`,
      site,
      username,
      password,
      updatedAt: Date.now(),
    });
  }
  return creds;
}

interface ChromiumBookmarkNode {
  type?: string;
  name?: string;
  url?: string;
  children?: ChromiumBookmarkNode[];
}

function collectChromiumBookmarks(
  node: ChromiumBookmarkNode | undefined,
  category: string,
  out: BookmarkItem[],
  pinnedToBar: boolean
) {
  if (!node) return;
  if (node.type === 'url' && typeof node.url === 'string') {
    const url = node.url.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      out.push({
        id: `imp-gx-bm-${Date.now()}-${out.length}`,
        title: (node.name || url).trim(),
        url,
        category,
        pinnedToBar,
      });
    }
    return;
  }
  if (Array.isArray(node.children)) {
    const folderName = node.name?.trim() || category;
    for (const child of node.children) {
      collectChromiumBookmarks(child, folderName, out, pinnedToBar);
    }
  }
}

interface FirefoxBookmarkNode {
  type?: string;
  title?: string;
  uri?: string;
  children?: FirefoxBookmarkNode[];
}

function collectFirefoxBookmarks(
  node: FirefoxBookmarkNode | undefined,
  category: string,
  out: BookmarkItem[],
  pinnedToBar: boolean
) {
  if (!node) return;
  if (typeof node.uri === 'string' && (!node.type || node.type === 'text/x-moz-place')) {
    const url = node.uri.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      out.push({
        id: `imp-ff-bm-${Date.now()}-${out.length}`,
        title: (node.title || url).trim(),
        url,
        category,
        pinnedToBar,
      });
    }
  }
  if (Array.isArray(node.children)) {
    const nextCat = node.title?.trim() || category;
    const isToolbar =
      nextCat.toLowerCase().includes('toolbar') || pinnedToBar;
    for (const child of node.children) {
      collectFirefoxBookmarks(child, nextCat === 'toolbar' ? 'Bookmarks Toolbar' : nextCat, out, isToolbar);
    }
  }
}

export function parseProfilePayload(
  rawText: string,
  filename: string,
  source: BrowserSourceId
): ImportedProfilePreview {
  const trimmed = rawText.trim();
  const bookmarks: BookmarkItem[] = [];
  const history: HistoryItem[] = [];
  let credentials: VaultCredential[] = [];
  const detectedFormats: string[] = [];

  if (!trimmed) {
    return { source, bookmarks, history, credentials, detectedFormats };
  }

  const lowerName = filename.toLowerCase();

  // CSV passwords (Opera Passwords.csv / Firefox logins.csv)
  if (lowerName.endsWith('.csv') || (/^(name,)?url,username,password/i.test(trimmed) || /^"url","username","password"/i.test(trimmed))) {
    credentials = parseBrowserPasswordsCsv(trimmed, source);
    if (credentials.length > 0) {
      detectedFormats.push(`${source === 'operagx' ? 'Opera GX' : 'Firefox'} Passwords CSV`);
    }
  }

  // JSON formats (Opera GX Bookmarks, Firefox bookmarks-*.json, History JSON)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;

      // Chromium / Opera GX Bookmarks file
      if (parsed && typeof parsed === 'object' && 'roots' in parsed && parsed.roots && typeof parsed.roots === 'object') {
        const roots = parsed.roots as Record<string, ChromiumBookmarkNode>;
        collectChromiumBookmarks(roots.bookmark_bar, 'Opera GX Bar', bookmarks, true);
        collectChromiumBookmarks(roots.other, 'Opera GX Other', bookmarks, false);
        collectChromiumBookmarks(roots.synced, 'Opera GX Synced', bookmarks, false);
        if (bookmarks.length > 0) detectedFormats.push('Opera GX Bookmarks JSON');
      }

      // Mozilla Firefox bookmarks-*.json backup
      if (
        parsed &&
        typeof parsed === 'object' &&
        ('children' in parsed || parsed.type === 'text/x-moz-place-container')
      ) {
        collectFirefoxBookmarks(parsed as unknown as FirefoxBookmarkNode, 'Firefox', bookmarks, false);
        if (bookmarks.length > 0) detectedFormats.push('Firefox Bookmarks JSON');
      }

      // History JSON array or { history: [...] }
      const rawHistory = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { history?: unknown[] }).history)
        ? (parsed as { history: unknown[] }).history
        : null;

      if (rawHistory) {
        for (let i = 0; i < rawHistory.length; i++) {
          const entry = rawHistory[i] as Record<string, unknown>;
          const url = typeof entry?.url === 'string' ? entry.url : typeof entry?.uri === 'string' ? entry.uri : '';
          if (url.startsWith('http://') || url.startsWith('https://')) {
            history.push({
              id: `imp-hist-${source}-${Date.now()}-${i}`,
              title: (typeof entry.title === 'string' && entry.title.trim()) || url,
              url,
              visitedAt:
                typeof entry.lastVisitTime === 'number'
                  ? entry.lastVisitTime
                  : typeof entry.visit_date === 'number'
                  ? entry.visit_date
                  : Date.now() - i * 60_000,
            });
          }
        }
        if (history.length > 0) detectedFormats.push('Browser History JSON');
      }
    } catch {
      // Fall through to HTML parser
    }
  }

  // Fallback Netscape HTML bookmarks
  if (bookmarks.length === 0 && (trimmed.includes('<A ') || trimmed.includes('<a '))) {
    const htmlBookmarks = parseBookmarksImport(trimmed).map((b) => ({
      ...b,
      category: source === 'operagx' ? 'Opera GX Import' : 'Firefox Import',
    }));
    bookmarks.push(...htmlBookmarks);
    if (htmlBookmarks.length > 0) detectedFormats.push('Netscape Bookmarks HTML');
  }

  return { source, bookmarks, history, credentials, detectedFormats };
}

export function getSampleProfileData(source: BrowserSourceId): ImportedProfilePreview {
  if (source === 'operagx') {
    const sampleBookmarksJson = JSON.stringify({
      roots: {
        bookmark_bar: {
          name: 'Bookmarks bar',
          children: [
            { type: 'url', name: 'GX Corner', url: 'https://www.opera.com/gx' },
            { type: 'url', name: 'ProtonDB', url: 'https://www.protondb.com' },
            { type: 'url', name: 'Twitch', url: 'https://www.twitch.tv' },
          ],
        },
        other: {
          name: 'Other bookmarks',
          children: [
            { type: 'url', name: 'Rust Playground', url: 'https://play.rust-lang.org' },
          ],
        },
      },
    });
    const parsed = parseProfilePayload(sampleBookmarksJson, 'Bookmarks', 'operagx');
    parsed.history = [
      {
        id: `sample-gx-h1-${Date.now()}`,
        title: 'Opera GX — Gaming Browser Overview',
        url: 'https://www.opera.com/gx',
        visitedAt: Date.now() - 3600_000,
      },
      {
        id: `sample-gx-h2-${Date.now()}`,
        title: 'SteamDB Charts',
        url: 'https://steamdb.info',
        visitedAt: Date.now() - 7200_000,
      },
    ];
    parsed.detectedFormats.push('Opera GX History');
    return parsed;
  }

  const sampleFirefoxJson = JSON.stringify({
    type: 'text/x-moz-place-container',
    title: '',
    children: [
      {
        type: 'text/x-moz-place-container',
        title: 'Bookmarks Toolbar',
        children: [
          { type: 'text/x-moz-place', title: 'MDN Web Docs', uri: 'https://developer.mozilla.org' },
          { type: 'text/x-moz-place', title: 'Hacker News', uri: 'https://news.ycombinator.com' },
        ],
      },
      {
        type: 'text/x-moz-place-container',
        title: 'Bookmarks Menu',
        children: [
          { type: 'text/x-moz-place', title: 'Mozilla Add-ons', uri: 'https://addons.mozilla.org' },
        ],
      },
    ],
  });
  const parsed = parseProfilePayload(sampleFirefoxJson, 'bookmarks-2026-11-22.json', 'firefox');
  parsed.history = [
    {
      id: `sample-ff-h1-${Date.now()}`,
      title: 'MDN Web Docs — Web APIs',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API',
      visitedAt: Date.now() - 1800_000,
    },
    {
      id: `sample-ff-h2-${Date.now()}`,
      title: 'Rust Book — Ownership',
      url: 'https://doc.rust-lang.org/book/',
      visitedAt: Date.now() - 5400_000,
    },
  ];
  parsed.detectedFormats.push('Firefox Places History');
  return parsed;
}
