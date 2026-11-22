import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const rustSrcDir = path.join(rootDir, 'rust-browser', 'src');
const uiDir = path.join(rustSrcDir, 'ui');
const uiAssetsPath = path.join(rustSrcDir, 'ui_assets.rs');
const mainRsPath = path.join(rustSrcDir, 'main.rs');

test('Rust desktop UI bundle is split cleanly and avoids WebView2 NavigateToString 2MB limit', () => {
  assert.equal(fs.existsSync(path.join(rustSrcDir, 'chrome_ui.html')), false);
  assert.equal(fs.existsSync(uiAssetsPath), true);

  const indexHtml = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');
  assert.ok(Buffer.byteLength(indexHtml, 'utf8') < 4096, 'index.html should stay lightweight');
  assert.match(indexHtml, /color-scheme:\s*dark/i);
  assert.match(indexHtml, /href="\.\/bundle\.css"/);
  assert.match(indexHtml, /src="\.\/bundle\.js"/);

  const css = fs.readFileSync(path.join(uiDir, 'bundle.css'), 'utf8');
  assert.ok(css.includes('@layer utilities'), 'Tailwind utilities must be compiled into bundle.css');
  assert.ok(css.includes('--fx-accent'), 'FerroX theme variables must be compiled into bundle.css');
  assert.ok(css.includes('color-scheme:dark'), 'Dark color-scheme must be present in bundle.css');

  const js = fs.readFileSync(path.join(uiDir, 'bundle.js'), 'utf8');
  assert.ok(js.includes('__ferroxSync'), 'Rust telemetry sync hook must be bundled');
  assert.ok(js.includes('__ferroxContentUpdate'), 'Rust content URL/title sync hook must be bundled');
  assert.ok(
    js.includes('assets/speed_dial_backdrop_1795363253714.jpg'),
    'Speed Dial backdrop asset URL must be resolved relative to bundle.js'
  );
});

test('All include_bytes! paths in ui_assets.rs exist on disk and JPEG asset is intact binary', () => {
  const uiAssets = fs.readFileSync(uiAssetsPath, 'utf8');
  const matches = [...uiAssets.matchAll(/include_bytes!\("([^"]+)"\)/g)];
  assert.ok(matches.length >= 4, 'Expected index.html, bundle.css, bundle.js, and backdrop asset');

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
});

test('rust-browser/src/main.rs configures custom protocol, dark native chrome, HiDPI bounds, and content sync', () => {
  const mainRs = fs.readFileSync(mainRsPath, 'utf8');
  assert.equal(mainRs.includes('.with_html('), false, 'Must not use WebView2 NavigateToString with_html');
  assert.ok(mainRs.includes('mod ui_assets;'));
  assert.ok(mainRs.includes('.with_custom_protocol("ferrox".into()'));
  assert.ok(mainRs.includes('.with_https_scheme(true)'));
  assert.ok(mainRs.includes('.with_background_color(OBSIDIAN_BG)'));
  assert.ok(mainRs.includes('.with_theme(Some(WindowTheme::Dark))'));
  assert.ok(mainRs.includes('.with_theme(WebViewTheme::Dark)'));
  assert.ok(mainRs.includes('WindowEvent::ScaleFactorChanged'));
  assert.ok(mainRs.includes('with_navigation_handler'));
  assert.ok(mainRs.includes('with_document_title_changed_handler'));
});
