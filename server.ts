import express from 'express';
import fs from 'fs';
import path from 'path';
import net from 'net';
import zlib from 'zlib';
import JSZip from 'jszip';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

interface BrowseCacheEntry {
  expiresAt: number;
  payload: Record<string, unknown>;
}

const BROWSE_CACHE_TTL_MS = 90_000;
const BROWSE_CACHE_MAX = 48;
const browseResponseCache = new Map<string, BrowseCacheEntry>();

function getCachedBrowse(key: string): Record<string, unknown> | null {
  const entry = browseResponseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    browseResponseCache.delete(key);
    return null;
  }
  // Refresh LRU order
  browseResponseCache.delete(key);
  browseResponseCache.set(key, entry);
  return entry.payload;
}

function setCachedBrowse(key: string, payload: Record<string, unknown>) {
  if (browseResponseCache.size >= BROWSE_CACHE_MAX) {
    const oldest = browseResponseCache.keys().next().value;
    if (oldest) browseResponseCache.delete(oldest);
  }
  browseResponseCache.set(key, { expiresAt: Date.now() + BROWSE_CACHE_TTL_MS, payload });
}

function sendJsonCompressed(req: express.Request, res: express.Response, data: unknown) {
  const jsonStr = JSON.stringify(data);
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (jsonStr.length > 2048 && acceptEncoding.includes('gzip')) {
    zlib.gzip(Buffer.from(jsonStr, 'utf-8'), (err, compressed) => {
      if (err) {
        res.type('application/json').send(jsonStr);
        return;
      }
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.type('application/json').send(compressed);
    });
    return;
  }
  res.type('application/json').send(jsonStr);
}

const PORT = Number(process.env.PORT || 3000);
const RUST_CRATE_DIR = path.resolve(process.cwd(), 'rust-browser');

