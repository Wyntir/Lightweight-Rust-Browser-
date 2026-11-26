use std::collections::HashSet;

use url::Url;

pub const DEFAULT_AD_DOMAINS: &[&str] = &[
    // Google & YouTube ad networks
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "google-analytics.com",
    "googletagmanager.com",
    "adservice.google.com",
    "pagead2.googlesyndication.com",
    "tpc.googlesyndication.com",
    "static.doubleclick.net",
    "googleads.g.doubleclick.net",
    "securepubads.g.doubleclick.net",
    "adclick.g.doubleclick.net",
    "imasdk.googleapis.com",
    "2mdn.net",
    "fundingchoicesmessages.google.com",
    // Programmatic exchanges & header bidding
    "adnxs.com",
    "pubmatic.com",
    "rubiconproject.com",
    "openx.net",
    "casalemedia.com",
    "indexww.com",
    "criteo.com",
    "criteo.net",
    "amazon-adsystem.com",
    "aax.amazon-adsystem.com",
    "adsrvr.org",
    "bidswitch.net",
    "smartadserver.com",
    "3lift.com",
    "triplelift.com",
    "sharethrough.com",
    "lijit.com",
    "yieldmo.com",
    "gumgum.com",
    "teads.tv",
    "spotxchange.com",
    "spotx.tv",
    "springserve.com",
    "contextweb.com",
    "media.net",
    "adform.net",
    "adroll.com",
    "turn.com",
    "mathtag.com",
    "rlcdn.com",
    "id5-sync.com",
    "crwdcntrl.net",
    "bluekai.com",
    "demdex.net",
    "krxd.net",
    "eyeota.net",
    "tapad.com",
    "agkn.com",
    "permutive.com",
    "btloader.com",
    "connatix.com",
    "primis.tech",
    "vidazoo.com",
    "aniview.com",
    "vidoomy.com",
    "rhythmone.com",
    "undertone.com",
    "kargo.com",
    "sonobi.com",
    "emxdgt.com",
    "1rx.io",
    "33across.com",
    "stickyadstv.com",
    "inmobi.com",
    "unityads.unity3d.com",
    "applovin.com",
    "vungle.com",
    "ironsrc.com",
    "chartboost.com",
    // Publisher ad managers (news, blogs, wikis, gaming sites)
    "mediavine.com",
    "adthrive.com",
    "cafemedia.com",
    "ezoic.net",
    "ezojs.com",
    "ezodn.com",
    "freestar.io",
    "playwire.com",
    "snigelweb.com",
    "nitropay.com",
    "buysellads.com",
    "carbonads.com",
    "carbonads.net",
    "proper.io",
    "adpushup.com",
    "setupad.com",
    "vlitag.com",
    "ay.delivery",
    "htlbid.com",
    // Native & recommendation widgets
    "taboola.com",
    "outbrain.com",
    "mgid.com",
    "revcontent.com",
    "ntv.io",
    "dianomi.com",
    "zergnet.com",
    "content.ad",
    "adblade.com",
    "zemanta.com",
    "ligatus.com",
    "plista.com",
    // Popunder & aggressive ad networks
    "popads.net",
    "popcash.net",
    "propellerads.com",
    "onclickalgo.com",
    "monetag.com",
    "exoclick.com",
    "trafficjunky.net",
    "trafficstars.com",
    "juicyads.com",
    "adsterra.com",
    "hilltopads.net",
    "clickadu.com",
    "richpush.co",
    "admaven.com",
    "acscdn.com",
    "highperformanceformat.com",
    "profitablegatecpm.com",
    "topcreativeformat.com",
    // Social & platform ad/tracking pixels
    "connect.facebook.net",
    "ads.twitter.com",
    "ads-api.twitter.com",
    "analytics.twitter.com",
    "static.ads-twitter.com",
    "bat.bing.com",
    "ads.microsoft.com",
    "advertising.com",
    "ads.yahoo.com",
    "adtech.de",
    "analytics.tiktok.com",
    "sc-static.net",
    "tr.snapchat.com",
    "px.ads.linkedin.com",
    "snap.licdn.com",
    "ct.pinterest.com",
    "alb.reddit.com",
    "events.redditmedia.com",
    "fls-na.amazon.com",
    "mads.amazon.com",
    // Analytics, session replay & ad verification
    "scorecardresearch.com",
    "quantserve.com",
    "mixpanel.com",
    "hotjar.com",
    "segment.io",
    "fullstory.com",
    "crazyegg.com",
    "mouseflow.com",
    "luckyorange.com",
    "inspectlet.com",
    "chartbeat.com",
    "chartbeat.net",
    "omtrdc.net",
    "2o7.net",
    "moatads.com",
    "doubleverify.com",
    "adsafeprotected.com",
    "integralads.com",
    "bam.nr-data.net",
    "clarity.ms",
    "amplitude.com",
    "heapanalytics.com",
    "kissmetrics.com",
    "adjust.com",
    "appsflyer.com",
    // Cryptominers
    "coinhive.com",
    "coin-hive.com",
    "cryptoloot.pro",
    "crypto-loot.com",
    "webminepool.com",
    "minero.cc",
    "jsecoin.com",
    "authedmine.com",
    "monerominer.rocks",
    "coinimp.com",
];

pub struct AdShield {
    pub enabled: bool,
    blocked_domains: HashSet<String>,
    blocked_events: Vec<String>,
}

