import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = process.cwd();
const rustDir = path.join(rootDir, 'rust-browser');
const rustSrcDir = path.join(rustDir, 'src');
const uiDir = path.join(rustSrcDir, 'ui');
const uiAssetsPath = path.join(rustSrcDir, 'ui_assets.rs');
const mainRsPath = path.join(rustSrcDir, 'main.rs');
const adblockRsPath = path.join(rustSrcDir, 'adblock.rs');
const limiterRsPath = path.join(rustSrcDir, 'limiter.rs');
const importerRsPath = path.join(rustSrcDir, 'importer.rs');
const cargoTomlPath = path.join(rustDir, 'Cargo.toml');
const buildRsPath = path.join(rustDir, 'build.rs');
const signScriptPath = path.join(rustDir, 'sign-windows.ps1');
const iconIcoPath = path.join(rustDir, 'assets', 'ferrox-icon.ico');
const iconRgbaPath = path.join(rustDir, 'assets', 'ferrox-icon-64.rgba');
const manifestPath = path.join(rustDir, 'assets', 'ferrox-browser.exe.manifest');
const serverTsPath = path.join(rootDir, 'server.ts');

test('Rust desktop UI bundle is split cleanly and avoids WebView2 NavigateToString 2MB limit', () => {
  assert.equal(fs.existsSync(path.join(rustSrcDir, 'chrome_ui.html')), false);
  assert.equal(fs.existsSync(uiAssetsPath), true);

  const indexHtml = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');
  assert.ok(Buffer.byteLength(indexHtml, 'utf8') < 4096, 'index.html should stay lightweight');
  assert.match(indexHtml, /color-scheme:\s*dark/i);
  assert.match(indexHtml, /href="\.\/favicon\.png"/);
  assert.match(indexHtml, /href="\.\/bundle\.css"/);
  assert.match(indexHtml, /src="\.\/bundle\.js"/);

  const css = fs.readFileSync(path.join(uiDir, 'bundle.css'), 'utf8');
  assert.ok(css.includes('@layer utilities'), 'Tailwind utilities must be compiled into bundle.css');
  assert.ok(css.includes('--fx-accent'), 'FerroX theme variables must be compiled into bundle.css');
  assert.ok(css.includes('color-scheme:dark'), 'Dark color-scheme must be present in bundle.css');

  const js = fs.readFileSync(path.join(uiDir, 'bundle.js'), 'utf8');
  assert.ok(js.includes('__ferroxSync'), 'Rust telemetry sync hook must be bundled');
  assert.ok(js.includes('__ferroxTelemetry'), 'Lightweight telemetry hook must be bundled');
  assert.ok(js.includes('__ferroxContentUpdate'), 'Rust content URL/title sync hook must be bundled');
  assert.ok(js.includes('__ferroxOpenTab'), 'Background tab IPC callback must be bundled');
  assert.ok(js.includes('__ferroxShortcut'), 'Content shortcut forwarding callback must be bundled');
  assert.ok(js.includes('__ferroxAdBlocked'), 'Adblock event callback must be bundled');
  assert.ok(js.includes('__ferroxDownloadEvent'), 'Native download event callback must be bundled');
  assert.ok(js.includes('__ferroxProfilesDetected'), 'Rust profile detection callback must be bundled');
  assert.ok(js.includes('__ferroxProfileImported'), 'Rust profile import callback must be bundled');
  assert.ok(
    js.includes('assets/speed_dial_backdrop_1795363253714.jpg'),
    'Speed Dial backdrop asset URL must be resolved relative to bundle.js'
  );
  assert.ok(
    js.includes('assets/ferrox_logo_icon.png'),
    'FerroX logo icon asset must be bundled'
  );
});

