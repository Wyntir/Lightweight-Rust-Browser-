import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canGoBack,
  canGoForward,
  createTab,
  DEFAULT_LIMITER_CONFIG,
  evaluateResourceBudget,
  evaluateUrlSecurity,
  exportBookmarksHtml,
  normalizeAddressInput,
  parseBookmarksImport,
  scanDownloadFilename,
  searchTabs,
  shouldBlockUrl,
  stepBack,
  stepForward,
  tabHistoryNavigate,
} from './browserEngine';
import { decryptVaultCredentials, encryptVaultCredentials } from './vaultCrypto';

test('normalizeAddressInput handles internal, domain, http, and search inputs', () => {
  assert.equal(normalizeAddressInput(''), 'ferrox://speed-dial');
  assert.equal(normalizeAddressInput('ferrox://rust-source'), 'ferrox://rust-source');
  assert.equal(normalizeAddressInput('ferrox://hub'), 'ferrox://hub');
  assert.equal(normalizeAddressInput('ferrox://unknown-route'), 'ferrox://speed-dial');
  assert.equal(normalizeAddressInput('example.com'), 'https://example.com/');
  assert.equal(normalizeAddressInput('https://docs.rs/egui'), 'https://docs.rs/egui');
  assert.equal(normalizeAddressInput('localhost:3000'), 'http://localhost:3000');
  assert.equal(
    normalizeAddressInput('rust egui wry browser', 'duckduckgo'),
    'https://html.duckduckgo.com/html/?q=rust%20egui%20wry%20browser'
  );
});

test('tab history navigation supports back, forward, and branch truncation', () => {
  let tab = createTab('t1', 'personal', 'ferrox://speed-dial', 1000);
  assert.equal(canGoBack(tab), false);
  assert.equal(canGoForward(tab), false);

  tab = tabHistoryNavigate(tab, 'https://example.com', 'Example', 2000);
  tab = tabHistoryNavigate(tab, 'https://www.rust-lang.org', 'Rust', 3000);
  assert.equal(canGoBack(tab), true);
  assert.equal(canGoForward(tab), false);

  tab = stepBack(tab, 4000);
  assert.equal(tab.url, 'https://example.com');
  assert.equal(canGoForward(tab), true);

  tab = tabHistoryNavigate(tab, 'https://crates.io', 'Crates', 5000);
  assert.equal(canGoForward(tab), false);
  assert.deepEqual(tab.history, [
    'ferrox://speed-dial',
    'https://example.com',
    'https://crates.io',
  ]);

  tab = stepBack(tab, 6000);
  tab = stepForward(tab, 7000);
  assert.equal(tab.url, 'https://crates.io');
});

test('evaluateResourceBudget protects active, split, and pinned tabs while hibernating oldest idle', () => {
  const t1 = createTab('t1', 'personal', 'https://example.com', 100);
  const t2 = { ...createTab('t2', 'personal', 'https://docs.rs', 200), pinned: true };
  const t3 = createTab('t3', 'personal', 'https://crates.io', 300);
  const t4 = createTab('t4', 'personal', 'https://rust-lang.org', 400);

  const result = evaluateResourceBudget(
    [t1, t2, t3, t4],
    't3',
    {
      ...DEFAULT_LIMITER_CONFIG,
      ramEnabled: true,
      ramLimitMb: 310,
    },
    't4'
  );

  assert.deepEqual(result.hibernatedIds, ['t1']);
  assert.equal(result.tabs.find((t) => t.id === 't1')?.hibernated, true);
  assert.equal(result.tabs.find((t) => t.id === 't2')?.hibernated, false);
  assert.equal(result.tabs.find((t) => t.id === 't3')?.hibernated, false);
  assert.equal(result.tabs.find((t) => t.id === 't4')?.hibernated, false);
  assert.equal(result.totalRamMb, 296);
});