const DEFAULT_TRACKER_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'google-analytics.com', 'googletagmanager.com', 'adservice.google.com',
  'pagead2.googlesyndication.com', 'tpc.googlesyndication.com', 'static.doubleclick.net',
  'googleads.g.doubleclick.net', 'securepubads.g.doubleclick.net', 'adclick.g.doubleclick.net',
  'imasdk.googleapis.com', '2mdn.net', 'fundingchoicesmessages.google.com',
  'adnxs.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com',
  'indexww.com', 'criteo.com', 'criteo.net', 'amazon-adsystem.com', 'aax.amazon-adsystem.com',
  'adsrvr.org', 'bidswitch.net', 'smartadserver.com', '3lift.com', 'triplelift.com',
  'sharethrough.com', 'lijit.com', 'yieldmo.com', 'gumgum.com', 'teads.tv',
  'spotxchange.com', 'spotx.tv', 'springserve.com', 'contextweb.com', 'media.net',
  'adform.net', 'adroll.com', 'turn.com', 'mathtag.com', 'rlcdn.com', 'id5-sync.com',
  'crwdcntrl.net', 'bluekai.com', 'demdex.net', 'krxd.net', 'eyeota.net', 'tapad.com',
  'agkn.com', 'permutive.com', 'btloader.com', 'connatix.com', 'primis.tech', 'vidazoo.com',
  'aniview.com', 'vidoomy.com', 'rhythmone.com', 'undertone.com', 'kargo.com', 'sonobi.com',
  'emxdgt.com', '1rx.io', '33across.com', 'stickyadstv.com', 'inmobi.com',
  'unityads.unity3d.com', 'applovin.com', 'vungle.com', 'ironsrc.com', 'chartboost.com',
  'mediavine.com', 'adthrive.com', 'cafemedia.com', 'ezoic.net', 'ezojs.com', 'ezodn.com',
  'freestar.io', 'playwire.com', 'snigelweb.com', 'nitropay.com', 'buysellads.com',
  'carbonads.com', 'carbonads.net', 'proper.io', 'adpushup.com', 'setupad.com', 'vlitag.com',
  'ay.delivery', 'htlbid.com',
  'taboola.com', 'outbrain.com', 'mgid.com', 'revcontent.com', 'ntv.io', 'dianomi.com',
  'zergnet.com', 'content.ad', 'adblade.com', 'zemanta.com', 'ligatus.com', 'plista.com',
  'popads.net', 'popcash.net', 'propellerads.com', 'onclickalgo.com', 'monetag.com',
  'exoclick.com', 'trafficjunky.net', 'trafficstars.com', 'juicyads.com', 'adsterra.com',
  'hilltopads.net', 'clickadu.com', 'richpush.co', 'admaven.com', 'acscdn.com',
  'highperformanceformat.com', 'profitablegatecpm.com', 'topcreativeformat.com',
  'connect.facebook.net', 'ads.twitter.com', 'ads-api.twitter.com', 'analytics.twitter.com',
  'static.ads-twitter.com', 'bat.bing.com', 'ads.microsoft.com', 'advertising.com',
  'ads.yahoo.com', 'adtech.de', 'analytics.tiktok.com', 'sc-static.net', 'tr.snapchat.com',
  'px.ads.linkedin.com', 'snap.licdn.com', 'ct.pinterest.com', 'alb.reddit.com',
  'events.redditmedia.com', 'fls-na.amazon.com', 'mads.amazon.com',
  'scorecardresearch.com', 'quantserve.com', 'mixpanel.com', 'hotjar.com', 'segment.io',
  'fullstory.com', 'crazyegg.com', 'mouseflow.com', 'luckyorange.com', 'inspectlet.com',
  'chartbeat.com', 'chartbeat.net', 'omtrdc.net', '2o7.net', 'moatads.com',
  'doubleverify.com', 'adsafeprotected.com', 'integralads.com', 'bam.nr-data.net',
  'clarity.ms', 'amplitude.com', 'heapanalytics.com', 'kissmetrics.com', 'adjust.com',
  'appsflyer.com',
  'coinhive.com', 'coin-hive.com', 'cryptoloot.pro', 'crypto-loot.com', 'webminepool.com',
  'minero.cc', 'jsecoin.com', 'authedmine.com', 'monerominer.rocks', 'coinimp.com',
];

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_eid',
  'mc_cid',
  'yclid',
  'igshid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'ref_src',
]);

function stripTrackingParams(urlObj: URL): number {
  const keys: string[] = [];
  urlObj.searchParams.forEach((_v, k) => {
    const lower = k.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_QUERY_PARAMS.has(lower)) {
      keys.push(k);
    }
  });
  for (const k of keys) {
    urlObj.searchParams.delete(k);
  }
  return keys.length;
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '[::1]' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  const ipVersion = net.isIP(lower);
  if (ipVersion === 4) {
    const parts = lower.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
  } else if (ipVersion === 6) {
    if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
  }
  return false;
}

function buildCombinedRules(customRules: string[]): string[] {
  const seen = new Set<string>(DEFAULT_TRACKER_DOMAINS);
  for (const r of customRules) {
    const clean = r.trim().toLowerCase();
    if (clean) seen.add(clean);
  }
  return Array.from(seen);
}

