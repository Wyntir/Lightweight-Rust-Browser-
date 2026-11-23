use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DohProvider {
    Cloudflare,
    Quad9,
    Google,
    Custom,
}

impl DohProvider {
    pub fn endpoint(self) -> &'static str {
        match self {
            DohProvider::Cloudflare => "https://cloudflare-dns.com/dns-query",
            DohProvider::Quad9 => "https://dns.quad9.net/dns-query",
            DohProvider::Google => "https://dns.google/dns-query",
            DohProvider::Custom => "",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PermissionDecision {
    Ask,
    Allow,
    Block,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SitePermissions {
    pub camera: PermissionDecision,
    pub microphone: PermissionDecision,
    pub notifications: PermissionDecision,
    pub location: PermissionDecision,
    pub clipboard: PermissionDecision,
}

impl Default for SitePermissions {
    fn default() -> Self {
        Self {
            camera: PermissionDecision::Ask,
            microphone: PermissionDecision::Ask,
            notifications: PermissionDecision::Block,
            location: PermissionDecision::Ask,
            clipboard: PermissionDecision::Ask,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyConfig {
    pub block_third_party_cookies: bool,
    pub clear_cookies_on_exit: bool,
    pub fingerprint_protection: bool,
    pub webrtc_ip_protection: bool,
    pub strip_tracking_params: bool,
    pub block_cryptominers: bool,
    pub global_privacy_control: bool,
    pub block_hyperlink_auditing: bool,
    pub private_browsing: bool,
    pub doh_provider: DohProvider,
    pub custom_doh_url: String,
    pub vpn_enabled: bool,
    pub vpn_region: String,
    pub per_site_permissions: HashMap<String, SitePermissions>,
}

impl Default for PrivacyConfig {
    fn default() -> Self {
        Self {
            block_third_party_cookies: true,
            clear_cookies_on_exit: false,
            fingerprint_protection: true,
            webrtc_ip_protection: true,
            strip_tracking_params: true,
            block_cryptominers: true,
            global_privacy_control: true,
            block_hyperlink_auditing: true,
            private_browsing: false,
            doh_provider: DohProvider::Cloudflare,
            custom_doh_url: String::new(),
            vpn_enabled: false,
            vpn_region: "US-East".to_string(),
            per_site_permissions: HashMap::new(),
        }
    }
}

impl PrivacyConfig {
    /// Generates a comprehensive hardened WebView init script providing:
    /// - Global Privacy Control (GPC) & Do-Not-Track signals
    /// - WebRTC local/host ICE candidate IP-leak protection
    /// - Canvas, WebGL, Hardware & Battery API anti-fingerprinting
    /// - Hyperlink auditing (<a ping>) removal & tracker sendBeacon neutralization
    /// Live-updatable via `window.__ferroxSetPrivacy(cfg)`.
    pub fn anti_fingerprint_script(&self) -> &'static str {
        r#"
(function() {
  if (window.__ferroxPrivacyHardened) return;
  window.__ferroxPrivacyHardened = true;

  var cfg = {
    fingerprintProtection: true,
    webrtcIpProtection: true,
    globalPrivacyControl: true,
    blockHyperlinkAuditing: true
  };

  window.__ferroxSetPrivacy = function(next) {
    if (!next || typeof next !== 'object') return;
    if (typeof next.fingerprintProtection === 'boolean') cfg.fingerprintProtection = next.fingerprintProtection;
    if (typeof next.webrtcIpProtection === 'boolean') cfg.webrtcIpProtection = next.webrtcIpProtection;
    if (typeof next.globalPrivacyControl === 'boolean') cfg.globalPrivacyControl = next.globalPrivacyControl;
    if (typeof next.blockHyperlinkAuditing === 'boolean') cfg.blockHyperlinkAuditing = next.blockHyperlinkAuditing;
  };

  function postPrivacyBlock(host, url) {
    try {
      if (window.ipc && typeof window.ipc.postMessage === 'function') {
        window.ipc.postMessage(JSON.stringify({
          action: 'ad_blocked',
          host: host,
          url: url || window.location.href
        }));
      }
    } catch (_e) {}
  }

  // 1. Global Privacy Control (GPC) + Hardware / Battery fingerprint normalization
  try {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      get: function() { return cfg.globalPrivacyControl; }
    });
    Object.defineProperty(navigator, 'doNotTrack', {
      configurable: true,
      get: function() { return cfg.globalPrivacyControl ? '1' : null; }
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: function() { return cfg.fingerprintProtection ? 4 : 8; }
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      get: function() { return cfg.fingerprintProtection ? 4 : 8; }
    });
    if (typeof navigator.getBattery === 'function') {
      var origGetBattery = navigator.getBattery.bind(navigator);
      navigator.getBattery = function() {
        if (!cfg.fingerprintProtection) return origGetBattery();
        return Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1.0,
          addEventListener: function() {},
          removeEventListener: function() {}
        });
      };
    }
  } catch (_e) {}

  // 2. Canvas & WebGL fingerprint defense (deterministic per-session 1-bit pixel noise + normalized GPU strings)
  try {
    var sessionSeed = ((Math.random() * 255) | 0) & 1;
    if (window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype && CanvasRenderingContext2D.prototype.getImageData) {
      var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function() {
        var img = origGetImageData.apply(this, arguments);
        if (cfg.fingerprintProtection && img && img.data && img.data.length >= 4) {
          img.data[0] = img.data[0] ^ sessionSeed;
        }
        return img;
      };
    }
    if (window.WebGLRenderingContext && WebGLRenderingContext.prototype && WebGLRenderingContext.prototype.getParameter) {
      var origGlParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(param) {
        if (cfg.fingerprintProtection) {
          if (param === 37445) return 'FerroX Generic GPU';
          if (param === 37446) return 'FerroX Hardened WebGL';
        }
        return origGlParam.apply(this, arguments);
      };
    }
  } catch (_e) {}

  // 3. WebRTC IP Leak Guard (forces relay-only ICE & strips private/local host candidates)
  try {
    var NativeRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (typeof NativeRTC === 'function') {
      var HardenedRTC = function(rtcConfig, constraints) {
        var nextCfg = rtcConfig ? Object.assign({}, rtcConfig) : {};
        if (cfg.webrtcIpProtection) {
          nextCfg.iceTransportPolicy = 'relay';
        }
        var pc = new NativeRTC(nextCfg, constraints);
        if (cfg.webrtcIpProtection && typeof pc.addEventListener === 'function') {
          var origAddListener = pc.addEventListener.bind(pc);
          pc.addEventListener = function(type, listener, options) {
            if (type === 'icecandidate' && typeof listener === 'function') {
              return origAddListener(type, function(ev) {
                if (ev && ev.candidate && typeof ev.candidate.candidate === 'string') {
                  var cand = ev.candidate.candidate;
                  if (cand.indexOf(' typ host') !== -1 || /\.local\b/i.test(cand)) {
                    postPrivacyBlock('webrtc-ip-leak', window.location.href);
                    return;
                  }
                }
                listener.call(this, ev);
              }, options);
            }
            return origAddListener(type, listener, options);
          };
        }
        return pc;
      };
      HardenedRTC.prototype = NativeRTC.prototype;
      window.RTCPeerConnection = HardenedRTC;
      if (window.webkitRTCPeerConnection) {
        window.webkitRTCPeerConnection = HardenedRTC;
      }
    }
  } catch (_e) {}

  // 4. Hyperlink Auditing (<a ping="...">) Blocker + Tracker sendBeacon Neutralization
  try {
    document.addEventListener('click', function(ev) {
      if (!cfg.blockHyperlinkAuditing) return;
      var anchor = ev.target && ev.target.closest ? ev.target.closest('a[ping]') : null;
      if (anchor) {
        anchor.removeAttribute('ping');
        postPrivacyBlock('hyperlink-ping', anchor.href || window.location.href);
      }
    }, true);

    if (typeof navigator.sendBeacon === 'function') {
      var origBeacon = navigator.sendBeacon.bind(navigator);
      var beaconBlockList = [
        'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
        'googlesyndication.com', 'facebook.net', 'scorecardresearch.com',
        'mixpanel.com', 'hotjar.com', 'segment.io', 'coinhive.com', 'cryptoloot.pro'
      ];
      navigator.sendBeacon = function(url, data) {
        if (cfg.blockHyperlinkAuditing && typeof url === 'string') {
          try {
            var host = new URL(url, window.location.href).hostname.toLowerCase();
            for (var i = 0; i < beaconBlockList.length; i++) {
              if (host === beaconBlockList[i] || host.endsWith('.' + beaconBlockList[i])) {
                postPrivacyBlock('beacon:' + host, url);
                return true;
              }
            }
          } catch (_e) {}
        }
        return origBeacon(url, data);
      };
    }
  } catch (_e) {}
})();
"#
    }
}