test('evaluateUrlSecurity enforces HTTPS upgrades and blocks phishing domains', () => {
  const upgraded = evaluateUrlSecurity('http://example.com/docs', true, true);
  assert.equal(upgraded.safe, true);
  assert.equal(upgraded.upgradedUrl, 'https://example.com/docs');
  assert.equal(upgraded.upgradedFromHttp, true);

  const phish = evaluateUrlSecurity('https://malware.testing.google.test/bad', true, true);
  assert.equal(phish.safe, false);
  assert.equal(phish.threatType, 'malware');
});

test('bookmarks import/export roundtrips HTML and JSON cleanly', () => {
  const html = exportBookmarksHtml([
    { id: '1', title: 'Rust Lang', url: 'https://www.rust-lang.org', category: 'Dev' },
    { id: '2', title: 'Docs.rs', url: 'https://docs.rs', category: 'Dev' },
  ]);
  const parsedHtml = parseBookmarksImport(html);
  assert.equal(parsedHtml.length, 2);
  assert.equal(parsedHtml[0].title, 'Rust Lang');
  assert.equal(parsedHtml[1].url, 'https://docs.rs');

  const parsedJson = parseBookmarksImport(
    JSON.stringify([{ title: 'Crates', url: 'https://crates.io', category: 'Dev' }])
  );
  assert.equal(parsedJson.length, 1);
  assert.equal(parsedJson[0].url, 'https://crates.io');
});

test('scanDownloadFilename flags dangerous executables and allows safe archives', () => {
  assert.equal(scanDownloadFilename('ferrox-browser-rust.zip').safe, true);
  assert.equal(scanDownloadFilename('installer_payload.exe').safe, false);
  assert.equal(scanDownloadFilename('script.ps1').safe, false);
});

test('searchTabs filters across titles, urls, and workspaces', () => {
  const tabs = [
    createTab('1', 'personal', 'https://example.com'),
    createTab('2', 'development', 'https://docs.rs'),
  ];
  assert.equal(searchTabs(tabs, 'docs').length, 1);
  assert.equal(searchTabs(tabs, 'development').length, 1);
  assert.equal(searchTabs(tabs, '').length, 2);
});

test('shouldBlockUrl matches tracker domains and respects toggle', () => {
  assert.deepEqual(shouldBlockUrl('https://www.google-analytics.com/collect', true), {
    blocked: true,
    matchedRule: 'google-analytics.com',
  });
  assert.deepEqual(shouldBlockUrl('https://docs.rs/sysinfo', true), {
    blocked: false,
    matchedRule: null,
  });
});

import {
  clampZoomFactor,
  getNextTabId,
  hexToRgbaSoft,
  restoreSessionTabs,
  serializeSessionTabs,
} from './browserEngine';
import { getSampleProfileData, parseBrowserPasswordsCsv, parseProfilePayload } from './profileImporter';

test('vaultCrypto encrypts and decrypts credentials with AES-GCM without storing plaintext', async () => {
  const creds = [
    { id: 'c1', site: 'https://crates.io', username: 'ferris', password: 'super-secret-password', updatedAt: 1000 },
  ];
  const payload = await encryptVaultCredentials(creds, 'master-passphrase-123');
  assert.equal(payload.ciphertextBase64.includes('super-secret-password'), false);

  const decrypted = await decryptVaultCredentials(payload, 'master-passphrase-123');
  assert.deepEqual(decrypted, creds);

  await assert.rejects(() => decryptVaultCredentials(payload, 'wrong-passphrase'));
});

test('profileImporter parses Opera GX Chromium Bookmarks JSON and CSV passwords', () => {
  const operaSample = getSampleProfileData('operagx');
  assert.equal(operaSample.bookmarks.length, 4);
  assert.equal(operaSample.bookmarks[0].title, 'GX Corner');
  assert.equal(operaSample.bookmarks[0].pinnedToBar, true);
  assert.equal(operaSample.history.length, 2);

  const csv = 'name,url,username,password\nGitHub,https://github.com/login,dev1,"pass,word!123"';
  const creds = parseBrowserPasswordsCsv(csv, 'operagx');
  assert.equal(creds.length, 1);
  assert.equal(creds[0].site, 'github.com');
  assert.equal(creds[0].username, 'dev1');
  assert.equal(creds[0].password, 'pass,word!123');
});

