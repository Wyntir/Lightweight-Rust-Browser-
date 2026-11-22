use std::collections::HashSet;

use url::Url;

pub struct AdShield {
    pub enabled: bool,
    blocked_domains: HashSet<String>,
    blocked_events: Vec<String>,
}

impl AdShield {
    pub fn with_default_rules() -> Self {
        let defaults = [
            "doubleclick.net",
            "googlesyndication.com",
            "googleadservices.com",
            "google-analytics.com",
            "googletagmanager.com",
            "adservice.google.com",
            "pagead2.googlesyndication.com",
            "static.doubleclick.net",
            "connect.facebook.net",
            "scorecardresearch.com",
            "mixpanel.com",
            "hotjar.com",
            "segment.io",
            "ads.twitter.com",
        ];
        Self {
            enabled: true,
            blocked_domains: defaults.into_iter().map(String::from).collect(),
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
        self.blocked_domains
            .iter()
            .any(|rule| host_lower == *rule || host_lower.ends_with(&format!(".{}", rule)))
    }

    pub fn record_block(&mut self, url: &str) {
        self.blocked_events.push(url.to_string());
    }

    pub fn blocked_count(&self) -> usize {
        self.blocked_events.len()
    }

    /// Multi-layer document-start ad & YouTube adblock script injected into every content WebView.
    /// Layer 1: Strips YouTube `adPlacements`, `playerAds`, `adSlots`, and feed ad renderers from
    ///          `ytInitialPlayerResponse`, `ytInitialData`, `JSON.parse`, and `youtubei/v1/*` fetch responses.
    /// Layer 2: Stubs third-party ad/tracker network requests (`fetch` / `XMLHttpRequest`) with clean 200 OK
    ///          responses to avoid tripping YouTube's anti-adblock detector.
    /// Layer 3: Fast-forwards & auto-skips any Server-Side Ad Injection (SSAI) video ad segments cleanly.
    /// Layer 4: Injects YouTube + general web cosmetic CSS rules once DOM is ready, toggleable live via
    ///          `window.__ferroxSetShield(enabled)`.
    pub fn cosmetic_init_script(&self) -> &'static str {
        r#"
(function() {
  if (window.__ferroxAdShieldInstalled) return;
  window.__ferroxAdShieldInstalled = true;
  window.__ferroxShieldEnabled = true;
  var nativeJsonParse = JSON.parse;

  var BLOCKED_DOMAINS = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'google-analytics.com',
    'googletagmanager.com',
    'adservice.google.com',
    'connect.facebook.net',
    'scorecardresearch.com',
    'mixpanel.com',
    'hotjar.com',
    'segment.io',
    'ads.twitter.com'
  ];

  var YT_AD_URL_PATTERNS = [
    '/pagead/',
    '/api/stats/ads',
    '/api/stats/atr',
    '/ptracking',
    '/get_midroll_info',
    '/youtubei/v1/log_event',
    'adformat=',
    'ad_type='
  ];

  var AD_CSS = [
    '[data-ad-slot], .ad-banner, .adsbygoogle, ins.adsbygoogle { display: none !important; }',
    'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer,',
    'ytd-statement-banner-renderer, ytd-promoted-sparkles-web-renderer,',
    'ytd-promoted-sparkles-text-search-renderer, ytd-promoted-video-renderer,',
    'ytd-display-ad-renderer, ytd-companion-slot-renderer, ytd-action-companion-ad-renderer,',
    'ytd-player-legacy-desktop-watch-ads-renderer, ytd-rich-item-renderer:has(ytd-ad-slot-renderer),',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],',
    'ytd-merch-shelf-renderer, #masthead-ad, #player-ads, .ytd-banner-promo-renderer-background,',
    '.ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-text-overlay, .ytp-ad-image-overlay,',
    '.ytp-ad-action-interstitial, .ytp-ad-player-overlay-instream-info, .video-ads,',
    'ytm-promoted-sparkles-web-renderer, ad-slot-renderer, ytd-enforcement-message-view-model,',
    'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model) { display: none !important; }'
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
          host: host || 'youtube.com',
          url: url || window.location.href
        }));
      }
    } catch (_e) {}
  }

  function isYouTubeHost() {
    try {
      var h = (window.location && window.location.hostname ? window.location.hostname : '').toLowerCase();
      return h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be';
    } catch (_e) {
      return false;
    }
  }

  function matchBlockedDomain(urlStr) {
    try {
      var parsed = new URL(urlStr, window.location.href);
      var host = parsed.hostname.toLowerCase();
      for (var i = 0; i < BLOCKED_DOMAINS.length; i++) {
        var rule = BLOCKED_DOMAINS[i];
        if (host === rule || host.endsWith('.' + rule)) {
          return host;
        }
      }
      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        var pathAndQuery = (parsed.pathname + parsed.search).toLowerCase();
        for (var j = 0; j < YT_AD_URL_PATTERNS.length; j++) {
          if (pathAndQuery.indexOf(YT_AD_URL_PATTERNS[j]) !== -1) {
            return 'youtube-ads';
          }
        }
      }
    } catch (_e) {}
    return null;
  }

  function isAdRendererEntry(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.adSlotRenderer || item.inFeedAdLayoutRenderer || item.promotedSparklesWebRenderer ||
        item.promotedSparklesTextSearchRenderer || item.displayAdRenderer || item.bannerPromoRenderer) {
      return true;
    }
    if (item.richItemRenderer && item.richItemRenderer.content && item.richItemRenderer.content.adSlotRenderer) {
      return true;
    }
    return false;
  }

  function pruneYouTubeObject(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 8) return false;
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

    if (Array.isArray(obj.adPlacements) && obj.adPlacements.length > 0) {
      obj.adPlacements = [];
      removed = true;
    }
    if (Array.isArray(obj.playerAds) && obj.playerAds.length > 0) {
      obj.playerAds = [];
      removed = true;
    }
    if (Array.isArray(obj.adSlots) && obj.adSlots.length > 0) {
      obj.adSlots = [];
      removed = true;
    }
    if ('adBreakHeartbeatParams' in obj) {
      delete obj.adBreakHeartbeatParams;
      removed = true;
    }
    if ('adBreakParams' in obj) {
      delete obj.adBreakParams;
      removed = true;
    }
    if (obj.auxiliaryUi && obj.auxiliaryUi.messageRenderers && obj.auxiliaryUi.messageRenderers.bkaEnforcementMessageViewModel) {
      delete obj.auxiliaryUi.messageRenderers.bkaEnforcementMessageViewModel;
      removed = true;
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
      BLOCKED_DOMAINS = customRules.map(function(r) { return String(r).trim().toLowerCase(); }).filter(Boolean);
    }
    applyCosmeticStyle();
  };

  // Layer 1a: Trap SSR-injected ytInitialPlayerResponse & ytInitialData before YouTube reads them
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

    // Layer 1b: Prune adPlacements/playerAds/adSlots from JSON.parse on YouTube
    try {
      JSON.parse = function(text, reviver) {
        var parsed = nativeJsonParse.call(this, text, reviver);
        if (window.__ferroxShieldEnabled && parsed && typeof parsed === 'object') {
          if (
            'adPlacements' in parsed ||
            'playerAds' in parsed ||
            'adSlots' in parsed ||
            'playerResponse' in parsed ||
            'contents' in parsed ||
            'onResponseReceivedActions' in parsed ||
            'onResponseReceivedEndpoints' in parsed
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

  // Layer 2: Intercept fetch() & XMLHttpRequest for ad/tracker blocking and youtubei JSON pruning
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
          return Promise.resolve(new Response('', { status: 200, statusText: 'OK' }));
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
                  return new Response(JSON.stringify(data), {
                    status: res.status,
                    statusText: res.statusText,
                    headers: headers
                  });
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
            reportBlocked(hit, this.__ferroxUrl);
            try {
              Object.defineProperty(this, 'readyState', { configurable: true, value: 4 });
              Object.defineProperty(this, 'status', { configurable: true, value: 200 });
              Object.defineProperty(this, 'responseText', { configurable: true, value: '' });
              Object.defineProperty(this, 'response', { configurable: true, value: '' });
              if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
              if (typeof this.onload === 'function') this.onload();
            } catch (_e) {}
            return;
          }
        }
        return origXhrSend.apply(this, arguments);
      };
    }
  } catch (_e) {}

  // Layer 3 & 4: Cosmetic CSS + SSAI Video Ad Auto-Skip Failsafe on YouTube
  var adActive = false;
  var prevMuted = false;

  function sweepYouTubePlayerAds() {
    if (!window.__ferroxShieldEnabled || !isYouTubeHost()) return;
    applyCosmeticStyle();

    var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    var video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    var isAdNow = Boolean(
      player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))
    );

    if (isAdNow && video) {
      if (!adActive) {
        adActive = true;
        prevMuted = Boolean(video.muted);
        reportBlocked('youtube-video-ad', window.location.href);
      }
      video.muted = true;
      if (Number.isFinite(video.duration) && video.duration > 0.2 && video.currentTime < video.duration - 0.15) {
        try { video.currentTime = video.duration - 0.05; } catch (_e) {}
      }
      try {
        if (video.playbackRate < 16) video.playbackRate = 16;
      } catch (_e) {}
      var skipBtns = document.querySelectorAll(
        '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button'
      );
      for (var i = 0; i < skipBtns.length; i++) {
        try { skipBtns[i].click(); } catch (_e) {}
      }
    } else if (adActive && video) {
      adActive = false;
      video.muted = prevMuted;
      try { video.playbackRate = 1; } catch (_e) {}
    }

    var closeOverlays = document.querySelectorAll('.ytp-ad-overlay-close-button');
    for (var j = 0; j < closeOverlays.length; j++) {
      try { closeOverlays[j].click(); } catch (_e) {}
    }

    // Dismiss YouTube anti-adblock popup if it ever appears
    var enforcement = document.querySelector('ytd-enforcement-message-view-model');
    if (enforcement) {
      var dialog = enforcement.closest('tp-yt-paper-dialog');
      if (dialog && dialog.parentNode) dialog.parentNode.removeChild(dialog);
      var backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop');
      for (var b = 0; b < backdrops.length; b++) {
        if (backdrops[b].parentNode) backdrops[b].parentNode.removeChild(backdrops[b]);
      }
      if (video && video.paused) {
        try { video.play(); } catch (_e) {}
      }
    }
  }

  function startDomProtection() {
    applyCosmeticStyle();
    if (!isYouTubeHost()) return;
    sweepYouTubePlayerAds();
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      var observer = new MutationObserver(function() {
        sweepYouTubePlayerAds();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }
    window.setInterval(sweepYouTubePlayerAds, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startDomProtection, { once: true });
    // Also attempt early style injection on documentElement if already present
    applyCosmeticStyle();
  } else {
    startDomProtection();
  }
})();
"#
    }
}