impl AdShield {
    pub fn with_default_rules() -> Self {
        Self {
            enabled: true,
            blocked_domains: DEFAULT_AD_DOMAINS.iter().map(|s| s.to_string()).collect(),
            blocked_events: Vec::new(),
        }
    }

    pub fn set_rules(&mut self, rules: Vec<String>) {
        if rules.is_empty() {
            return;
        }
        self.blocked_domains = rules
            .into_iter()
            .map(|r| r.trim().to_ascii_lowercase())
            .filter(|r| !r.is_empty())
            .collect();
    }

    pub fn rules(&self) -> Vec<String> {
        let mut list: Vec<String> = self.blocked_domains.iter().cloned().collect();
        list.sort();
        list
    }

    pub fn is_blocked(&self, raw_url: &str) -> bool {
        if !self.enabled {
            return false;
        }
        let Ok(parsed) = Url::parse(raw_url) else {
            return false;
        };
        let Some(host) = parsed.host_str() else {
            return false;
        };
        let host_lower = host.to_ascii_lowercase();
        let host_bytes = host_lower.as_bytes();
        self.blocked_domains.iter().any(|rule| {
            host_lower == *rule
                || (host_lower.len() > rule.len()
                    && host_lower.ends_with(rule.as_str())
                    && host_bytes[host_lower.len() - rule.len() - 1] == b'.')
        })
    }

    pub fn record_block(&mut self, url: &str) {
        self.blocked_events.push(url.to_string());
    }

    pub fn blocked_count(&self) -> usize {
        self.blocked_events.len()
    }