test('profileImporter parses Mozilla Firefox JSON bookmark backups and logins.csv', () => {
  const firefoxSample = getSampleProfileData('firefox');
  assert.equal(firefoxSample.bookmarks.length, 3);
  assert.equal(firefoxSample.bookmarks[0].title, 'MDN Web Docs');
  assert.equal(firefoxSample.bookmarks[0].pinnedToBar, true);

  const ffLoginCsv = '"url","username","password"\n"https://crates.io","rustacean","cargo-secret"';
  const parsed = parseProfilePayload(ffLoginCsv, 'logins.csv', 'firefox');
  assert.equal(parsed.credentials.length, 1);
  assert.equal(parsed.credentials[0].site, 'crates.io');
  assert.equal(parsed.credentials[0].password, 'cargo-secret');
});

test('hexToRgbaSoft converts hex accent colors and falls back safely', () => {
  assert.equal(hexToRgbaSoft('#38BDF8', 0.2), 'rgba(56, 189, 248, 0.2)');
  assert.equal(hexToRgbaSoft('invalid', 0.14), 'rgba(250, 30, 78, 0.14)');
});

test('clampZoomFactor clamps zoom between 50% and 250% cleanly', () => {
  assert.equal(clampZoomFactor(1.1000000000000001), 1.1);
  assert.equal(clampZoomFactor(0.1), 0.5);
  assert.equal(clampZoomFactor(4.2), 2.5);
  assert.equal(clampZoomFactor(Number.NaN), 1);
});

test('getNextTabId cycles forward and backward across workspace tabs', () => {
  const tabs = [
    createTab('tab-1', 'personal', 'ferrox://speed-dial'),
    createTab('tab-2', 'personal', 'https://example.com'),
    createTab('tab-3', 'personal', 'https://docs.rs'),
  ];
  assert.equal(getNextTabId(tabs, 'tab-1', 1), 'tab-2');
  assert.equal(getNextTabId(tabs, 'tab-3', 1), 'tab-1');
  assert.equal(getNextTabId(tabs, 'tab-1', -1), 'tab-3');
  assert.equal(getNextTabId([], 'tab-1', 1), null);
});

test('serializeSessionTabs and restoreSessionTabs exclude private tabs and sanitize invalid entries', () => {
  const normal = tabHistoryNavigate(
    createTab('tab-1', 'personal', 'ferrox://speed-dial', 1000),
    'https://www.rust-lang.org',
    'Rust',
    2000
  );
  const pinnedWork = {
    ...createTab('tab-2', 'work', 'https://docs.rs', 1500),
    pinned: true,
  };
  const priv = createTab('tab-3', 'personal', 'https://secret.example', 1800, { isPrivate: true });

  const serialized = serializeSessionTabs([normal, pinnedWork, priv]);
  assert.equal(serialized.length, 2);
  assert.equal(serialized.some((t) => t.id === 'tab-3'), false);

  const restored = restoreSessionTabs([
    ...serialized,
    { id: 'bad-scheme', url: 'javascript:alert(1)', workspace: 'personal' },
    { id: 'tab-1', url: 'https://duplicate.example', workspace: 'personal' },
  ]);
  assert.equal(restored.length, 2);
  assert.equal(restored[0].url, 'https://www.rust-lang.org');
  assert.equal(restored[0].history.length, 2);
  assert.equal(restored[1].workspace, 'work');
  assert.equal(restored[1].pinned, true);
});

import { stripTrackingQueryParams } from './browserEngine';
import { inferBrowserSourceFromPath } from './profileImporter';

