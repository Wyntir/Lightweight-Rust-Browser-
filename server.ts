import express from 'express';
import fs from 'fs';
import path from 'path';
import net from 'net';
import JSZip from 'jszip';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const PORT = Number(process.env.PORT || 3000);
const RUST_CRATE_DIR = path.resolve(process.cwd(), 'rust-browser');

const DEFAULT_TRACKER_DOMAINS = [
  'doubleclick.net',
  'googlesyndication.com',
  'google-analytics.com',
  'googletagmanager.com',
  'adservice.google.com',
  'connect.facebook.net',
  'scorecardresearch.com',
  'mixpanel.com',
  'hotjar.com',
  'segment.io',
  'ads.twitter.com',
];

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

function matchesTrackerDomain(urlStr: string, customRules: string[]): string | null {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    for (const rule of [...DEFAULT_TRACKER_DOMAINS, ...customRules]) {
      const clean = rule.trim().toLowerCase();
      if (!clean) continue;
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

  const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : baseUrl;
  const readerParagraphs = extractReaderContent(rawHtml);

  let cleaned = rawHtml
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match) => {
      if (shieldEnabled) {
        const srcMatch = match.match(/\bsrc=["']([^"']+)["']/i);
        if (srcMatch) {
          const abs = resolveAbsoluteUrl(srcMatch[1], baseUrl);
          const hit = matchesTrackerDomain(abs, customRules);
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
        const hit = matchesTrackerDomain(abs, customRules);
        if (hit) {
          blockedSet.add(hit);
          return `${attr}="about:blank" data-ferrox-blocked="${escapeHtml(hit)}"`;
        }
      }
      return `${attr}="${escapeHtml(abs)}"`;
    }
  );

  const fingerprintScript = fingerprintProtection
    ? `try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: function() { return 4; } }); Object.defineProperty(navigator, 'deviceMemory', { get: function() { return 4; } }); } catch(_e) {}`
    : '';

  const bridgeScript = `
<script>
${fingerprintScript}
document.addEventListener('click', function(ev) {
  var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
  if (!a) return;
  var href = a.getAttribute('href');
  if (!href || href.startsWith('#')) return;
  ev.preventDefault();
  window.parent.postMessage({ type: 'ferrox:navigate', url: a.href || href }, '*');
}, true);
document.addEventListener('submit', function(ev) {
  var form = ev.target;
  if (!form || !form.action) return;
  var input = form.querySelector('input[name="q"], input[name="search"], input[type="search"], input[type="text"]');
  if (input && input.value) {
    ev.preventDefault();
    var action = form.getAttribute('action') || '';
    if (action.indexOf('duckduckgo') !== -1 || action.indexOf('/html/') !== -1) {
      window.parent.postMessage({ type: 'ferrox:navigate', url: 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(input.value) }, '*');
    } else {
      window.parent.postMessage({ type: 'ferrox:navigate', url: input.value }, '*');
    }
  }
}, true);
window.addEventListener('message', function(ev) {
  if (!ev.data || ev.data.type !== 'ferrox:autofill') return;
  var userField = document.querySelector('input[type="email"], input[name*="user"], input[name*="email"], input[type="text"]');
  var passField = document.querySelector('input[type="password"]');
  if (userField && ev.data.username) userField.value = ev.data.username;
  if (passField && ev.data.password) passField.value = ev.data.password;
});
</script>`;

  const fallbackStyle = `
<style>
  html, body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.55; }
  img { max-width: 100%; height: auto; }
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

const BINARY_ASSET_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.ico', '.woff', '.woff2']);

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
          : ext === '.html'
          ? 'html'
          : ext === '.css'
          ? 'css'
          : ext === '.js'
          ? 'javascript'
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

  app.get('/api/rust-files', (_req, res) => {
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
    res.json({ crateName: 'ferrox-browser', files });
  });

  app.get('/api/rust-crate.zip', async (_req, res) => {
    try {
      const files = collectRustFiles(RUST_CRATE_DIR, RUST_CRATE_DIR);
      const zip = new JSZip();
      const rootFolder = zip.folder('ferrox-browser');
      if (rootFolder) {
        for (const file of files) {
          rootFolder.file(file.path, file.buffer);
        }
      }
      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="ferrox-browser-rust.zip"');
      res.send(buffer);
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

    const trackerHit = shieldEnabled ? matchesTrackerDomain(parsed.toString(), customRules) : null;
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

      return res.json({
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
      });
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
