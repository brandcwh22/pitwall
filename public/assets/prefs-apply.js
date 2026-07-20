/* Pit Wall — apply board preferences (theme, accent, auto-sync, finish countdown).
 * Loads /api/preferences and reflects it on the board. Name & number arrive via
 * SC_DATA meta (server-side), so this script owns theme, timing and the countdown. */
(function () {
  'use strict';

  // Livery accents — [primary, secondary]. 'pitwall' is the single-colour default.
  var TEAMS = {
    pitwall:  ['#D80619', '#D80619'],
    ferrari:  ['#D3002B', '#EBC24A'],
    redbull:  ['#20305F', '#D8102B'],
    mercedes: ['#009B8A', '#9BA5AF'],
    mclaren:  ['#E56A12', '#2585B8'],
    aston:    ['#00564C', '#9DB524'],
    alpine:   ['#1268A6', '#DB5F97'],
    williams: ['#2A5EBB', '#4C9DBB'],
    sauber:   ['#1FA84A', '#2A2A2A'],
  };
  var syncTimer = null, cdTimer = null;

  function darken(hex, f) {
    var n = parseInt(String(hex).slice(1), 16);
    if (isNaN(n)) return hex;
    var r = Math.round(((n >> 16) & 255) * f);
    var g = Math.round(((n >> 8) & 255) * f);
    var b = Math.round((n & 255) * f);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function applyTheme(p) {
    var root = document.documentElement;
    var team = TEAMS[p.accent] || TEAMS.pitwall;
    var c1 = team[0];
    // Single-colour accent: everything derives from one hue (darkened only for depth).
    root.style.setProperty('--red', c1);
    root.style.setProperty('--red-deep', darken(c1, 0.66));
    root.style.setProperty('--brand', c1);
    root.style.setProperty('--brand2', c1);
  }

  function setupAutoSync(p) {
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
    var mins = Number(p.autoSyncMinutes) || 0;
    if (mins > 0) {
      syncTimer = setInterval(function () {
        var b = document.getElementById('syncBtn');
        if (b && !b.disabled) b.click();
      }, mins * 60 * 1000);
    }
  }

  function ensureFinishChip() {
    var chip = document.getElementById('pwFinish');
    if (chip) return chip;
    var right = document.querySelector('.topbar .tb-right');
    if (!right) return null;
    chip = document.createElement('div');
    chip.id = 'pwFinish';
    chip.className = 'tb-finish';
    chip.hidden = true;
    chip.innerHTML =
      '<span class="tf-flag" aria-hidden="true"></span>' +
      '<span class="tf-body"><span class="tf-lab"></span><span class="tf-val">—</span></span>';
    right.insertBefore(chip, right.firstChild);
    return chip;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function hm(str, base) {
    var parts = String(str || '').split(':');
    var d = new Date(base.getTime());
    d.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
    return d;
  }

  // Work out the current shift state relative to `now`.
  // Handles same-day (start<end) and overnight (start>end) shifts.
  function shiftInfo(p, now) {
    var days = p.shiftDays || [];
    if (!p.shiftEnabled || !days.length) return null;
    var start = hm(p.shiftStart, now), end = hm(p.shiftEnd, now);
    var overnight = end <= start;
    var today = now.getDay();
    var yesterday = (today + 6) % 7;

    // On the clock now? (overnight shift may have begun yesterday)
    if (days.indexOf(today) >= 0 && now >= start && (overnight || now < end)) {
      var e = overnight ? hm(p.shiftEnd, new Date(now.getTime() + 864e5)) : end;
      return { label: 'Shift ends', target: e, on: true };
    }
    if (overnight && days.indexOf(yesterday) >= 0 && now < end) {
      return { label: 'Shift ends', target: end, on: true };
    }
    // Before today's shift start
    if (days.indexOf(today) >= 0 && now < start) {
      return { label: 'Shift starts', target: start, on: false };
    }
    // Otherwise, the next working day's start
    for (var i = 1; i <= 7; i++) {
      var d = (today + i) % 7;
      if (days.indexOf(d) >= 0) {
        var nx = hm(p.shiftStart, new Date(now.getTime() + i * 864e5));
        return { label: 'Next shift', target: nx, on: false };
      }
    }
    return null;
  }

  function renderCountdown(p) {
    var chip = ensureFinishChip();
    if (!chip) return;
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    if (!p.shiftEnabled || !(p.shiftDays || []).length) { chip.hidden = true; return; }
    chip.hidden = false;
    var labEl = chip.querySelector('.tf-lab');
    var valEl = chip.querySelector('.tf-val');
    function tick() {
      var now = new Date();
      var info = shiftInfo(p, now);
      chip.classList.remove('done', 'soon');
      if (!info) { chip.hidden = true; return; }
      chip.hidden = false;
      labEl.textContent = info.label;
      var diff = info.target.getTime() - now.getTime();
      if (diff <= 0) { valEl.textContent = '—'; return; }
      var s = Math.floor(diff / 1000);
      var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
          m = Math.floor((s % 3600) / 60), ss = s % 60;
      valEl.textContent = d > 0 ? (d + 'd ' + pad(h) + 'h ' + pad(m) + 'm') : (pad(h) + ':' + pad(m) + ':' + pad(ss));
      // pulse in the final 30 min of an active shift
      chip.classList.toggle('soon', info.on && diff < 1800 * 1000);
    }
    tick();
    cdTimer = setInterval(tick, 1000);
  }

  function apply(p) {
    p = p || {};
    applyTheme(p);
    setupAutoSync(p);
    renderCountdown(p);
  }

  function load() {
    fetch('/api/preferences')
      .then(function (r) { return r.json(); })
      .then(apply)
      .catch(function () { /* preferences are optional; board still works */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