test('stripTrackingQueryParams and evaluateUrlSecurity strip tracking params and block @-tricks, dangerous schemes, and cryptominers', () => {
  const cleaned = stripTrackingQueryParams(
    'https://example.com/article?id=42&utm_source=newsletter&fbclid=abc123&gclid=xyz'
  );
  assert.equal(cleaned.cleanUrl, 'https://example.com/article?id=42');
  assert.equal(cleaned.strippedCount, 3);

  const sec = evaluateUrlSecurity(
    'http://example.com/page?q=rust&utm_medium=social&mc_eid=999',
    true,
    true,
    true
  );
  assert.equal(sec.safe, true);
  assert.equal(sec.upgradedUrl, 'https://example.com/page?q=rust');
  assert.equal(sec.strippedTrackers, 2);

  const atTrick = evaluateUrlSecurity('https://google.com@evil-login.example/auth', true, true, true);
  assert.equal(atTrick.safe, false);
  assert.equal(atTrick.threatType, 'phishing');

  const jsScheme = evaluateUrlSecurity('javascript:alert(document.cookie)', true, true, true);
  assert.equal(jsScheme.safe, false);
  assert.equal(jsScheme.threatType, 'malware');

  const miner = evaluateUrlSecurity('https://coinhive.com/lib/coinhive.min.js', true, true, true);
  assert.equal(miner.safe, false);
  assert.equal(miner.threatType, 'malware');
});

test('profileImporter supports Chrome, Edge, Brave, Vivaldi, and Safari exports and path inference', () => {
  assert.equal(inferBrowserSourceFromPath('Google/Chrome/User Data/Default/Bookmarks'), 'chrome');
  assert.equal(inferBrowserSourceFromPath('Microsoft/Edge/User Data/Profile 1/Bookmarks'), 'edge');
  assert.equal(inferBrowserSourceFromPath('BraveSoftware/Brave-Browser/Default/Bookmarks'), 'brave');
  assert.equal(inferBrowserSourceFromPath('Opera Software/Opera GX Stable/Bookmarks'), 'operagx');
  assert.equal(inferBrowserSourceFromPath('LibreWolf/Profiles/abc.default/bookmarks-2026.json'), 'firefox');
  assert.equal(inferBrowserSourceFromPath('Library/Safari/Bookmarks.plist'), 'safari');

  const chromeSample = getSampleProfileData('chrome');
  assert.ok(chromeSample.bookmarks.length >= 3);
  assert.equal(chromeSample.bookmarks[0].category, 'Bookmarks bar');

  const braveSample = getSampleProfileData('brave');
  assert.ok(braveSample.bookmarks.length >= 2);

  const safariPlist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>URLString</key><string>https://webkit.org</string><key>title</key><string>WebKit</string></dict></plist>`;
  const safariParsed = parseProfilePayload(safariPlist, 'Bookmarks.plist', 'safari');
  assert.equal(safariParsed.bookmarks.length, 1);
  assert.equal(safariParsed.bookmarks[0].url, 'https://webkit.org');
  assert.equal(safariParsed.bookmarks[0].title, 'WebKit');
});

import { duplicateTab } from './browserEngine';

test('duplicateTab clones tab URL, title, workspace, group, privacy, and history cleanly', () => {
  const original = {
    ...tabHistoryNavigate(
      createTab('tab-1', 'development', 'https://docs.rs', 1000, { isPrivate: true, groupId: 'grp-1' }),
      'https://crates.io',
      'Crates.io',
      2000
    ),
    pinned: true,
    hibernated: true,
  };

  const copy = duplicateTab(original, 'tab-2', 3000);
  assert.equal(copy.id, 'tab-2');
  assert.equal(copy.url, 'https://crates.io');
  assert.equal(copy.title, 'Crates.io');
  assert.equal(copy.workspace, 'development');
  assert.equal(copy.groupId, 'grp-1');
  assert.equal(copy.isPrivate, true);
  assert.equal(copy.pinned, false);
  assert.equal(copy.hibernated, false);
  assert.deepEqual(copy.history, original.history);
  assert.notEqual(copy.history, original.history);
  assert.equal(copy.historyIndex, original.historyIndex);
});

import {
  detectUserGeoFromTimezone,
  findIdleTabsToHibernate,
  getVpnServersWithLocationPing,
  mergeDefaultTrackerRules,
} from './browserEngine';

