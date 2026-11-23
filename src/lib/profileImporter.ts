import { BookmarkItem, HistoryItem, parseBookmarksImport } from './browserEngine';
import { VaultCredential } from './vaultCrypto';

export type BrowserSourceId =
  | 'chrome'
  | 'edge'
  | 'brave'
  | 'operagx'
  | 'opera'
  | 'firefox'
  | 'vivaldi'
  | 'safari';

export const ALL_BROWSER_SOURCE_IDS: BrowserSourceId[] = [
  'chrome',
  'edge',
  'brave',
  'operagx',
  'opera',
  'firefox',
  'vivaldi',
  'safari',
];

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
  chrome: {
    id: 'chrome',
    name: 'Google Chrome',
    windowsPath: '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\',
    macPath: '~/Library/Application Support/Google/Chrome/Default/',
    linuxPath: '~/.config/google-chrome/Default/',
    supportedFiles: 'Bookmarks (JSON), bookmarks.html, Chrome Passwords.csv, History JSON',
  },
  edge: {
    id: 'edge',
    name: 'Microsoft Edge',
    windowsPath: '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\',
    macPath: '~/Library/Application Support/Microsoft Edge/Default/',
    linuxPath: '~/.config/microsoft-edge/Default/',
    supportedFiles: 'Bookmarks (JSON), bookmarks.html, Microsoft Edge Passwords.csv, History JSON',
  },
  brave: {
    id: 'brave',
    name: 'Brave',
    windowsPath: '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data\\Default\\',
    macPath: '~/Library/Application Support/BraveSoftware/Brave-Browser/Default/',
    linuxPath: '~/.config/BraveSoftware/Brave-Browser/Default/',
    supportedFiles: 'Bookmarks (JSON), bookmarks.html, Brave Passwords.csv, History JSON',
  },
  operagx: {
    id: 'operagx',
    name: 'Opera GX',
    windowsPath: '%APPDATA%\\Opera Software\\Opera GX Stable\\',
    macPath: '~/Library/Application Support/com.operasoftware.OperaGX/',
    linuxPath: '~/.config/opera-gx/',
    supportedFiles: 'Bookmarks (JSON), bookmarks.html, Opera Passwords.csv, History JSON',
  },
  opera: {
    id: 'opera',
    name: 'Opera',
    windowsPath: '%APPDATA%\\Opera Software\\Opera Stable\\',
    macPath: '~/Library/Application Support/com.operasoftware.Opera/',
    linuxPath: '~/.config/opera/',
    supportedFiles: 'Bookmarks (JSON), bookmarks.html, Opera Passwords.csv, History JSON',
  },
  firefox: {
    id: 'firefox',
    name: 'Firefox',
    windowsPath: '%APPDATA%\\Mozilla\\Firefox\\Profiles\\<profile>\\',
    macPath: '~/Library/Application Support/Firefox/Profiles/<profile>/',
    linuxPath: '~/.mozilla/firefox/<profile>/',
    supportedFiles: 'bookmarks-*.json, bookmarks.html, logins.csv, history.json (also LibreWolf/Waterfox/Floorp)',
  },
  vivaldi: {
    id: 'vivaldi',
    name: 'Vivaldi',
    windowsPath: '%LOCALAPPDATA%\\Vivaldi\\User Data\\Default\\',
    macPath: '~/Library/Application Support/Vivaldi/Default/',
    linuxPath: '~/.config/vivaldi/Default/',
    supportedFiles: 'Bookmarks (JSON), bookmarks.html, Vivaldi Passwords.csv, History JSON',
  },
  safari: {
    id: 'safari',
    name: 'Safari',
    windowsPath: 'macOS only — export Safari Bookmarks.html or Safari Passwords.csv',
    macPath: '~/Library/Safari/',
    linuxPath: 'macOS only — export Safari Bookmarks.html or Safari Passwords.csv',
    supportedFiles: 'Safari Bookmarks.html, Bookmarks.plist (XML), Safari Passwords.csv',
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
  const urlIdx = header.findIndex(
    (h) => h === 'url' || h === 'origin' || h === 'hostname' || h === 'website'
  );
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'site' || h === 'title');
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
  pinnedToBar: boolean,
  source: BrowserSourceId
) {
  if (!node) return;
  if (node.type === 'url' && typeof node.url === 'string') {
    const url = node.url.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      out.push({
        id: `imp-${source}-bm-${Date.now()}-${out.length}`,
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
      collectChromiumBookmarks(child, folderName, out, pinnedToBar, source);
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
    const isToolbar = nextCat.toLowerCase().includes('toolbar') || pinnedToBar;
    for (const child of node.children) {
      collectFirefoxBookmarks(
        child,
        nextCat === 'toolbar' ? 'Bookmarks Toolbar' : nextCat,
        out,
        isToolbar
      );
    }
  }
}

function parseSafariXmlPlistBookmarks(xmlText: string): BookmarkItem[] {
  const results: BookmarkItem[] = [];
  const dictRe = /<dict>([\s\S]*?)<\/dict>/gi;
  let match: RegExpExecArray | null;
  while ((match = dictRe.exec(xmlText)) !== null) {
    const block = match[1];
    const urlMatch = block.match(/<key>URLString<\/key>\s*<string>([^<]+)<\/string>/i);
    if (!urlMatch) continue;
    const url = urlMatch[1].trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
    const titleMatch = block.match(/<key>title<\/key>\s*<string>([^<]+)<\/string>/i);
    results.push({
      id: `imp-safari-bm-${Date.now()}-${results.length}`,
      title: (titleMatch?.[1] || url).trim(),
      url,
      category: 'Safari Import',
      pinnedToBar: results.length < 4,
    });
  }
  return results;
}

export function inferBrowserSourceFromPath(relPath: string): BrowserSourceId {
  const lower = relPath.toLowerCase();
  if (lower.includes('firefox') || lower.includes('mozilla') || lower.includes('librewolf') || lower.includes('waterfox') || lower.includes('floorp') || lower.includes('bookmarkbackups')) {
    return 'firefox';
  }
  if (lower.includes('opera gx') || lower.includes('opera-gx')) return 'operagx';
  if (lower.includes('opera')) return 'opera';
  if (lower.includes('edge')) return 'edge';
  if (lower.includes('brave')) return 'brave';
  if (lower.includes('vivaldi')) return 'vivaldi';
  if (lower.includes('safari')) return 'safari';
  return 'chrome';
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

  const meta = BROWSER_PROFILE_SOURCES[source] ?? BROWSER_PROFILE_SOURCES.chrome;
  const lowerName = filename.toLowerCase();

  // CSV passwords (Chrome / Edge / Brave / Opera / Vivaldi / Safari / Firefox)
  if (
    lowerName.endsWith('.csv') ||
    /^(name|title)?,?(url|website|hostname),username,password/i.test(trimmed) ||
    /^"(name|title|url|website)","(url|username)"/i.test(trimmed)
  ) {
    credentials = parseBrowserPasswordsCsv(trimmed, source);
    if (credentials.length > 0) {
      detectedFormats.push(`${meta.name} Passwords CSV`);
    }
  }

  // JSON formats (Chromium Bookmarks, Firefox bookmarks-*.json, History JSON)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;

      // Chromium Bookmarks file (Chrome, Edge, Brave, Opera GX, Opera, Vivaldi, Arc)
      if (
        parsed &&
        typeof parsed === 'object' &&
        'roots' in parsed &&
        parsed.roots &&
        typeof parsed.roots === 'object'
      ) {
        const roots = parsed.roots as Record<string, ChromiumBookmarkNode>;
        collectChromiumBookmarks(roots.bookmark_bar, `${meta.name} Bar`, bookmarks, true, source);
        collectChromiumBookmarks(roots.other, `${meta.name} Other`, bookmarks, false, source);
        collectChromiumBookmarks(roots.synced, `${meta.name} Synced`, bookmarks, false, source);
        if (bookmarks.length > 0) detectedFormats.push(`${meta.name} Bookmarks JSON`);
      }

      // Mozilla Firefox / Gecko bookmarks-*.json backup
      if (
        parsed &&
        typeof parsed === 'object' &&
        ('children' in parsed || parsed.type === 'text/x-moz-place-container')
      ) {
        collectFirefoxBookmarks(
          parsed as unknown as FirefoxBookmarkNode,
          'Firefox',
          bookmarks,
          false
        );
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
          const url =
            typeof entry?.url === 'string'
              ? entry.url
              : typeof entry?.uri === 'string'
              ? entry.uri
              : '';
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
      // Fall through to XML/HTML parsers
    }
  }

  // Safari XML plist bookmarks
  if (bookmarks.length === 0 && (trimmed.includes('<plist') || trimmed.includes('<key>URLString</key>'))) {
    const safariBookmarks = parseSafariXmlPlistBookmarks(trimmed);
    bookmarks.push(...safariBookmarks);
    if (safariBookmarks.length > 0) detectedFormats.push('Safari Bookmarks Plist');
  }

  // Universal Netscape HTML bookmarks (supported by every browser)
  if (bookmarks.length === 0 && (trimmed.includes('<A ') || trimmed.includes('<a '))) {
    const htmlBookmarks = parseBookmarksImport(trimmed).map((b) => ({
      ...b,
      category: `${meta.name} Import`,
    }));
    bookmarks.push(...htmlBookmarks);
    if (htmlBookmarks.length > 0) detectedFormats.push('Netscape Bookmarks HTML');
  }

  return { source, bookmarks, history, credentials, detectedFormats };
}

export function getSampleProfileData(source: BrowserSourceId): ImportedProfilePreview {
  if (source === 'firefox') {
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

  if (source === 'safari') {
    const safariHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DT><A HREF="https://webkit.org">WebKit Blog</A>
<DT><A HREF="https://developer.apple.com">Apple Developer</A>
<DT><A HREF="https://www.rust-lang.org">Rust Language</A>`;
    const parsed = parseProfilePayload(safariHtml, 'Safari Bookmarks.html', 'safari');
    parsed.history = [
      {
        id: `sample-safari-h1-${Date.now()}`,
        title: 'WebKit Standards & Privacy',
        url: 'https://webkit.org',
        visitedAt: Date.now() - 2400_000,
      },
    ];
    parsed.detectedFormats.push('Safari History');
    return parsed;
  }

  const chromiumSamples: Record<
    Exclude<BrowserSourceId, 'firefox' | 'safari'>,
    {
      bar: Array<{ name: string; url: string }>;
      other: Array<{ name: string; url: string }>;
      history: Array<{ title: string; url: string }>;
    }
  > = {
    operagx: {
      bar: [
        { name: 'GX Corner', url: 'https://www.opera.com/gx' },
        { name: 'ProtonDB', url: 'https://www.protondb.com' },
        { name: 'Twitch', url: 'https://www.twitch.tv' },
      ],
      other: [{ name: 'Rust Playground', url: 'https://play.rust-lang.org' }],
      history: [
        { title: 'Opera GX — Gaming Browser Overview', url: 'https://www.opera.com/gx' },
        { title: 'SteamDB Charts', url: 'https://steamdb.info' },
      ],
    },
    opera: {
      bar: [
        { name: 'Opera Portal', url: 'https://www.opera.com' },
        { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
      ],
      other: [{ name: 'Crates.io', url: 'https://crates.io' }],
      history: [{ title: 'Opera Browser', url: 'https://www.opera.com' }],
    },
    chrome: {
      bar: [
        { name: 'GitHub', url: 'https://github.com' },
        { name: 'YouTube', url: 'https://www.youtube.com' },
        { name: 'Gmail', url: 'https://mail.google.com' },
      ],
      other: [{ name: 'Docs.rs', url: 'https://docs.rs' }],
      history: [
        { title: 'GitHub Repositories', url: 'https://github.com' },
        { title: 'Chrome Web Store', url: 'https://chromewebstore.google.com' },
      ],
    },
    edge: {
      bar: [
        { name: 'Microsoft Learn', url: 'https://learn.microsoft.com' },
        { name: 'GitHub', url: 'https://github.com' },
      ],
      other: [{ name: 'WebView2 Docs', url: 'https://learn.microsoft.com/en-us/microsoft-edge/webview2/' }],
      history: [
        { title: 'Microsoft Learn Documentation', url: 'https://learn.microsoft.com' },
      ],
    },
    brave: {
      bar: [
        { name: 'Brave Search', url: 'https://search.brave.com' },
        { name: 'EFF Cover Your Tracks', url: 'https://coveryourtracks.eff.org' },
      ],
      other: [{ name: 'Privacy Guides', url: 'https://www.privacyguides.org' }],
      history: [
        { title: 'EFF Cover Your Tracks', url: 'https://coveryourtracks.eff.org' },
      ],
    },
    vivaldi: {
      bar: [
        { name: 'Vivaldi Community', url: 'https://vivaldi.net' },
        { name: 'Lobsters', url: 'https://lobste.rs' },
      ],
      other: [{ name: 'Rust Forum', url: 'https://users.rust-lang.org' }],
      history: [{ title: 'Vivaldi Browser', url: 'https://vivaldi.com' }],
    },
  };

  const spec = chromiumSamples[source];
  const sampleBookmarksJson = JSON.stringify({
    roots: {
      bookmark_bar: {
        name: 'Bookmarks bar',
        children: spec.bar.map((item) => ({ type: 'url', name: item.name, url: item.url })),
      },
      other: {
        name: 'Other bookmarks',
        children: spec.other.map((item) => ({ type: 'url', name: item.name, url: item.url })),
      },
    },
  });
  const parsed = parseProfilePayload(sampleBookmarksJson, 'Bookmarks', source);
  parsed.history = spec.history.map((h, idx) => ({
    id: `sample-${source}-h${idx}-${Date.now()}`,
    title: h.title,
    url: h.url,
    visitedAt: Date.now() - (idx + 1) * 3600_000,
  }));
  parsed.detectedFormats.push(`${BROWSER_PROFILE_SOURCES[source].name} History`);
  return parsed;
}