test('All include_bytes! paths in ui_assets.rs exist on disk and binary assets are intact', () => {
  const uiAssets = fs.readFileSync(uiAssetsPath, 'utf8');
  const matches = [...uiAssets.matchAll(/include_bytes!\("([^"]+)"\)/g)];
  assert.ok(matches.length >= 6, 'Expected index.html, favicon.png, bundle.css, bundle.js, logo, and backdrop asset');

  for (const m of matches) {
    const rel = m[1];
    const abs = path.join(rustSrcDir, rel);
    assert.equal(fs.existsSync(abs), true, `Missing embedded Rust UI asset: ${rel}`);
    const stat = fs.statSync(abs);
    assert.ok(stat.size > 0, `Embedded Rust UI asset is empty: ${rel}`);
  }

  const jpg = fs.readFileSync(path.join(uiDir, 'assets', 'speed_dial_backdrop_1795363253714.jpg'));
  assert.equal(jpg[0], 0xff);
  assert.equal(jpg[1], 0xd8);
  assert.equal(jpg[2], 0xff);

  const png = fs.readFileSync(path.join(uiDir, 'favicon.png'));
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
  assert.equal(png[2], 0x4e);
  assert.equal(png[3], 0x47);
});

test('Windows icon (.ico + 64x64 RGBA), PE manifest, build.rs, and Authenticode signing script are configured', () => {
  const cargo = fs.readFileSync(cargoTomlPath, 'utf8');
  assert.ok(cargo.includes('build = "build.rs"'));
  assert.ok(cargo.includes('winresource = "0.1"'));

  assert.equal(fs.existsSync(buildRsPath), true);
  const buildRs = fs.readFileSync(buildRsPath, 'utf8');
  assert.ok(buildRs.includes('assets/ferrox-icon.ico'));
  assert.ok(buildRs.includes('assets/ferrox-browser.exe.manifest'));
  assert.ok(buildRs.includes('"ProductName"'));

  assert.equal(fs.existsSync(manifestPath), true);
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  assert.ok(manifest.includes('PerMonitorV2'));
  assert.ok(manifest.includes('asInvoker'));

  const ico = fs.readFileSync(iconIcoPath);
  assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved header must be 0');
  assert.equal(ico.readUInt16LE(2), 1, 'ICO type must be 1 (icon)');
  assert.ok(ico.readUInt16LE(4) >= 4, 'ICO should include multiple sizes for taskbar/Explorer');

  const rgba = fs.readFileSync(iconRgbaPath);
  assert.equal(rgba.byteLength, 64 * 64 * 4, 'ferrox-icon-64.rgba must be exact 64x64 RGBA bytes');

  assert.equal(fs.existsSync(signScriptPath), true);
  const signPs1 = fs.readFileSync(signScriptPath, 'utf8');
  assert.ok(signPs1.includes('Set-AuthenticodeSignature'));
  assert.ok(signPs1.includes('SHA256'));
});

test('rust-browser/src/main.rs configures one WebView per tab, persistent WebContext cache, downloads, zoom, fullscreen, and link interception', () => {
  const mainRs = fs.readFileSync(mainRsPath, 'utf8');
  assert.equal(mainRs.includes('.with_html('), false, 'Must not use WebView2 NavigateToString with_html');
  assert.ok(mainRs.includes('mod ui_assets;'));
  assert.ok(mainRs.includes('mod importer;'));
  assert.ok(mainRs.includes('tab_webviews: HashMap<String, WebView>'));
  assert.ok(mainRs.includes('WebContext::new(Some(profile_dir))'));
  assert.ok(mainRs.includes('WebViewBuilder::with_web_context(shared_web_context)'));
  assert.equal(
    mainRs.includes('WebViewBuilder::new_with_web_context'),
    false,
    'wry 0.47 uses WebViewBuilder::with_web_context, not new_with_web_context'
  );
  assert.ok(mainRs.includes('move |url: String, destination_path: &mut PathBuf|'));
  assert.ok(mainRs.includes('move |url: String, saved_path: Option<PathBuf>, success: bool|'));
  assert.ok(mainRs.includes('.with_custom_protocol("ferrox".into()'));
  assert.ok(mainRs.includes('.with_https_scheme(true)'));
  assert.ok(mainRs.includes('.with_background_color(OBSIDIAN_BG)'));
  assert.ok(mainRs.includes('.with_theme(Some(WindowTheme::Dark))'));
  assert.ok(mainRs.includes('.with_theme(WebViewTheme::Dark)'));
  assert.ok(mainRs.includes('.with_window_icon('));
  assert.ok(mainRs.includes('.with_taskbar_icon('));
  assert.ok(mainRs.includes('Icon::from_rgba'));
  assert.ok(mainRs.includes('WindowEvent::ScaleFactorChanged'));
  assert.ok(mainRs.includes('with_navigation_handler'));
  assert.ok(mainRs.includes('with_document_title_changed_handler'));
  assert.ok(mainRs.includes('with_new_window_req_handler'));
  assert.ok(mainRs.includes('with_download_started_handler'));
  assert.ok(mainRs.includes('with_download_completed_handler'));
  assert.ok(mainRs.includes('TabOpenSameWindow'));
  assert.ok(mainRs.includes('CONTENT_TAB_INIT_SCRIPT'));
  assert.ok(mainRs.includes('HTMLAnchorElement.prototype.click'));
  assert.ok(mainRs.includes("addEventListener('auxclick'"));
  assert.ok(mainRs.includes('Fullscreen::Borderless'));
  assert.ok(mainRs.includes('wv.zoom('));
  assert.ok(mainRs.includes('apply_tab_webviews_layout'));
  assert.ok(mainRs.includes('sync_telemetry_only'));
  assert.ok(mainRs.includes('--enable-smooth-scrolling'));
  assert.ok(mainRs.includes('"ad_blocked"'));
  assert.ok(mainRs.includes('"set_shield"'));
  assert.ok(mainRs.includes('__ferroxAdBlocked'));
  assert.ok(mainRs.includes('__ferroxSetShield'));

  const limiterRs = fs.readFileSync(limiterRsPath, 'utf8');
  assert.ok(limiterRs.includes('ProcessRefreshKind::new().with_memory().with_cpu()'));
  assert.equal(
    limiterRs.includes('ProcessRefreshKind::nothing()'),
    false,
    'sysinfo 0.32 uses ProcessRefreshKind::new(), not nothing()'
  );
  assert.ok(limiterRs.includes('refresh_processes_specifics'));
});

test('Native Rust importer supports Opera GX, Opera, and Firefox SQLite/JSON syncing with bundled rusqlite', () => {
  const cargo = fs.readFileSync(cargoTomlPath, 'utf8');
  assert.match(cargo, /rusqlite\s*=\s*\{[^}]*bundled/);

  assert.equal(fs.existsSync(importerRsPath), true);
  const importerRs = fs.readFileSync(importerRsPath, 'utf8');
  assert.ok(importerRs.includes('pub fn detect_installed_profiles'));
  assert.ok(importerRs.includes('pub fn import_profile_by_id'));
  assert.ok(importerRs.includes('Opera GX Stable'));
  assert.ok(importerRs.includes('places.sqlite'));
  assert.ok(importerRs.includes('TempSqliteCopy'));
});

test('Web proxy rewrites target=_blank, intercepts window.open/anchor.click, and supports middle-click background tabs', () => {
  const serverTs = fs.readFileSync(serverTsPath, 'utf8');
  assert.ok(serverTs.includes(`'target="_self"'`));
  assert.ok(serverTs.includes('window.open = function'));
  assert.ok(serverTs.includes('HTMLAnchorElement.prototype.click'));
  assert.ok(serverTs.includes("type: 'ferrox:navigate'"));
  assert.ok(serverTs.includes("type: 'ferrox:open-bg-tab'"));
  assert.ok(serverTs.includes("ev.data.type === 'ferrox:find'"));
});

test('Universal all-website adblock + non-stalling YouTube adblock in adblock.rs', async () => {
  const adblockRs = fs.readFileSync(adblockRsPath, 'utf8');
  const match = adblockRs.match(/pub fn cosmetic_init_script\(&self\) -> &'static str \{\s*r#"([\s\S]*?)"#\s*\}/);
  assert.ok(match && match[1], 'Could not extract cosmetic_init_script JS from adblock.rs');
  const adblockScript = match[1];

  const ipcMessages: Array<{ action: string; host?: string; url?: string }> = [];
  const upstreamFetchUrls: string[] = [];
  const openedPopups: string[] = [];
  const beaconUrls: string[] = [];

  type MockStyleNode = {
    id: string;
    textContent: string;
    parentNode: { removeChild: () => void } | null;
  };
  const domState: {
    skipBtnClicked: boolean;
    intervalCallback: (() => void) | null;
    styleNode: MockStyleNode | null;
  } = {
    skipBtnClicked: false,
    intervalCallback: null,
    styleNode: null,
  };

  const playerClasses = new Set<string>(['html5-video-player', 'ad-showing']);
  const playerEl = {
    classList: {
      contains: (cls: string) => playerClasses.has(cls),
    },
  };
  // Start with readyState=1 (buffering) to verify we DO NOT seek while buffering (prevents infinite spinner!)
  const videoEl = {
    muted: false,
    readyState: 1,
    seeking: false,
    duration: 30,
    currentTime: 0,
    playbackRate: 1,
    paused: false,
    playCalls: 0,
    play: function () {
      this.playCalls += 1;
    },
  };
  const skipBtn = {
    click: () => {
      domState.skipBtnClicked = true;
    },
  };

  const doc = {
    readyState: 'complete',
    hidden: false,
    head: {
      appendChild: (node: MockStyleNode) => {
        domState.styleNode = node;
        node.parentNode = {
          removeChild: () => {
            domState.styleNode = null;
          },
        };
      },
    },
    documentElement: null,
    getElementById: (id: string) => {
      if (id === 'ferrox-adblock-style') return domState.styleNode;
      if (id === 'movie_player') return playerEl;
      return null;
    },
    createElement: () => ({ id: '', textContent: '', parentNode: null }),
    querySelector: (sel: string) => {
      if (sel.includes('video')) return videoEl;
      return null;
    },
    querySelectorAll: (sel: string) => {
      if (sel.includes('ytp-skip-ad-button')) return [skipBtn];
      return [];
    },
    addEventListener: () => {},
  };

  class MockNode {
    children: unknown[] = [];
    appendChild(child: unknown) {
      this.children.push(child);
      return child;
    }
    insertBefore(child: unknown) {
      this.children.push(child);
      return child;
    }
  }

  class MockElement extends MockNode {
    nodeType = 1;
    tagName = 'SCRIPT';
    type = 'text/javascript';
    attrs: Record<string, string> = {};
    styleMap: Record<string, string> = {};
    style = {
      setProperty: (k: string, v: string) => {
        this.styleMap[k] = v;
      },
    };
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    }
    getAttribute(k: string) {
      return this.attrs[k] ?? null;
    }
    removeAttribute(k: string) {
      delete this.attrs[k];
    }
  }

  const xhrEvents: string[] = [];
  class MockXHR {
    readyState = 0;
    status = 0;
    statusText = '';
    responseText = '';
    response: unknown = '';
    responseType = '';
    sentUpstream = false;
    open(_method: string, _url: string) {}
    send() {
      this.sentUpstream = true;
    }
    dispatchEvent(ev: { type: string }) {
      xhrEvents.push(ev.type);
      return true;
    }
  }

  const sandbox: Record<string, unknown> = {
    URL,
    Response,
    Headers,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Date,
    Event: class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
    Node: MockNode,
    Element: MockElement,
    XMLHttpRequest: MockXHR,
    JSON: { parse: JSON.parse, stringify: JSON.stringify },
    document: doc,
    navigator: {
      sendBeacon: (url: string) => {
        beaconUrls.push(url);
        return true;
      },
    },
    open: (url: string) => {
      openedPopups.push(url);
      return { closed: false };
    },
    location: {
      href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      hostname: 'www.youtube.com',
    },
    ipc: {
      postMessage: (raw: string) => {
        ipcMessages.push(JSON.parse(raw));
      },
    },
    setTimeout: (cb: () => void) => {
      cb();
      return 1;
    },
    setInterval: (cb: () => void) => {
      domState.intervalCallback = cb;
      return 1;
    },
    fetch: async (input: string) => {
      upstreamFetchUrls.push(String(input));
      if (String(input).includes('/youtubei/v1/player')) {
        return new Response(
          JSON.stringify({
            videoDetails: { videoId: 'dQw4w9WgXcQ', title: 'Test Video' },
            streamingData: { formats: [{ itag: 18 }] },
            playerConfig: { ssapConfig: { enabled: true }, audioConfig: { loudnessDb: -2 } },
            adPlacements: [{ adPlacementRenderer: { id: 'preroll-1' } }],
            playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
            adSlots: [{ adSlotRenderer: {} }],
            adBreakParams: 'break-token',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json; charset=UTF-8',
              'content-encoding': 'gzip',
            },
          }
        );
      }
      return new Response('ok', { status: 200 });
    },
  };
  sandbox.window = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(adblockScript, ctx);

  // 1. Cosmetic CSS hides universal ad slots & YouTube feed ads, but MUST NOT hide .ytp-ad-module or .video-ads
  assert.ok(domState.styleNode && domState.styleNode.textContent.includes('ytd-ad-slot-renderer'));
  assert.ok(domState.styleNode.textContent.includes('[id^="div-gpt-ad"]'));
  assert.ok(domState.styleNode.textContent.includes('.OUTBRAIN'));
  assert.equal(domState.styleNode.textContent.includes('.ytp-ad-module'), false);
  assert.equal(domState.styleNode.textContent.includes('.video-ads'), false);

  // 2. While readyState < 2 (buffering), SSAI failsafe MUST NOT seek (prevents YouTube infinite loading spinner!)
  assert.equal(videoEl.muted, true);
  assert.equal(videoEl.currentTime, 0, 'Must not seek video while readyState < 2');
  assert.equal(videoEl.playbackRate, 1, 'Must not force fast playbackRate while readyState < 2');
  assert.equal(domState.skipBtnClicked, true);

  // Once readyState >= 2, SSAI failsafe seeks cleanly to duration and speeds up, then restores when ad ends
  videoEl.readyState = 4;
  assert.ok(domState.intervalCallback, 'Expected SSAI sweep interval to be registered');
  domState.intervalCallback();
  assert.equal(videoEl.currentTime, 30);
  assert.equal(videoEl.playbackRate, 8);

  playerClasses.delete('ad-showing');
  domState.intervalCallback();
  assert.equal(videoEl.muted, false);
  assert.equal(videoEl.playbackRate, 1);

  // 3. Assigning ytInitialPlayerResponse deletes adPlacements/playerAds/adSlots/ssapConfig while keeping videoDetails
  vm.runInContext(
    `window.ytInitialPlayerResponse = {
      videoDetails: { videoId: 'abc123' },
      playerConfig: { ssapConfig: { active: true }, audioConfig: { ok: true } },
      adPlacements: [{ id: 1 }],
      playerAds: [{ id: 2 }],
      adSlots: [{ id: 3 }],
      adBreakParams: 'token'
    };`,
    ctx
  );
  const playerResp = JSON.parse(JSON.stringify(sandbox.ytInitialPlayerResponse)) as Record<string, unknown>;
  assert.deepEqual(playerResp.videoDetails, { videoId: 'abc123' });
  assert.equal('adPlacements' in playerResp, false);
  assert.equal('playerAds' in playerResp, false);
  assert.equal('adSlots' in playerResp, false);
  assert.equal('adBreakParams' in playerResp, false);
  assert.deepEqual(playerResp.playerConfig, { audioConfig: { ok: true } });

  // 4. YouTube playback-critical endpoints MUST NEVER be blocked (no more infinite loading!)
  const fetchFn = sandbox.fetch as (url: string) => Promise<Response>;
  await fetchFn('https://www.youtube.com/api/stats/atr?ns=yt&docid=abc');
  await fetchFn('https://www.youtube.com/ptracking?video_id=abc');
  await fetchFn('https://www.youtube.com/youtubei/v1/log_event');
  await fetchFn('https://rr1---sn-abc.googlevideo.com/videoplayback?expire=999');
  assert.equal(upstreamFetchUrls.some((u) => u.includes('/api/stats/atr')), true);
  assert.equal(upstreamFetchUrls.some((u) => u.includes('/ptracking')), true);
  assert.equal(upstreamFetchUrls.some((u) => u.includes('/youtubei/v1/log_event')), true);
  assert.equal(upstreamFetchUrls.some((u) => u.includes('googlevideo.com')), true);

  // 5. YouTube /youtubei/v1/player fetch returns pruned JSON without content-encoding and with valid url
  const ytApiRes = await fetchFn('https://www.youtube.com/youtubei/v1/player?prettyPrint=false');
  assert.equal(ytApiRes.status, 200);
  assert.equal(ytApiRes.headers.get('content-encoding'), null);
  const ytApiJson = (await ytApiRes.json()) as Record<string, unknown>;
  assert.deepEqual(ytApiJson.videoDetails, { videoId: 'dQw4w9WgXcQ', title: 'Test Video' });
  assert.ok(ytApiJson.streamingData);
  assert.equal('adPlacements' in ytApiJson, false);
  assert.equal('playerAds' in ytApiJson, false);
  assert.equal('adSlots' in ytApiJson, false);

  // 6. Universal ad blocking across ALL websites: Taboola, Outbrain, Criteo, PubMatic, PopAds, Mediavine, etc.
  const taboolaRes = await fetchFn('https://cdn.taboola.com/libtrc/site/loader.js');
  assert.equal(taboolaRes.status, 200);
  assert.ok((await taboolaRes.text()).includes('blocked'));
  const adBreakRes = await fetchFn('https://www.youtube.com/youtubei/v1/ad_break?prettyPrint=false');
  assert.deepEqual(await adBreakRes.json(), {});
  assert.equal(upstreamFetchUrls.some((u) => u.includes('taboola.com')), false);
  assert.equal(upstreamFetchUrls.some((u) => u.includes('/ad_break')), false);

  // 7. Blocked XHR dispatches readystatechange + load + loadend events so callers never hang
  const xhr = new MockXHR();
  xhr.open('GET', 'https://securepubads.g.doubleclick.net/gampad/ads');
  xhr.send();
  assert.equal(xhr.sentUpstream, false);
  assert.deepEqual(xhrEvents, ['readystatechange', 'load', 'loadend']);

  // 8. Universal DOM guard neutralizes ad <script> & <iframe> on appendChild + popunder window.open + sendBeacon
  const container = new MockNode();
  const adScriptEl = new MockElement();
  adScriptEl.tagName = 'SCRIPT';
  adScriptEl.attrs.src = 'https://static.criteo.net/js/ld/publishertag.js';
  container.appendChild(adScriptEl);
  assert.equal(adScriptEl.attrs.src, undefined);
  assert.equal(adScriptEl.type, 'javascript/blocked');
  assert.equal(adScriptEl.attrs['data-ferrox-blocked'], 'static.criteo.net');

  const adIframeEl = new MockElement();
  adIframeEl.tagName = 'IFRAME';
  adIframeEl.attrs.src = 'https://ads.pubmatic.com/AdServer/frame.html';
  container.appendChild(adIframeEl);
  assert.equal(adIframeEl.attrs.src, 'about:blank');
  assert.equal(adIframeEl.styleMap.display, 'none');

  const openFn = sandbox.open as (url: string) => unknown;
  assert.equal(openFn('https://serve.popads.net/pop?id=9'), null);
  assert.notEqual(openFn('https://accounts.google.com/signin'), null);
  assert.equal(openedPopups.length, 1);

  const nav = sandbox.navigator as { sendBeacon: (url: string) => boolean };
  assert.equal(nav.sendBeacon('https://pixel.rubiconproject.com/track'), true);
  assert.equal(beaconUrls.length, 0);

  // 9. Live __ferroxSetShield(false) disables shield cleanly and re-enabling merges custom rules
  const setShield = sandbox.__ferroxSetShield as (enabled: boolean, rules?: string[]) => void;
  setShield(false);
  assert.equal(domState.styleNode, null);
  await fetchFn('https://googleads.g.doubleclick.net/pagead/ads?bypass=1');
  assert.equal(upstreamFetchUrls.some((u) => u.includes('bypass=1')), true);

  setShield(true, ['custom-tracker.test']);
  assert.ok(domState.styleNode !== null);
  const customRes = await fetchFn('https://ads.custom-tracker.test/pixel.js');
  assert.equal(customRes.status, 200);
  assert.equal(upstreamFetchUrls.some((u) => u.includes('custom-tracker.test')), false);
  // Built-in universal rules remain active after custom rules merge
  const outbrainRes = await fetchFn('https://widgets.outbrain.com/outbrain.js');
  assert.equal(outbrainRes.status, 200);
  assert.equal(upstreamFetchUrls.some((u) => u.includes('outbrain.com')), false);
});

test('GitHub Actions build-windows.yml avoids invalid secrets context in if expressions', () => {
  const workflowPath = path.join(rootDir, '.github', 'workflows', 'build-windows.yml');
  const yml = fs.readFileSync(workflowPath, 'utf8');
  const ifLines = yml
    .split(/\r?\n/)
    .filter((line) => /^\s*if:\s*/.test(line));
  for (const line of ifLines) {
    assert.equal(
      /\bsecrets\./.test(line),
      false,
      `GitHub Actions forbids 'secrets' in if expressions: ${line}`
    );
  }
  assert.ok(yml.includes('IsNullOrWhiteSpace($env:WINDOWS_CERT_PFX_BASE64)'));
  assert.ok(yml.includes('cargo build --release'));
  assert.ok(yml.includes('actions/upload-artifact@v4'));
});

test('Native Rust importer detects all major desktop browsers including multi-profile Chrome, Edge, Brave, Opera, Vivaldi, Arc, Gecko forks, and Safari', () => {
  const importerRs = fs.readFileSync(importerRsPath, 'utf8');
  for (const expected of [
    'Google Chrome',
    'Microsoft Edge',
    'Brave',
    'Opera GX',
    'Vivaldi',
    'Arc',
    'Mozilla Firefox',
    'LibreWolf',
    'Waterfox',
    'Floorp',
    'Safari',
    'enumerate_chromium_profile_dirs',
  ]) {
    assert.ok(importerRs.includes(expected), `importer.rs missing support for ${expected}`);
  }
});

test('Global CSS ensures interactive controls show pointer cursor on hover', () => {
  const indexCss = fs.readFileSync(path.join(rootDir, 'src', 'index.css'), 'utf8');
  assert.ok(indexCss.includes('button:not(:disabled)'));
  assert.ok(indexCss.includes('cursor: pointer;'));
  assert.ok(indexCss.includes('cursor: not-allowed;'));
});

test('Hardened privacy.rs runtime script enforces GPC, WebGL/Canvas spoofing, WebRTC IP-leak relay guard, and tracker sendBeacon blocking', () => {
  const privacyRs = fs.readFileSync(path.join(rustSrcDir, 'privacy.rs'), 'utf8');
  const match = privacyRs.match(
    /pub fn anti_fingerprint_script\(&self\) -> &'static str \{\s*r#"([\s\S]*?)"#\s*\}/
  );
  assert.ok(match && match[1], 'Could not extract anti_fingerprint_script from privacy.rs');
  const script = match[1];

  const ipcMessages: Array<{ action: string; host?: string; url?: string }> = [];
  const rtcConfigsSeen: Array<Record<string, unknown>> = [];
  const beaconsSent: string[] = [];
  const iceListeners: Array<(ev: { candidate: { candidate: string } | null }) => void> = [];

  class FakeRTC {
    constructor(cfg: Record<string, unknown>) {
      rtcConfigsSeen.push(cfg);
    }
    addEventListener(type: string, fn: (ev: { candidate: { candidate: string } | null }) => void) {
      if (type === 'icecandidate') iceListeners.push(fn);
    }
  }

  class FakeWebGL {
    getParameter(param: number) {
      return `REAL_GPU_${param}`;
    }
  }

  const fakeNavigator: Record<string, unknown> = {
    sendBeacon: (url: string) => {
      beaconsSent.push(url);
      return true;
    },
  };

  const sandbox: Record<string, unknown> = {
    URL,
    Object,
    Promise,
    Math,
    JSON: { parse: JSON.parse, stringify: JSON.stringify },
    navigator: fakeNavigator,
    location: { href: 'https://example.com/page' },
    document: { addEventListener: () => {} },
    ipc: {
      postMessage: (raw: string) => ipcMessages.push(JSON.parse(raw)),
    },
    RTCPeerConnection: FakeRTC,
    WebGLRenderingContext: FakeWebGL,
  };
  sandbox.window = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(script, ctx);

  // 1. GPC & hardware concurrency spoofing active by default
  assert.equal(fakeNavigator.globalPrivacyControl, true);
  assert.equal(fakeNavigator.doNotTrack, '1');
  assert.equal(fakeNavigator.hardwareConcurrency, 4);

  // 2. WebGL GPU vendor/renderer normalized
  const gl = new (sandbox.WebGLRenderingContext as typeof FakeWebGL)();
  assert.equal(gl.getParameter(37445), 'FerroX Generic GPU');
  assert.equal(gl.getParameter(37446), 'FerroX Hardened WebGL');

  // 3. WebRTC forces iceTransportPolicy: 'relay' and drops host/.local ICE candidates
  const RTC = sandbox.RTCPeerConnection as typeof FakeRTC;
  const pc = new RTC({ iceServers: [] });
  assert.equal(rtcConfigsSeen[0].iceTransportPolicy, 'relay');

  const receivedCandidates: string[] = [];
  pc.addEventListener('icecandidate', (ev) => {
    if (ev.candidate) receivedCandidates.push(ev.candidate.candidate);
  });
  iceListeners[0]({ candidate: { candidate: 'candidate:1 1 udp 2122260223 192.168.1.42 54321 typ host' } });
  iceListeners[0]({ candidate: { candidate: 'candidate:2 1 udp 1677729535 203.0.113.10 54322 typ relay' } });
  assert.deepEqual(receivedCandidates, ['candidate:2 1 udp 1677729535 203.0.113.10 54322 typ relay']);
  assert.ok(ipcMessages.some((m) => m.host === 'webrtc-ip-leak'));

  // 4. Tracker sendBeacon is blocked while normal first-party beacon passes
  const sendBeacon = fakeNavigator.sendBeacon as (url: string, data?: string) => boolean;
  sendBeacon('https://www.google-analytics.com/g/collect?v=2', 'x');
  sendBeacon('https://example.com/telemetry', 'ok');
  assert.deepEqual(beaconsSent, ['https://example.com/telemetry']);
  assert.ok(ipcMessages.some((m) => m.host === 'beacon:www.google-analytics.com'));

  // 5. Live __ferroxSetPrivacy toggles protections cleanly
  const setPrivacy = sandbox.__ferroxSetPrivacy as (cfg: Record<string, boolean>) => void;
  setPrivacy({ fingerprintProtection: false, globalPrivacyControl: false });
  assert.equal(fakeNavigator.globalPrivacyControl, false);
  assert.equal(gl.getParameter(37445), 'REAL_GPU_37445');
});

test('Rust native shell shares one WebContext, caps GPU/V8 memory, walks full process tree, trims working sets, and detects Opera GX variants', () => {
  const mainRs = fs.readFileSync(mainRsPath, 'utf8');
  assert.ok(
    mainRs.includes('let chrome_builder = WebViewBuilder::with_web_context(&mut shared_web_context)'),
    'chrome_webview must share shared_web_context to avoid spawning a second GPU + browser process'
  );
  assert.ok(mainRs.includes('--force-gpu-mem-available-mb='));
  assert.ok(mainRs.includes('--max-old-space-size='));
  assert.ok(mainRs.includes('--process-per-site'));
  assert.ok(mainRs.includes('--media-cache-size='));
  assert.ok(mainRs.includes('__ferroxTabHibernated'));
  assert.ok(mainRs.includes('__ferroxMemoryTrimmed'));
  assert.ok(mainRs.includes('"trim_memory"'));

  const limiterRs = fs.readFileSync(limiterRsPath, 'utf8');
  assert.ok(limiterRs.includes('SetProcessWorkingSetSize'));
  assert.ok(limiterRs.includes('trim_process_tree_working_set'));
  assert.ok(limiterRs.includes('tree.contains(&parent)'), 'Must walk full grandchild WebView2 process tree');

  const importerRs = fs.readFileSync(importerRsPath, 'utf8');
  assert.ok(importerRs.includes('push_opera_software_dir_specs'));
  assert.ok(importerRs.includes('enumerate_opera_profile_dirs'));
  assert.ok(importerRs.includes('_side_profiles'));
  assert.ok(importerRs.includes('profile_name'));
});

test('Rust native shell supports tab detachment to new OS windows, tab muting, Google default search, and 3 clean default bookmarks', () => {
  const mainRs = fs.readFileSync(mainRsPath, 'utf8');
  assert.ok(mainRs.includes('parse_launch_args'));
  assert.ok(mainRs.includes('spawn_ferrox_window'));
  assert.ok(mainRs.includes('"detach_tab_window"'));
  assert.ok(mainRs.includes('"open_new_window"'));
  assert.ok(mainRs.includes('"tab_mute"'));
  assert.ok(mainRs.includes('__ferroxTabMuted'));
  assert.ok(mainRs.includes('__ferroxMuteObserver'));
  assert.ok(mainRs.includes('initial_url'));
  assert.ok(mainRs.includes('https://www.google.com/search?q='));
  assert.ok(mainRs.includes("'new_window'"));
  assert.ok(mainRs.includes("'mute_tab'"));

  const browserRs = fs.readFileSync(path.join(rustSrcDir, 'browser.rs'), 'utf8');
  assert.ok(browserRs.includes('search_engine_id: "google".to_string()'));
  assert.ok(browserRs.includes('https://www.google.com/search?q='));
  assert.ok(browserRs.includes('https://www.google.com'));
  assert.ok(browserRs.includes('https://www.youtube.com'));
  assert.ok(browserRs.includes('https://en.wikipedia.org'));
  assert.equal(browserRs.includes('Example Domain'), false);
  assert.equal(browserRs.includes('Crates.io'), false);
});