test('findIdleTabsToHibernate respects slider threshold and skips active, split, pinned, and internal tabs', () => {
  const now = 1_000_000;
  const active = createTab('tab-1', 'personal', 'https://youtube.com', now - 600_000);
  const idleOld = createTab('tab-2', 'personal', 'https://mail.google.com', now - 400_000);
  const idleFresh = createTab('tab-3', 'personal', 'https://reddit.com', now - 60_000);
  const pinnedOld = { ...createTab('tab-4', 'personal', 'https://docs.rs', now - 900_000), pinned: true };
  const splitOld = createTab('tab-5', 'personal', 'https://github.com', now - 900_000);
  const internalOld = createTab('tab-6', 'personal', 'ferrox://speed-dial', now - 900_000);

  const limiter = { ...DEFAULT_LIMITER_CONFIG, autoHibernateEnabled: true, autoHibernateMinutes: 5 };
  const victims = findIdleTabsToHibernate(
    [active, idleOld, idleFresh, pinnedOld, splitOld, internalOld],
    'tab-1',
    'tab-5',
    limiter,
    now
  );
  assert.deepEqual(victims, ['tab-2']);

  const disabled = findIdleTabsToHibernate(
    [active, idleOld],
    'tab-1',
    null,
    { ...limiter, autoHibernateEnabled: false },
    now
  );
  assert.deepEqual(disabled, []);
});

test('VPN ping reflects geographic distance from user location and protocol overhead', () => {
  const laGeo = detectUserGeoFromTimezone('America/Los_Angeles');
  const laWireguard = getVpnServersWithLocationPing(laGeo, 'wireguard');
  const laUsWest = laWireguard.find((s) => s.region === 'US West')!;
  const laSingapore = laWireguard.find((s) => s.region === 'Singapore')!;
  assert.equal(laUsWest.isFastest, true);
  assert.ok(laUsWest.latencyMs < 25, `Expected LA -> US West ping < 25ms, got ${laUsWest.latencyMs}`);
  assert.ok(laSingapore.latencyMs > 120, `Expected LA -> Singapore ping > 120ms, got ${laSingapore.latencyMs}`);

  const tokyoGeo = detectUserGeoFromTimezone('Asia/Tokyo');
  const tokyoWireguard = getVpnServersWithLocationPing(tokyoGeo, 'wireguard');
  const tokyoNode = tokyoWireguard.find((s) => s.region === 'Tokyo')!;
  const tokyoUsEast = tokyoWireguard.find((s) => s.region === 'US East')!;
  assert.equal(tokyoNode.isFastest, true);
  assert.ok(tokyoNode.latencyMs < 25);
  assert.ok(tokyoUsEast.latencyMs > 100);

  const laOpenVpn = getVpnServersWithLocationPing(laGeo, 'openvpn');
  const laUsWestOpenVpn = laOpenVpn.find((s) => s.region === 'US West')!;
  assert.ok(
    laUsWestOpenVpn.latencyMs > laUsWest.latencyMs,
    'OpenVPN should report higher protocol latency than WireGuard'
  );
});

test('mergeDefaultTrackerRules upgrades legacy saved rules with universal ad networks while keeping custom domains', () => {
  const merged = mergeDefaultTrackerRules(['doubleclick.net', 'my-custom-ad.example']);
  assert.ok(merged.length > 120, `Expected > 120 universal rules, got ${merged.length}`);
  assert.ok(merged.includes('taboola.com'));
  assert.ok(merged.includes('outbrain.com'));
  assert.ok(merged.includes('criteo.com'));
  assert.ok(merged.includes('popads.net'));
  assert.ok(merged.includes('my-custom-ad.example'));
});

import {
  DEFAULT_BOOKMARKS,
  getTabsToRight,
  migrateLegacyBookmarks,
  reorderTabs,
} from './browserEngine';

test('DEFAULT_BOOKMARKS contains only Google, YouTube, and Wikipedia and Google is default search engine', () => {
  assert.deepEqual(
    DEFAULT_BOOKMARKS.map((b) => ({ title: b.title, url: b.url })),
    [
      { title: 'Google', url: 'https://www.google.com' },
      { title: 'YouTube', url: 'https://www.youtube.com' },
      { title: 'Wikipedia', url: 'https://en.wikipedia.org' },
    ]
  );

  assert.equal(
    normalizeAddressInput('ferrox browser shortcuts'),
    'https://www.google.com/search?q=ferrox%20browser%20shortcuts'
  );
  assert.equal(
    normalizeAddressInput('ferrox browser shortcuts', 'google'),
    'https://www.google.com/search?q=ferrox%20browser%20shortcuts'
  );
});