function matchesTrackerDomain(urlStr: string, combinedRules: string[]): string | null {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    for (let i = 0; i < combinedRules.length; i++) {
      const clean = combinedRules[i];
      if (host === clean || host.endsWith(`.${clean}`)) {
        return clean;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function resolveAbsoluteUrl(raw: string, baseUrl: string): string {
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractReaderContent(rawHtml: string): string[] {
  const withoutChrome = rawHtml
    .replace(/<(script|style|nav|header|footer|aside|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const blocks: string[] = [];
  const blockRegex = /<(h1|h2|h3|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(withoutChrome)) !== null) {
    const stripped = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (stripped.length >= 20) {
      blocks.push(stripped);
    }
    if (blocks.length >= 40) break;
  }
  return blocks;
}

function sanitizeAndRewriteHtml(
  rawHtml: string,
  baseUrl: string,
  shieldEnabled: boolean,
  customRules: string[],
  fingerprintProtection: boolean
): {
  title: string;
  sanitizedHtml: string;
  blockedTrackers: string[];
  readerParagraphs: string[];
} {
  const blockedSet = new Set<string>();
  const combinedRules = shieldEnabled ? buildCombinedRules(customRules) : [];

  const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : baseUrl;
  const readerParagraphs = extractReaderContent(rawHtml);

  let cleaned = rawHtml
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match) => {
      if (shieldEnabled) {
        const srcMatch = match.match(/\bsrc=["']([^"']+)["']/i);
        if (srcMatch) {
          const abs = resolveAbsoluteUrl(srcMatch[1], baseUrl);
          const hit = matchesTrackerDomain(abs, combinedRules);
          if (hit) blockedSet.add(hit);
        }
      }
      return '';
    })
    .replace(/<(iframe|object|embed|applet|meta\s+http-equiv=["']refresh["'])[^>]*>([\s\S]*?<\/\1>)?/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  cleaned = cleaned.replace(
    /\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (full, attr: string, dq: string | undefined, sq: string | undefined) => {
      const val = (dq ?? sq ?? '').trim();
      if (!val || val.startsWith('#') || val.startsWith('data:')) {
        return full;
      }
      const lower = val.toLowerCase();
      if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) {
        return `${attr}="#"`;
      }
      let abs = resolveAbsoluteUrl(val, baseUrl);
      try {
        const parsedAbs = new URL(abs);
        if (parsedAbs.hostname.endsWith('duckduckgo.com') && parsedAbs.pathname.startsWith('/l/')) {
          const target = parsedAbs.searchParams.get('uddg');
          if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
            abs = target;
          }
        }
      } catch {
        // Keep resolved URL
      }

      if (shieldEnabled && attr.toLowerCase() === 'src') {
        const hit = matchesTrackerDomain(abs, combinedRules);
        if (hit) {
          blockedSet.add(hit);
          return `${attr}="about:blank" data-ferrox-blocked="${escapeHtml(hit)}"`;
        }
      }
      return `${attr}="${escapeHtml(abs)}"`;
    }
  );

  cleaned = cleaned
    .replace(
      /\btarget\s*=\s*(?:"(?:_blank|_new|blank)"|'(?:_blank|_new|blank)'|(?:_blank|_new))/gi,
      'target="_self"'
    )
    .replace(/\sping\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  const fingerprintScript = fingerprintProtection
    ? `try { Object.defineProperty(navigator, 'globalPrivacyControl', { get: function() { return true; } }); Object.defineProperty(navigator, 'doNotTrack', { get: function() { return '1'; } }); Object.defineProperty(navigator, 'hardwareConcurrency', { get: function() { return 4; } }); Object.defineProperty(navigator, 'deviceMemory', { get: function() { return 4; } }); } catch(_e) {}`
    : '';

  const bridgeScript = `
<script>
${fingerprintScript}
try {
  window.open = function(url) {
    if (typeof url === 'string' && url.trim() && url !== 'about:blank') {
      try {
        var resolved = new URL(url, ${JSON.stringify(baseUrl)}).href;
        if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
          window.parent.postMessage({ type: 'ferrox:navigate', url: resolved }, '*');
          return window;
        }
      } catch (_e) {}
    }
    return null;
  };
  if (window.HTMLAnchorElement && HTMLAnchorElement.prototype && HTMLAnchorElement.prototype.click) {
    var origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      try {
        var tgt = (this.getAttribute('target') || '').toLowerCase();
        if (tgt && tgt !== '_self' && tgt !== '_parent' && tgt !== '_top') {
          this.setAttribute('target', '_self');
        }
      } catch (_e) {}
      return origAnchorClick.apply(this, arguments);
    };
  }
} catch (_e) {}
document.addEventListener('mousedown', function(ev) {
  if (ev.button === 1 && ev.target && ev.target.closest && ev.target.closest('a[href]')) {
    ev.preventDefault();
  }
}, true);
document.addEventListener('auxclick', function(ev) {
  if (ev.button !== 1) return;
  var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
  if (!a) return;
  var href = a.href || a.getAttribute('href');
  if (!href || href.startsWith('#')) return;
  ev.preventDefault();
  window.parent.postMessage({ type: 'ferrox:open-bg-tab', url: href }, '*');
}, true);
document.addEventListener('click', function(ev) {
  var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
  if (!a) return;
  var href = a.getAttribute('href');
  if (!href || href.startsWith('#')) return;
  ev.preventDefault();
  if (ev.ctrlKey || ev.metaKey) {
    window.parent.postMessage({ type: 'ferrox:open-bg-tab', url: a.href || href }, '*');
  } else {
    window.parent.postMessage({ type: 'ferrox:navigate', url: a.href || href }, '*');
  }
}, true);
document.addEventListener('submit', function(ev) {
  var form = ev.target;
  if (!form) return;
  if (form.getAttribute) {
    var tgt = (form.getAttribute('target') || '').toLowerCase();
    if (tgt === '_blank' || tgt === '_new') {
      form.setAttribute('target', '_self');
    }
  }
  if (!form.action) return;
  var input = form.querySelector('input[name="q"], input[name="search"], input[type="search"], input[type="text"]');
  if (input && input.value) {
    ev.preventDefault();
    var action = form.getAttribute('action') || '';
    if (action.indexOf('duckduckgo') !== -1 || action.indexOf('/html/') !== -1) {
      window.parent.postMessage({ type: 'ferrox:navigate', url: 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(input.value) }, '*');
    } else {
      window.parent.postMessage({ type: 'ferrox:navigate', url: input.value }, '*');
    }
  } else if (form.action && (form.action.startsWith('http://') || form.action.startsWith('https://'))) {
    ev.preventDefault();
    window.parent.postMessage({ type: 'ferrox:navigate', url: form.action }, '*');
  }
}, true);
window.addEventListener('message', function(ev) {
  if (!ev.data || typeof ev.data !== 'object') return;
  if (ev.data.type === 'ferrox:autofill') {
    var userField = document.querySelector('input[type="email"], input[name*="user"], input[name*="email"], input[type="text"]');
    var passField = document.querySelector('input[type="password"]');
    if (userField && ev.data.username) userField.value = ev.data.username;
    if (passField && ev.data.password) passField.value = ev.data.password;
  } else if (ev.data.type === 'ferrox:find' && typeof ev.data.query === 'string') {
    if (ev.data.query.trim()) {
      window.find(ev.data.query, false, Boolean(ev.data.backwards), true, false, true, false);
    } else if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }
  }
});
</script>`;

  const adHideStyle = shieldEnabled
    ? `ins.adsbygoogle, .adsbygoogle, [id^="google_ads_iframe"], [id^="div-gpt-ad"], [data-ad-slot], [data-ad-unit], .OUTBRAIN, .ob-widget, [id^="taboola-"], .trc_related_container, .adthrive-ad, .mediavine-ad, .ezoic-ad, .ad-banner, .ad-leaderboard, .ad-sidebar, .ad-slot, .banner-ad, .sponsored-ad, shreddit-ad-post { display: none !important; }`
    : '';

  const fallbackStyle = `
<style>
  html, body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.55; }
  img { max-width: 100%; height: auto; }
  ${adHideStyle}
</style>`;

  if (/<\/head>/i.test(cleaned)) {
    cleaned = cleaned.replace(/<\/head>/i, `${fallbackStyle}</head>`);
  } else {
    cleaned = `${fallbackStyle}${cleaned}`;
  }

  if (/<\/body>/i.test(cleaned)) {
    cleaned = cleaned.replace(/<\/body>/i, `${bridgeScript}</body>`);
  } else {
    cleaned = `${cleaned}${bridgeScript}`;
  }

  return {
    title,
    sanitizedHtml: cleaned,
    blockedTrackers: Array.from(blockedSet),
    readerParagraphs,
  };
}

const BINARY_ASSET_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.ico',
  '.rgba',
  '.woff',
  '.woff2',
]);

function collectRustFiles(
  dir: string,
  baseDir: string
): Array<{ path: string; language: string; sizeBytes: number; isBinary: boolean; buffer: Buffer }> {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: Array<{
    path: string;
    language: string;
    sizeBytes: number;
    isBinary: boolean;
    buffer: Buffer;
  }> = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectRustFiles(fullPath, baseDir));
    } else {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const buffer = fs.readFileSync(fullPath);
      const ext = path.extname(entry.name).toLowerCase();
      const isBinary = BINARY_ASSET_EXTENSIONS.has(ext);
      const language =
        ext === '.rs'
          ? 'rust'
          : ext === '.toml'
          ? 'toml'
          : ext === '.md'
          ? 'markdown'
          : ext === '.html' || ext === '.manifest' || ext === '.xml'
          ? 'html'
          : ext === '.css'
          ? 'css'
          : ext === '.js'
          ? 'javascript'
          : ext === '.ps1' || ext === '.bat'
          ? 'shell'
          : 'text';
      results.push({
        path: relPath,
        language,
        sizeBytes: buffer.byteLength,
        isBinary,
        buffer,
      });
    }
  }
  return results;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const rustUiDir = path.join(RUST_CRATE_DIR, 'src', 'ui');
  if (fs.existsSync(rustUiDir)) {
    app.use('/api/rust-ui-preview', express.static(rustUiDir));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, engine: 'ferrox-proxy', version: '0.2.0' });
  });

  let cachedRustFilesJson: { crateName: string; files: Array<{ path: string; language: string; sizeBytes: number; content: string }> } | null = null;
  let cachedRustZipBuffer: Buffer | null = null;

  app.get('/api/rust-files', (req, res) => {
    if (!cachedRustFilesJson) {
      const files = collectRustFiles(RUST_CRATE_DIR, RUST_CRATE_DIR).map((f) => {
        if (f.isBinary) {
          return {
            path: f.path,
            language: f.language,
            sizeBytes: f.sizeBytes,
            content: `[Binary asset: ${f.path} (${(f.sizeBytes / 1024).toFixed(1)} KB) — embedded via include_bytes! in src/ui_assets.rs and packaged intact inside ferrox-browser-rust.zip.]`,
          };
        }
        if (f.path.startsWith('src/ui/') && f.sizeBytes > 32_000) {
          return {
            path: f.path,
            language: f.language,
            sizeBytes: f.sizeBytes,
            content: `/* FerroX Compiled Chrome UI Asset: ${f.path} (${(f.sizeBytes / 1024).toFixed(1)} KB) */\n/* Built from src/ (React 19 + Tailwind CSS + Lucide) via "npm run build:rust-ui". */\n/* Embedded via include_bytes! in src/ui_assets.rs and served over wry's custom protocol (ferrox://). */\n`,
          };
        }
        return {
          path: f.path,
          language: f.language,
          sizeBytes: f.sizeBytes,
          content: f.buffer.toString('utf-8'),
        };
      });
      cachedRustFilesJson = { crateName: 'ferrox-browser', files };
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    sendJsonCompressed(req, res, cachedRustFilesJson);
  });

  app.get('/api/rust-crate.zip', async (_req, res) => {
    try {
      if (!cachedRustZipBuffer) {
        const files = collectRustFiles(RUST_CRATE_DIR, RUST_CRATE_DIR);
        const zip = new JSZip();
        const rootFolder = zip.folder('ferrox-browser');
        if (rootFolder) {
          for (const file of files) {
            rootFolder.file(file.path, file.buffer);
          }
        }
        cachedRustZipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      }
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="ferrox-browser-rust.zip"');
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.send(cachedRustZipBuffer);
    } catch {
      res.status(500).json({ error: 'Failed to bundle Rust crate archive.' });
    }
  });

  app.get('/api/doh-resolve', async (req, res) => {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : 'cloudflare';
    const domain = typeof req.query.domain === 'string' ? req.query.domain.trim() : 'rust-lang.org';
    const customUrl = typeof req.query.customUrl === 'string' ? req.query.customUrl.trim() : '';

    if (!/^[a-zA-Z0-9.-]{1,253}$/.test(domain)) {
      return res.status(400).json({ error: 'Invalid domain name.' });
    }

    let endpoint = 'https://cloudflare-dns.com/dns-query';
    if (provider === 'quad9') {
      endpoint = 'https://dns.quad9.net:5053/dns-query';
    } else if (provider === 'google') {
      endpoint = 'https://dns.google/resolve';
    } else if (provider === 'custom' && customUrl) {
      try {
        const parsedCustom = new URL(customUrl);
        if (parsedCustom.protocol !== 'https:' || isPrivateOrBlockedHost(parsedCustom.hostname)) {
          return res.status(400).json({ error: 'Custom DoH URL must use public HTTPS.' });
        }
        endpoint = parsedCustom.toString();
      } catch {
        return res.status(400).json({ error: 'Invalid custom DoH URL.' });
      }
    }

    const start = Date.now();
    try {
      const url = `${endpoint}?name=${encodeURIComponent(domain)}&type=A`;
      const upstream = await fetch(url, {
        headers: { Accept: 'application/dns-json' },
      });
      const data = (await upstream.json()) as { Answer?: Array<{ data: string; TTL: number }> };
      const elapsedMs = Date.now() - start;
      const records = (data.Answer ?? []).map((a) => ({ ip: a.data, ttl: a.TTL }));
      return res.json({ ok: true, provider, domain, elapsedMs, records });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'DoH resolution failed.',
      });
    }
  });

  app.post('/api/translate', async (req, res) => {
    const { title, paragraphs, targetLanguage } = req.body as {
      title?: string;
      paragraphs?: string[];
      targetLanguage?: string;
    };

    if (!Array.isArray(paragraphs) || !targetLanguage) {
      return res.status(400).json({ error: 'Missing paragraphs or targetLanguage.' });
    }

    const snippet = paragraphs.slice(0, 12);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({
        translatedTitle: `[${targetLanguage}] ${title ?? 'Page'}`,
        translatedParagraphs: snippet.map((p) => `[${targetLanguage} preview] ${p}`),
        provider: 'offline-preview',
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Translate the following webpage title and paragraphs cleanly into ${targetLanguage}. Return valid JSON with keys "translatedTitle" (string) and "translatedParagraphs" (string array matching length ${snippet.length}).\n\nTitle: ${title ?? ''}\nParagraphs:\n${JSON.stringify(snippet)}`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const parsed = JSON.parse(response.text || '{}') as {
        translatedTitle?: string;
        translatedParagraphs?: string[];
      };
      return res.json({
        translatedTitle: parsed.translatedTitle ?? title ?? 'Translated Page',
        translatedParagraphs: Array.isArray(parsed.translatedParagraphs)
          ? parsed.translatedParagraphs
          : snippet,
        provider: 'gemini',
      });
    } catch {
      return res.json({
        translatedTitle: `[${targetLanguage}] ${title ?? 'Page'}`,
        translatedParagraphs: snippet,
        provider: 'fallback',
      });
    }
  });

  app.get('/api/browse', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const shieldEnabled = req.query.shield !== '0';
    const fingerprintProtection = req.query.fp !== '0';
    const limitKbps = Number(req.query.limitKbps || 0);
    const customRulesRaw = typeof req.query.rules === 'string' ? req.query.rules : '';
    const customRules = customRulesRaw
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url query parameter.' });
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format.' });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only http and https URLs are supported.' });
    }

    if (isPrivateOrBlockedHost(parsed.hostname)) {
      return res.status(403).json({
        error: 'Blocked private or loopback host by FerroX network sandbox.',
      });
    }

    const stripTrackers = req.query.stripTrackers !== '0';
    if (stripTrackers) {
      stripTrackingParams(parsed);
    }

    const combinedRules = shieldEnabled ? buildCombinedRules(customRules) : [];
    const trackerHit = shieldEnabled ? matchesTrackerDomain(parsed.toString(), combinedRules) : null;
    if (trackerHit) {
      return res.status(200).json({
        blockedByShield: true,
        matchedRule: trackerHit,
        finalUrl: parsed.toString(),
        title: `Blocked by Ad Shield (${trackerHit})`,
        status: 403,
        contentType: 'text/html',
        bytesTransferred: 0,
        elapsedMs: 1,
        effectiveKbps: 0,
        blockedTrackers: [trackerHit],
        readerParagraphs: [],
        sanitizedHtml: '',
      });
    }

    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const forceRefresh = req.query.refresh === '1';
    const cacheKey = `${parsed.toString()}|s:${shieldEnabled ? 1 : 0}|f:${fingerprintProtection ? 1 : 0}|r:${customRulesRaw}`;
    if (!forceRefresh && limitKbps <= 0) {
      const cached = getCachedBrowse(cacheKey);
      if (cached) {
        return sendJsonCompressed(req, res, { ...cached, elapsedMs: 1, cached: true });
      }
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const upstream = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-GPC': '1',
          DNT: '1',
        },
      });

      const finalUrl = upstream.url || parsed.toString();
      const contentType = upstream.headers.get('content-type') || 'text/html';
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const MAX_BYTES = 1_500_000;

      if (upstream.body) {
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.byteLength;
            chunks.push(Buffer.from(value));

            if (limitKbps > 0) {
              const targetMs = (value.byteLength / (limitKbps * 1024)) * 1000;
              if (targetMs > 8) {
                await new Promise((r) => setTimeout(r, Math.min(targetMs, 1500)));
              }
            }
            if (totalBytes >= MAX_BYTES) {
              await reader.cancel();
              break;
            }
          }
        }
      }

      clearTimeout(timer);
      const elapsedMs = Math.max(1, Date.now() - startTime);
      const effectiveKbps = Math.round((totalBytes / 1024 / (elapsedMs / 1000)) * 10) / 10;
      const bodyText = Buffer.concat(chunks).toString('utf-8');

      if (!contentType.includes('html')) {
        const safePlain = `<!doctype html><html><body style="background:#0f121a;color:#e2e8f0;font-family:ui-monospace,monospace;padding:24px;white-space:pre-wrap;">${escapeHtml(
          bodyText
        )}</body></html>`;
        return res.json({
          blockedByShield: false,
          finalUrl,
          title: finalUrl,
          status: upstream.status,
          contentType,
          bytesTransferred: totalBytes,
          elapsedMs,
          effectiveKbps,
          blockedTrackers: [],
          readerParagraphs: [bodyText.slice(0, 2000)],
          sanitizedHtml: safePlain,
        });
      }

      const { title, sanitizedHtml, blockedTrackers, readerParagraphs } = sanitizeAndRewriteHtml(
        bodyText,
        finalUrl,
        shieldEnabled,
        customRules,
        fingerprintProtection
      );

      const payload = {
        blockedByShield: false,
        finalUrl,
        title,
        status: upstream.status,
        contentType,
        bytesTransferred: totalBytes,
        elapsedMs,
        effectiveKbps,
        blockedTrackers,
        readerParagraphs,
        sanitizedHtml,
      };
      if (upstream.status >= 200 && upstream.status < 400 && limitKbps <= 0) {
        setCachedBrowse(cacheKey, payload);
      }
      return sendJsonCompressed(req, res, payload);
    } catch (err) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : 'Network error while fetching page.';
      return res.status(502).json({
        error: message,
        finalUrl: parsed.toString(),
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FerroX Browser server listening on http://localhost:${PORT}`);
  });
}

startServer();