    /// Universal multi-layer document-start ad & tracker blocker injected into every content WebView.
    /// Layer 1: Clean YouTube ad-slot pruning (`delete` adPlacements/playerAds/adSlots/ssapConfig) without
    ///          blocking playback attestation endpoints (`/api/stats/atr`, `/ptracking`, `log_event`, `googlevideo.com`).
    /// Layer 2: Universal network interception (`fetch`, `XMLHttpRequest` with async Event dispatch, `sendBeacon`)
    ///          returning format-safe 200 OK stubs (`{}` for JSON, JS comments for scripts) across 150+ ad networks.
    /// Layer 3: Universal DOM resource guard (`<script>`, `<iframe>`, `<img>`, `<ins>` via `appendChild`,
    ///          `insertBefore`, `setAttribute`, and `.src` setters) + popunder `window.open` shield.
    /// Layer 4: EasyList-grade universal cosmetic CSS + safe non-stalling YouTube SSAI failsafe (seeks only when
    ///          `readyState >= 2`, `!seeking`, bounded duration <= 300s, rate-limited so videos never spin forever).
    pub fn cosmetic_init_script(&self) -> &'static str {
        r#"
(function() {
  if (window.__ferroxAdShieldInstalled) return;
  window.__ferroxAdShieldInstalled = true;
  window.__ferroxShieldEnabled = true;
  var nativeJsonParse = JSON.parse;

  var BUILTIN_DOMAINS = [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'google-analytics.com', 'googletagmanager.com', 'adservice.google.com',
    'pagead2.googlesyndication.com', 'tpc.googlesyndication.com',
    'static.doubleclick.net', 'googleads.g.doubleclick.net',
    'securepubads.g.doubleclick.net', 'adclick.g.doubleclick.net',
    'imasdk.googleapis.com', '2mdn.net', 'fundingchoicesmessages.google.com',
    'adnxs.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
    'casalemedia.com', 'indexww.com', 'criteo.com', 'criteo.net',
    'amazon-adsystem.com', 'aax.amazon-adsystem.com', 'adsrvr.org',
    'bidswitch.net', 'smartadserver.com', '3lift.com', 'triplelift.com',
    'sharethrough.com', 'lijit.com', 'yieldmo.com', 'gumgum.com',
    'teads.tv', 'spotxchange.com', 'spotx.tv', 'springserve.com',
    'contextweb.com', 'media.net', 'adform.net', 'adroll.com',
    'turn.com', 'mathtag.com', 'rlcdn.com', 'id5-sync.com',
    'crwdcntrl.net', 'bluekai.com', 'demdex.net', 'krxd.net',
    'eyeota.net', 'tapad.com', 'agkn.com', 'permutive.com',
    'btloader.com', 'connatix.com', 'primis.tech', 'vidazoo.com',
    'aniview.com', 'vidoomy.com', 'rhythmone.com', 'undertone.com',
    'kargo.com', 'sonobi.com', 'emxdgt.com', '1rx.io', '33across.com',
    'stickyadstv.com', 'inmobi.com', 'unityads.unity3d.com', 'applovin.com',
    'vungle.com', 'ironsrc.com', 'chartboost.com',
    'mediavine.com', 'adthrive.com', 'cafemedia.com', 'ezoic.net',
    'ezojs.com', 'ezodn.com', 'freestar.io', 'playwire.com',
    'snigelweb.com', 'nitropay.com', 'buysellads.com', 'carbonads.com',
    'carbonads.net', 'proper.io', 'adpushup.com', 'setupad.com',
    'vlitag.com', 'ay.delivery', 'htlbid.com',
    'taboola.com', 'outbrain.com', 'mgid.com', 'revcontent.com',
    'ntv.io', 'dianomi.com', 'zergnet.com', 'content.ad',
    'adblade.com', 'zemanta.com', 'ligatus.com', 'plista.com',
    'popads.net', 'popcash.net', 'propellerads.com', 'onclickalgo.com',
    'monetag.com', 'exoclick.com', 'trafficjunky.net', 'trafficstars.com',
    'juicyads.com', 'adsterra.com', 'hilltopads.net', 'clickadu.com',
    'richpush.co', 'admaven.com', 'acscdn.com', 'highperformanceformat.com',
    'profitablegatecpm.com', 'topcreativeformat.com',
    'connect.facebook.net', 'ads.twitter.com', 'ads-api.twitter.com',
    'analytics.twitter.com', 'static.ads-twitter.com', 'bat.bing.com',
    'ads.microsoft.com', 'advertising.com', 'ads.yahoo.com', 'adtech.de',
    'analytics.tiktok.com', 'sc-static.net', 'tr.snapchat.com',
    'px.ads.linkedin.com', 'snap.licdn.com', 'ct.pinterest.com',
    'alb.reddit.com', 'events.redditmedia.com', 'fls-na.amazon.com', 'mads.amazon.com',
    'scorecardresearch.com', 'quantserve.com', 'mixpanel.com', 'hotjar.com',
    'segment.io', 'fullstory.com', 'crazyegg.com', 'mouseflow.com',
    'luckyorange.com', 'inspectlet.com', 'chartbeat.com', 'chartbeat.net',
    'omtrdc.net', '2o7.net', 'moatads.com', 'doubleverify.com',
    'adsafeprotected.com', 'integralads.com', 'bam.nr-data.net',
    'clarity.ms', 'amplitude.com', 'heapanalytics.com', 'kissmetrics.com',
    'adjust.com', 'appsflyer.com',
    'coinhive.com', 'coin-hive.com', 'cryptoloot.pro', 'crypto-loot.com',
    'webminepool.com', 'minero.cc', 'jsecoin.com', 'authedmine.com',
    'monerominer.rocks', 'coinimp.com'
  ];

  var BLOCKED_DOMAINS = BUILTIN_DOMAINS.slice();

  // Strictly pure YouTube ad endpoints (NEVER block /api/stats/atr, /ptracking, /log_event, or googlevideo.com!)
  var YT_AD_URL_PATTERNS = [
    '/pagead/',
    '/api/stats/ads',
    '/get_midroll_info',
    '/youtubei/v1/ad_break'
  ];

  // Third-party universal ad script/resource path signatures (never applied to same-origin first-party content)
  var THIRD_PARTY_AD_PATHS = [
    '/pagead/js/adsbygoogle',
    '/tag/js/gpt.js',
    '/gpt/pubads_impl',
    '/prebid.js',
    '/pbjs.js',
    '/libtrc/',
    '/outbrain.js',
    '/adserver/',
    '/adservice/',
    '/popunder.js'
  ];

  var AD_CSS = [
    // Universal Google AdSense / GPT / DFP & Ad Exchange frames
    'ins.adsbygoogle, .adsbygoogle, [id^="google_ads_iframe"], [id^="div-gpt-ad"],',
    '[data-google-query-id], [data-ad-slot], [data-ad-unit], [data-ad-client],',
    '[data-ad-region], [data-testid="ad-slot"], [aria-label="Advertisement"],',
    'iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"],',
    'iframe[src*="amazon-adsystem.com"], iframe[src*="criteo."], iframe[src*="adnxs.com"],',
    'iframe[src*="pubmatic.com"], iframe[src*="rubiconproject.com"], iframe[src*="openx.net"],',
    'iframe[src*="taboola.com"], iframe[src*="outbrain.com"], iframe[src*="mgid.com"],',
    'iframe[src*="revcontent.com"], iframe[src*="exoclick.com"], iframe[src*="ezoic"],',
    // Native ad widgets & publisher ad managers
    '.OUTBRAIN, .ob-widget, [id^="taboola-"], [data-widget-id*="taboola"], .trc_related_container,',
    '.mgbox, [id^="rc-widget"], .revcontent, .adthrive-ad, .mediavine-ad, .mv-ad-box,',
    '.ezoic-ad, .ez-sidebar-wall, [id^="ezoic-pub-ad-placeholder"], .freestar-ad, .nitropay-ad,',
    // Common semantic ad slots & social promoted posts
    '.ad-banner, .ad-leaderboard, .ad-sidebar, .ad-slot, .ad-unit, .banner-ad,',
    '.sponsored-ad, .sticky-ad, .floating-ad, .gpt-ad, .dfp-ad,',
    'shreddit-ad-post, [data-testid="placementTracking"],',
    // YouTube feed, banner, companion, overlay & enforcement clutter (DO NOT hide .ytp-ad-module or .video-ads!)
    'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer,',
    'ytd-statement-banner-renderer, ytd-promoted-sparkles-web-renderer,',
    'ytd-promoted-sparkles-text-search-renderer, ytd-promoted-video-renderer,',
    'ytd-display-ad-renderer, ytd-companion-slot-renderer, ytd-action-companion-ad-renderer,',
    'ytd-player-legacy-desktop-watch-ads-renderer, ytd-rich-item-renderer:has(ytd-ad-slot-renderer),',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],',
    'ytd-merch-shelf-renderer, #masthead-ad, #player-ads, .ytd-banner-promo-renderer-background,',
    '.ytp-ad-overlay-container, .ytp-ad-text-overlay, .ytp-ad-image-overlay,',
    '.ytp-ad-action-interstitial, ytm-promoted-sparkles-web-renderer, ad-slot-renderer,',
    'ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
    '{ display: none !important; }'
  ].join('\n');

  var lastReportMap = Object.create(null);

  function reportBlocked(host, url) {
    try {
      var now = Date.now();
      var key = host + '|' + (url || '').slice(0, 80);
      if (lastReportMap[key] && now - lastReportMap[key] < 500) return;
      lastReportMap[key] = now;
      if (window.ipc && typeof window.ipc.postMessage === 'function') {
        window.ipc.postMessage(JSON.stringify({
          action: 'ad_blocked',
          host: host || 'ad-network',
          url: url || window.location.href
        }));
      }
    } catch (_e) {}
  }

  function currentHostname() {
    try {
      return (window.location && window.location.hostname ? window.location.hostname : '').toLowerCase();
    } catch (_e) {
      return '';
    }
  }

  function isYouTubeHost() {
    var h = currentHostname();
    return h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be';
  }

  function isNeverBlockUrl(host, pathAndQuery) {
    // Never touch actual YouTube video/audio streams or playback attestation endpoints
    if (host === 'googlevideo.com' || host.endsWith('.googlevideo.com')) return true;
    if (host === 'ytimg.com' || host.endsWith('.ytimg.com')) return true;
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (
        pathAndQuery.indexOf('/api/stats/atr') !== -1 ||
        pathAndQuery.indexOf('/api/stats/playback') !== -1 ||
        pathAndQuery.indexOf('/api/stats/watchtime') !== -1 ||
        pathAndQuery.indexOf('/ptracking') !== -1 ||
        pathAndQuery.indexOf('/youtubei/v1/log_event') !== -1
      ) {
        return true;
      }
    }
    return false;
  }

