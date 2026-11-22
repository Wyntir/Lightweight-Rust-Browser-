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