test('migrateLegacyBookmarks upgrades untouched legacy Rust starter bookmarks while preserving custom or empty lists', () => {
  assert.deepEqual(migrateLegacyBookmarks(undefined), DEFAULT_BOOKMARKS);

  const legacySaved = [
    { id: 'bm-1', title: 'Rust Language', url: 'https://www.rust-lang.org', category: 'Dev' },
    { id: 'bm-2', title: 'Docs.rs', url: 'https://docs.rs', category: 'Dev' },
    { id: 'bm-3', title: 'Crates.io', url: 'https://crates.io', category: 'Dev' },
    { id: 'bm-4', title: 'Example Domain', url: 'https://example.com', category: 'Reference' },
    { id: 'bm-5', title: 'Rust Crate Source', url: 'ferrox://rust-source', category: 'System' },
  ];
  assert.deepEqual(migrateLegacyBookmarks(legacySaved), DEFAULT_BOOKMARKS);

  // User intentionally deleted all bookmarks -> keep empty
  assert.deepEqual(migrateLegacyBookmarks([]), []);

  // User added custom/synced bookmarks -> keep untouched
  const custom = [
    { id: 'u1', title: 'GitHub', url: 'https://github.com', category: 'Work' },
  ];
  assert.deepEqual(migrateLegacyBookmarks(custom), custom);
});

test('reorderTabs moves tabs before/after target while preserving pinned/unpinned zones and workspaces', () => {
  const p1 = { ...createTab('p1', 'personal', 'https://www.google.com'), pinned: true };
  const t1 = createTab('t1', 'personal', 'https://www.youtube.com');
  const t2 = createTab('t2', 'personal', 'https://en.wikipedia.org');
  const t3 = createTab('t3', 'personal', 'https://github.com');
  const w1 = createTab('w1', 'work', 'https://docs.rs');

  const tabs = [p1, t1, t2, t3, w1];

  // Move t3 before t1
  const movedBefore = reorderTabs(tabs, 't3', 't1', 'before');
  assert.deepEqual(
    movedBefore.map((t) => t.id),
    ['p1', 't3', 't1', 't2', 'w1']
  );

  // Move t1 after t3
  const movedAfter = reorderTabs(tabs, 't1', 't3', 'after');
  assert.deepEqual(
    movedAfter.map((t) => t.id),
    ['p1', 't2', 't3', 't1', 'w1']
  );

  // Cannot mix pinned and unpinned zones
  const mixedPin = reorderTabs(tabs, 't1', 'p1', 'before');
  assert.deepEqual(
    mixedPin.map((t) => t.id),
    ['p1', 't1', 't2', 't3', 'w1']
  );

  // Cannot reorder across different workspaces
  const crossWs = reorderTabs(tabs, 't1', 'w1', 'after');
  assert.deepEqual(
    crossWs.map((t) => t.id),
    ['p1', 't1', 't2', 't3', 'w1']
  );
});

test('getTabsToRight returns unpinned tabs strictly after source tab in the same workspace', () => {
  const p1 = { ...createTab('p1', 'personal', 'https://www.google.com'), pinned: true };
  const t1 = createTab('t1', 'personal', 'https://www.youtube.com');
  const t2 = createTab('t2', 'personal', 'https://en.wikipedia.org');
  const t3 = createTab('t3', 'personal', 'https://github.com');
  const w1 = createTab('w1', 'work', 'https://docs.rs');

  assert.deepEqual(
    getTabsToRight([p1, t1, t2, t3, w1], 'personal', 't1').map((t) => t.id),
    ['t2', 't3']
  );
  assert.deepEqual(
    getTabsToRight([p1, t1, t2, t3, w1], 'personal', 't3').map((t) => t.id),
    []
  );
  assert.deepEqual(
    getTabsToRight([p1, t1, t2, t3, w1], 'personal', 'p1').map((t) => t.id),
    ['t1', 't2', 't3']
  );
});