  function matchBlockedDomain(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return null;
    if (urlStr.indexOf('data:') === 0 || urlStr.indexOf('blob:') === 0 || urlStr.indexOf('about:') === 0) {
      return null;
    }
    try {
      var parsed = new URL(urlStr, window.location.href);
      var host = parsed.hostname.toLowerCase();
      var pathAndQuery = (parsed.pathname + parsed.search).toLowerCase();
      if (isNeverBlockUrl(host, pathAndQuery)) return null;

      for (var i = 0; i < BLOCKED_DOMAINS.length; i++) {
        var rule = BLOCKED_DOMAINS[i];
        if (host === rule || host.endsWith('.' + rule)) {
          return host;
        }
      }

      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        for (var j = 0; j < YT_AD_URL_PATTERNS.length; j++) {
          if (pathAndQuery.indexOf(YT_AD_URL_PATTERNS[j]) !== -1) {
            return 'youtube-ads';
          }
        }
        return null;
      }

      var pageHost = currentHostname();
      if (pageHost && host !== pageHost && !host.endsWith('.' + pageHost)) {
        for (var k = 0; k < THIRD_PARTY_AD_PATHS.length; k++) {
          if (pathAndQuery.indexOf(THIRD_PARTY_AD_PATHS[k]) !== -1) {
            return host;
          }
        }
      }
    } catch (_e) {}
    return null;
  }

  function buildStubResponse(urlStr, init) {
    var lower = String(urlStr || '').toLowerCase();
    var accept = '';
    try {
      if (init && init.headers) {
        if (typeof init.headers.get === 'function') {
          accept = String(init.headers.get('accept') || '').toLowerCase();
        } else if (typeof init.headers === 'object') {
          accept = String(init.headers.Accept || init.headers.accept || '').toLowerCase();
        }
      }
    } catch (_e) {}

    if (
      lower.indexOf('/youtubei/') !== -1 ||
      lower.indexOf('/get_midroll_info') !== -1 ||
      lower.indexOf('.json') !== -1 ||
      accept.indexOf('application/json') !== -1
    ) {
      return new Response('{}', {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (lower.indexOf('.js') !== -1 || lower.indexOf('.mjs') !== -1) {
      return new Response('/* blocked by FerroX Shield */', {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/javascript' }
      });
    }
    return new Response('', { status: 200, statusText: 'OK' });
  }

  function isAdRendererEntry(item) {
    if (!item || typeof item !== 'object') return false;
    if (
      item.adSlotRenderer ||
      item.inFeedAdLayoutRenderer ||
      item.promotedSparklesWebRenderer ||
      item.promotedSparklesTextSearchRenderer ||
      item.displayAdRenderer ||
      item.bannerPromoRenderer
    ) {
      return true;
    }
    if (item.richItemRenderer && item.richItemRenderer.content && item.richItemRenderer.content.adSlotRenderer) {
      return true;
    }
    return false;
  }

  function pruneYouTubeObject(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 7) return false;
    var removed = false;

    if (Array.isArray(obj)) {
      for (var i = obj.length - 1; i >= 0; i--) {
        if (isAdRendererEntry(obj[i])) {
          obj.splice(i, 1);
          removed = true;
        } else if (obj[i] && typeof obj[i] === 'object') {
          if (pruneYouTubeObject(obj[i], depth + 1)) removed = true;
        }
      }
      return removed;
    }

    // Use `delete` (like uBlock Origin's json-prune) so YouTube skips its ad-slot wait loop cleanly
    if ('adPlacements' in obj && obj.adPlacements !== undefined) {
      delete obj.adPlacements;
      removed = true;
    }
    if ('playerAds' in obj && obj.playerAds !== undefined) {
      delete obj.playerAds;
      removed = true;
    }
    if ('adSlots' in obj && obj.adSlots !== undefined) {
      delete obj.adSlots;
      removed = true;
    }
    if ('adBreakParams' in obj && obj.adBreakParams !== undefined) {
      delete obj.adBreakParams;
      removed = true;
    }
    if (obj.playerConfig && typeof obj.playerConfig === 'object' && 'ssapConfig' in obj.playerConfig) {
      delete obj.playerConfig.ssapConfig;
      removed = true;
    }
    if (obj.auxiliaryUi && obj.auxiliaryUi.messageRenderers) {
      if (obj.auxiliaryUi.messageRenderers.bkaEnforcementMessageViewModel) {
        delete obj.auxiliaryUi.messageRenderers.bkaEnforcementMessageViewModel;
        removed = true;
      }
      if (obj.auxiliaryUi.messageRenderers.enforcementMessageViewModel) {
        delete obj.auxiliaryUi.messageRenderers.enforcementMessageViewModel;
        removed = true;
      }
    }

    var keysToTraverse = [
      'playerResponse',
      'response',
      'contents',
      'twoColumnBrowseResultsRenderer',
      'twoColumnWatchNextResults',
      'twoColumnSearchResultsRenderer',
      'primaryContents',
      'secondaryResults',
      'results',
      'tabs',
      'tabRenderer',
      'content',
      'richGridRenderer',
      'sectionListRenderer',
      'itemSectionRenderer',
      'onResponseReceivedActions',
      'onResponseReceivedEndpoints',
      'appendContinuationItemsAction',
      'reloadContinuationItemsCommand',
      'continuationItems',
      'items',
      'engagementPanels'
    ];
    for (var k = 0; k < keysToTraverse.length; k++) {
      var key = keysToTraverse[k];
      if (obj[key] && typeof obj[key] === 'object') {
        if (pruneYouTubeObject(obj[key], depth + 1)) removed = true;
      }
    }
    return removed;
  }

  function applyCosmeticStyle() {
    try {
      var existing = document.getElementById('ferrox-adblock-style');
      if (!window.__ferroxShieldEnabled) {
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        return;
      }
      if (!existing) {
        var style = document.createElement('style');
        style.id = 'ferrox-adblock-style';
        style.textContent = AD_CSS;
        var target = document.head || document.documentElement;
        if (target) target.appendChild(style);
      }
    } catch (_e) {}
  }

  window.__ferroxSetShield = function(enabled, customRules) {
    window.__ferroxShieldEnabled = Boolean(enabled);
    if (Array.isArray(customRules) && customRules.length > 0) {
      var seen = Object.create(null);
      var merged = [];
      for (var i = 0; i < BUILTIN_DOMAINS.length; i++) {
        var b = BUILTIN_DOMAINS[i];
        if (!seen[b]) {
          seen[b] = true;
          merged.push(b);
        }
      }
      for (var j = 0; j < customRules.length; j++) {
        var c = String(customRules[j]).trim().toLowerCase();
        if (c && !seen[c]) {
          seen[c] = true;
          merged.push(c);
        }
      }
      BLOCKED_DOMAINS = merged;
    }
    applyCosmeticStyle();
  };

  // Layer 1: Trap YouTube SSR player/browse payloads cleanly without breaking non-ad JSON
  if (isYouTubeHost()) {
    try {
      var _ytInitialPlayerResponse = window.ytInitialPlayerResponse;
      if (_ytInitialPlayerResponse && window.__ferroxShieldEnabled) {
        if (pruneYouTubeObject(_ytInitialPlayerResponse, 0)) {
          reportBlocked('youtube-ads', window.location.href);
        }
      }
      Object.defineProperty(window, 'ytInitialPlayerResponse', {
        configurable: true,
        get: function() { return _ytInitialPlayerResponse; },
        set: function(val) {
          if (val && typeof val === 'object' && window.__ferroxShieldEnabled) {
            if (pruneYouTubeObject(val, 0)) {
              reportBlocked('youtube-ads', window.location.href);
            }
          }
          _ytInitialPlayerResponse = val;
        }
      });
    } catch (_e) {}

    try {
      var _ytInitialData = window.ytInitialData;
      if (_ytInitialData && window.__ferroxShieldEnabled) {
        if (pruneYouTubeObject(_ytInitialData, 0)) {
          reportBlocked('youtube-ads', window.location.href);
        }
      }
      Object.defineProperty(window, 'ytInitialData', {
        configurable: true,
        get: function() { return _ytInitialData; },
        set: function(val) {
          if (val && typeof val === 'object' && window.__ferroxShieldEnabled) {
            if (pruneYouTubeObject(val, 0)) {
              reportBlocked('youtube-ads', window.location.href);
            }
          }
          _ytInitialData = val;
        }
      });
    } catch (_e) {}

    // Prune ONLY explicit YouTube player/ad objects in JSON.parse (never mutate generic JSON)
    try {
      JSON.parse = function(text, reviver) {
        var parsed = nativeJsonParse.call(this, text, reviver);
        if (window.__ferroxShieldEnabled && parsed && typeof parsed === 'object') {
          if (
            'adPlacements' in parsed ||
            'playerAds' in parsed ||
            'adSlots' in parsed ||
            'playerResponse' in parsed
          ) {
            if (pruneYouTubeObject(parsed, 0)) {
              reportBlocked('youtube-ads', window.location.href);
            }
          }
        }
        return parsed;
      };
    } catch (_e) {}
  }

  // Layer 2: Universal fetch(), XMLHttpRequest, and navigator.sendBeacon interception
  try {
    if (typeof window.fetch === 'function') {
      var origFetch = window.fetch;
      window.fetch = function(input, init) {
        if (!window.__ferroxShieldEnabled) {
          return origFetch.apply(this, arguments);
        }
        var urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        var hit = urlStr ? matchBlockedDomain(urlStr) : null;
        if (hit) {
          reportBlocked(hit, urlStr);
          return Promise.resolve(buildStubResponse(urlStr, init));
        }

        var isYtApi = isYouTubeHost() && (
          urlStr.indexOf('/youtubei/v1/player') !== -1 ||
          urlStr.indexOf('/youtubei/v1/next') !== -1 ||
          urlStr.indexOf('/youtubei/v1/browse') !== -1 ||
          urlStr.indexOf('/youtubei/v1/search') !== -1
        );

        var reqPromise = origFetch.apply(this, arguments);
        if (!isYtApi) return reqPromise;

        return reqPromise.then(function(res) {
          try {
            var ct = ((res.headers && res.headers.get('content-type')) || '').toLowerCase();
            if (ct.indexOf('json') === -1) return res;
            return res.clone().text().then(function(bodyText) {
              try {
                var data = nativeJsonParse(bodyText);
                if (pruneYouTubeObject(data, 0)) {
                  reportBlocked('youtube-ads', urlStr);
                  var headers = new Headers(res.headers);
                  headers.delete('content-length');
                  headers.delete('content-encoding');
                  var patched = new Response(JSON.stringify(data), {
                    status: res.status,
                    statusText: res.statusText,
                    headers: headers
                  });
                  try {
                    Object.defineProperty(patched, 'url', { value: res.url || urlStr });
                  } catch (_u) {}
                  return patched;
                }
              } catch (_e) {}
              return res;
            }).catch(function() { return res; });
          } catch (_e) {
            return res;
          }
        });
      };
    }
  } catch (_e) {}

  try {
    if (window.XMLHttpRequest && XMLHttpRequest.prototype) {
      var origXhrOpen = XMLHttpRequest.prototype.open;
      var origXhrSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__ferroxUrl = typeof url === 'string' ? url : String(url || '');
        return origXhrOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function() {
        if (window.__ferroxShieldEnabled && this.__ferroxUrl) {
          var hit = matchBlockedDomain(this.__ferroxUrl);
          if (hit) {
            var xhr = this;
            var blockedUrl = this.__ferroxUrl;
            reportBlocked(hit, blockedUrl);
            var schedule = typeof window.setTimeout === 'function'
              ? window.setTimeout
              : function(fn) { fn(); };
            schedule(function() {
              try {
                var wantsJson = xhr.responseType === 'json' ||
                  blockedUrl.toLowerCase().indexOf('/youtubei/') !== -1 ||
                  blockedUrl.toLowerCase().indexOf('/get_midroll_info') !== -1 ||
                  blockedUrl.toLowerCase().indexOf('.json') !== -1;
                var textBody = wantsJson ? '{}' : '';
                var respVal = xhr.responseType === 'json' ? {} : textBody;
                Object.defineProperty(xhr, 'readyState', { configurable: true, value: 4 });
                Object.defineProperty(xhr, 'status', { configurable: true, value: 200 });
                Object.defineProperty(xhr, 'statusText', { configurable: true, value: 'OK' });
                Object.defineProperty(xhr, 'responseText', { configurable: true, value: textBody });
                Object.defineProperty(xhr, 'response', { configurable: true, value: respVal });
                if (typeof xhr.dispatchEvent === 'function' && typeof Event === 'function') {
                  xhr.dispatchEvent(new Event('readystatechange'));
                  xhr.dispatchEvent(new Event('load'));
                  xhr.dispatchEvent(new Event('loadend'));
                } else {
                  if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
                  if (typeof xhr.onload === 'function') xhr.onload();
                  if (typeof xhr.onloadend === 'function') xhr.onloadend();
                }
              } catch (_e) {}
            }, 0);
            return;
          }
        }
        return origXhrSend.apply(this, arguments);
      };
    }
  } catch (_e) {}

  try {
    if (typeof navigator !== 'undefined' && navigator && typeof navigator.sendBeacon === 'function') {
      var origBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function(url, data) {
        if (window.__ferroxShieldEnabled && typeof url === 'string') {
          var hit = matchBlockedDomain(url);
          if (hit) {
            reportBlocked(hit, url);
            return true;
          }
        }
        return origBeacon(url, data);
      };
    }
  } catch (_e) {}

  // Layer 3: Universal DOM Resource Guard (<script>, <iframe>, <img>) & Popunder Shield
  function neutralizeAdElement(el) {
    if (!window.__ferroxShieldEnabled || !el || el.nodeType !== 1) return false;
    var tag = (el.tagName || '').toUpperCase();
    if (tag !== 'SCRIPT' && tag !== 'IFRAME' && tag !== 'IMG' && tag !== 'LINK') {
      return false;
    }
    var rawUrl = '';
    try {
      rawUrl = tag === 'LINK'
        ? (el.getAttribute ? el.getAttribute('href') : el.href) || ''
        : (el.getAttribute ? el.getAttribute('src') : el.src) || '';
    } catch (_e) {}
    if (!rawUrl) return false;
    var hit = matchBlockedDomain(rawUrl);
    if (!hit) return false;

    reportBlocked(hit, rawUrl);
    try {
      if (el.setAttribute) el.setAttribute('data-ferrox-blocked', hit);
      if (tag === 'SCRIPT') {
        if (el.removeAttribute) el.removeAttribute('src');
        el.type = 'javascript/blocked';
      } else if (tag === 'IFRAME') {
        if (el.setAttribute) el.setAttribute('src', 'about:blank');
        if (el.style && el.style.setProperty) el.style.setProperty('display', 'none', 'important');
      } else if (tag === 'IMG') {
        if (el.removeAttribute) el.removeAttribute('src');
        if (el.removeAttribute) el.removeAttribute('srcset');
        if (el.style && el.style.setProperty) el.style.setProperty('display', 'none', 'important');
      } else if (tag === 'LINK') {
        if (el.removeAttribute) el.removeAttribute('href');
      }
    } catch (_e) {}
    return true;
  }

  try {
    if (typeof Element !== 'undefined' && Element.prototype && typeof Element.prototype.setAttribute === 'function') {
      var origSetAttr = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name, value) {
        if (window.__ferroxShieldEnabled && typeof name === 'string') {
          var lowerName = name.toLowerCase();
          var tag = (this.tagName || '').toUpperCase();
          if (
            (lowerName === 'src' && (tag === 'SCRIPT' || tag === 'IFRAME' || tag === 'IMG')) ||
            (lowerName === 'href' && tag === 'LINK')
          ) {
            var hit = matchBlockedDomain(String(value || ''));
            if (hit) {
              reportBlocked(hit, String(value));
              origSetAttr.call(this, 'data-ferrox-blocked', hit);
              if (tag === 'IFRAME') {
                if (this.style && this.style.setProperty) this.style.setProperty('display', 'none', 'important');
                return origSetAttr.call(this, 'src', 'about:blank');
              }
              if (tag === 'SCRIPT') {
                this.type = 'javascript/blocked';
              }
              return;
            }
          }
        }
        return origSetAttr.apply(this, arguments);
      };
    }
  } catch (_e) {}

  function patchSrcSetter(ctor) {
    try {
      if (!ctor || !ctor.prototype) return;
      var desc = Object.getOwnPropertyDescriptor(ctor.prototype, 'src');
      if (!desc || !desc.set || !desc.configurable) return;
      Object.defineProperty(ctor.prototype, 'src', {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set: function(val) {
          if (window.__ferroxShieldEnabled && typeof val === 'string') {
            var hit = matchBlockedDomain(val);
            if (hit) {
              reportBlocked(hit, val);
              try {
                if (this.setAttribute) this.setAttribute('data-ferrox-blocked', hit);
                if ((this.tagName || '').toUpperCase() === 'IFRAME') {
                  if (this.style && this.style.setProperty) this.style.setProperty('display', 'none', 'important');
                  return desc.set.call(this, 'about:blank');
                }
                if ((this.tagName || '').toUpperCase() === 'SCRIPT') {
                  this.type = 'javascript/blocked';
                }
              } catch (_e) {}
              return;
            }
          }
          return desc.set.call(this, val);
        }
      });
    } catch (_e) {}
  }

  if (typeof HTMLScriptElement !== 'undefined') patchSrcSetter(HTMLScriptElement);
  if (typeof HTMLIFrameElement !== 'undefined') patchSrcSetter(HTMLIFrameElement);
  if (typeof HTMLImageElement !== 'undefined') patchSrcSetter(HTMLImageElement);

  try {
    if (typeof Node !== 'undefined' && Node.prototype) {
      if (typeof Node.prototype.appendChild === 'function') {
        var origAppendChild = Node.prototype.appendChild;
        Node.prototype.appendChild = function(child) {
          if (neutralizeAdElement(child) && (child.tagName || '').toUpperCase() === 'SCRIPT') {
            if (typeof child.onload === 'function' && typeof window.setTimeout === 'function') {
              window.setTimeout(function() {
                try { child.onload(); } catch (_e) {}
              }, 0);
            }
          }
          return origAppendChild.call(this, child);
        };
      }
      if (typeof Node.prototype.insertBefore === 'function') {
        var origInsertBefore = Node.prototype.insertBefore;
        Node.prototype.insertBefore = function(child, ref) {
          if (neutralizeAdElement(child) && (child.tagName || '').toUpperCase() === 'SCRIPT') {
            if (typeof child.onload === 'function' && typeof window.setTimeout === 'function') {
              window.setTimeout(function() {
                try { child.onload(); } catch (_e) {}
              }, 0);
            }
          }
          return origInsertBefore.call(this, child, ref);
        };
      }
    }
  } catch (_e) {}

  // Block popunder / ad-redirect window.open calls while keeping legitimate popups intact
  try {
    if (typeof window.open === 'function') {
      var origWindowOpen = window.open;
      window.open = function(url) {
        if (window.__ferroxShieldEnabled && typeof url === 'string' && url.trim()) {
          var hit = matchBlockedDomain(url);
          if (hit) {
            reportBlocked('popup:' + hit, url);
            return null;
          }
        }
        return origWindowOpen.apply(this, arguments);
      };
    }
  } catch (_e) {}

  // Layer 4: Universal DOM Sweeper + Safe, Non-Stalling YouTube SSAI Failsafe
  var adActive = false;
  var prevMuted = false;
  var adSeekAttempts = 0;
  var lastAdSeekAt = 0;
  var sweepScheduled = false;
  var lastSweepAt = 0;

  function sweepUniversalAds() {
    if (!window.__ferroxShieldEnabled || !document.querySelectorAll) return;
    try {
      var iframes = document.querySelectorAll('iframe[src]');
      for (var i = 0; i < iframes.length; i++) {
        neutralizeAdElement(iframes[i]);
      }
      var adUnits = document.querySelectorAll('ins.adsbygoogle:not([data-ferrox-blocked])');
      for (var j = 0; j < adUnits.length; j++) {
        var unit = adUnits[j];
        if (unit.setAttribute) unit.setAttribute('data-ferrox-blocked', 'googlesyndication.com');
        if (unit.style && unit.style.setProperty) unit.style.setProperty('display', 'none', 'important');
        reportBlocked('googlesyndication.com', window.location.href);
      }
    } catch (_e) {}
  }

  function sweepYouTubePlayerAds() {
    if (!window.__ferroxShieldEnabled || !isYouTubeHost()) return;
    var player = document.getElementById('movie_player') || (document.querySelector && document.querySelector('.html5-video-player'));
    var isAdNow = Boolean(
      player && player.classList &&
      (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))
    );

    var video =
      (player && typeof player.querySelector === 'function' && player.querySelector('video.html5-main-video')) ||
      (document.querySelector && (document.querySelector('video.html5-main-video') || document.querySelector('video'))) ||
      null;

    if (isAdNow) {
      if (!adActive) {
        adActive = true;
        adSeekAttempts = 0;
        lastAdSeekAt = 0;
        prevMuted = Boolean(video && video.muted);
        reportBlocked('youtube-video-ad', window.location.href);
      }

      if (video) {
        video.muted = true;
        var now = Date.now();
        var ready = typeof video.readyState === 'number' ? video.readyState >= 2 : true;
        var isSeeking = Boolean(video.seeking);
        // Only seek when media metadata + current frame are actually loaded, duration looks like an ad (<= 300s),
        // and rate-limit to max 2 seeks spaced 800ms apart so MSE NEVER gets trapped in an infinite buffering loop!
        if (
          ready &&
          !isSeeking &&
          Number.isFinite(video.duration) &&
          video.duration > 0.2 &&
          video.duration <= 300 &&
          video.currentTime < video.duration - 0.15 &&
          adSeekAttempts < 2 &&
          now - lastAdSeekAt >= 800
        ) {
          adSeekAttempts += 1;
          lastAdSeekAt = now;
          try {
            video.currentTime = video.duration;
          } catch (_e) {}
          if (video.paused && typeof video.play === 'function') {
            try { video.play(); } catch (_p) {}
          }
        }
        if (ready && !isSeeking) {
          try {
            if (video.playbackRate < 8) video.playbackRate = 8;
          } catch (_e) {}
        }
      }

      if (document.querySelectorAll) {
        var skipBtns = document.querySelectorAll(
          '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button'
        );
        for (var i = 0; i < skipBtns.length; i++) {
          try { skipBtns[i].click(); } catch (_e) {}
        }
        var closeOverlays = document.querySelectorAll('.ytp-ad-overlay-close-button');
        for (var j = 0; j < closeOverlays.length; j++) {
          try { closeOverlays[j].click(); } catch (_e) {}
        }
      }
    } else if (adActive) {
      adActive = false;
      adSeekAttempts = 0;
      lastAdSeekAt = 0;
      if (video) {
        video.muted = prevMuted;
        try { video.playbackRate = 1; } catch (_e) {}
      }
    }

    // Dismiss YouTube anti-adblock popup if it ever appears
    var enforcement = document.querySelector && document.querySelector('ytd-enforcement-message-view-model');
    if (enforcement) {
      var dialog = enforcement.closest && enforcement.closest('tp-yt-paper-dialog');
      if (dialog && dialog.parentNode) dialog.parentNode.removeChild(dialog);
      if (document.querySelectorAll) {
        var backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop');
        for (var b = 0; b < backdrops.length; b++) {
          if (backdrops[b].parentNode) backdrops[b].parentNode.removeChild(backdrops[b]);
        }
      }
      if (video && video.paused && typeof video.play === 'function') {
        try { video.play(); } catch (_e) {}
      }
    }
  }

  function runSweep() {
    sweepScheduled = false;
    if (!window.__ferroxShieldEnabled) return;
    if (document.hidden && !adActive) return;
    lastSweepAt = Date.now();
    applyCosmeticStyle();
    if (isYouTubeHost()) {
      sweepYouTubePlayerAds();
    } else {
      sweepUniversalAds();
    }
  }

  function scheduleSweep() {
    if (sweepScheduled || !window.__ferroxShieldEnabled) return;
    var elapsed = Date.now() - lastSweepAt;
    var minGap = isYouTubeHost() ? 200 : 350;
    if (elapsed < minGap && typeof window.setTimeout === 'function') {
      sweepScheduled = true;
      window.setTimeout(function() {
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(runSweep);
        } else {
          runSweep();
        }
      }, minGap - elapsed);
      return;
    }
    sweepScheduled = true;
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(runSweep);
    } else if (typeof window.setTimeout === 'function') {
      window.setTimeout(runSweep, 16);
    } else {
      runSweep();
    }
  }

  function startDomProtection() {
    applyCosmeticStyle();
    runSweep();
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      var observer = new MutationObserver(scheduleSweep);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: isYouTubeHost(),
        attributeFilter: isYouTubeHost() ? ['class'] : undefined
      });
    }
    if (isYouTubeHost() && typeof window.setInterval === 'function') {
      window.setInterval(function() {
        if (!document.hidden || adActive) {
          sweepYouTubePlayerAds();
        }
      }, 650);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startDomProtection, { once: true });
    applyCosmeticStyle();
  } else {
    startDomProtection();
  }
})();
"#
    }
}
