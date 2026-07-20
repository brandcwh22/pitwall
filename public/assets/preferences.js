/* Pit Wall — Preferences. Vanilla JS, no build step.
 * Loads /api/preferences + /api/connections, previews theme live, saves back. */
(function () {
  'use strict';

  // Real F1 team liveries — [id, name, primary, secondary].
  var TEAMS = [
    { id: 'pitwall',  name: 'Pit Wall',     c1: '#D80619', c2: '#D80619' },
    { id: 'ferrari',  name: 'Ferrari',      c1: '#D3002B', c2: '#EBC24A' },
    { id: 'redbull',  name: 'Red Bull',     c1: '#20305F', c2: '#D8102B' },
    { id: 'mercedes', name: 'Mercedes',     c1: '#009B8A', c2: '#9BA5AF' },
    { id: 'mclaren',  name: 'McLaren',      c1: '#E56A12', c2: '#2585B8' },
    { id: 'aston',    name: 'Aston Martin', c1: '#00564C', c2: '#9DB524' },
    { id: 'alpine',   name: 'Alpine',       c1: '#1268A6', c2: '#DB5F97' },
    { id: 'williams', name: 'Williams',     c1: '#2A5EBB', c2: '#4C9DBB' },
    { id: 'sauber',   name: 'Kick Sauber',  c1: '#1FA84A', c2: '#2A2A2A' },
  ];
  var ACCENTS = TEAMS.map(function (t) { return t.id; });
  function teamOf(id) { return TEAMS.filter(function (t) { return t.id === id; })[0] || TEAMS[0]; }

  var state = { prefs: null, connections: [], sample: false };
  var el = {
    banner: document.getElementById('banner'),
    saveBtn: document.getElementById('saveBtn'),
    name: document.getElementById('prefName'),
    number: document.getElementById('prefNumber'),
    accents: document.getElementById('accentSwatches'),
    syncSeg: document.getElementById('syncSeg'),
    shiftSeg: document.getElementById('shiftSeg'),
    dayPick: document.getElementById('dayPick'),
    shiftStart: document.getElementById('shiftStart'),
    shiftEnd: document.getElementById('shiftEnd'),
    connList: document.getElementById('connList'),
  };

  // Day picker, Monday-first for display; values are 0=Sun … 6=Sat.
  var DAYS = [{ v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
              { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' }];

  function api(path, opts) { return fetch(path, opts).then(function (r) { return r.json(); }); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function showBanner(html, kind) {
    el.banner.hidden = false;
    el.banner.className = 'banner' + (kind ? ' ' + kind : '');
    el.banner.innerHTML = html;
    el.banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function darken(hex, f) {
    var n = parseInt(String(hex).slice(1), 16);
    if (isNaN(n)) return hex;
    var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Live accent preview on this page (mirrors what prefs-apply.js does on the board).
  function applyTheme(accent) {
    var root = document.documentElement;
    var t = teamOf(accent);
    root.style.setProperty('--accent', t.c1);
    root.style.setProperty('--red', t.c1);
    root.style.setProperty('--red-deep', darken(t.c1, 0.66));
    root.style.setProperty('--brand', t.c1);
    root.style.setProperty('--brand2', t.c1);
  }

  function selectSeg(seg, attr, value) {
    [].forEach.call(seg.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-' + attr) === String(value));
    });
  }

  function renderAccents() {
    el.accents.innerHTML = '';
    TEAMS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'livery' + (state.prefs.accent === t.id ? ' active' : '');
      b.title = t.name;
      // solid single-colour livery chip
      b.innerHTML = '<span class="lv-chip" style="background:' + t.c1 + '"></span>' +
                    '<span class="lv-name">' + esc(t.name) + '</span>';
      b.addEventListener('click', function () {
        state.prefs.accent = t.id;
        [].forEach.call(el.accents.children, function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        applyTheme(t.id);
      });
      el.accents.appendChild(b);
    });
  }

  function renderDays() {
    el.dayPick.innerHTML = '';
    DAYS.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'daybtn' + (state.prefs.shiftDays.indexOf(d.v) >= 0 ? ' active' : '');
      b.textContent = d.l;
      b.setAttribute('data-day', d.v);
      b.addEventListener('click', function () {
        var i = state.prefs.shiftDays.indexOf(d.v);
        if (i >= 0) state.prefs.shiftDays.splice(i, 1);
        else state.prefs.shiftDays.push(d.v);
        b.classList.toggle('active');
      });
      el.dayPick.appendChild(b);
    });
  }

  function renderConnections() {
    if (state.sample || !state.connections.length) {
      el.connList.innerHTML = '<p class="conn-empty">No platform connected — the board is on sample data. Add one below to load your real metrics.</p>';
      return;
    }
    el.connList.innerHTML = '';
    state.connections.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'conn-row';
      row.innerHTML =
        '<span class="cr-dot"></span>' +
        '<div class="cr-body"><div class="cr-name">' + esc(c.label) + '</div>' +
        '<div class="cr-sub">' + esc(c.provider) + ' · ' + esc(c.id) + '</div></div>' +
        '<span class="cr-test" data-role="test"></span>' +
        '<div class="cr-actions">' +
          '<button class="mini" data-role="testbtn" type="button">Test</button>' +
          '<button class="mini danger" data-role="remove" type="button">Remove</button>' +
        '</div>';
      var testLbl = row.querySelector('[data-role=test]');
      row.querySelector('[data-role=testbtn]').addEventListener('click', function () {
        testLbl.textContent = 'testing…';
        testLbl.className = 'cr-test';
        api('/api/states?c=' + encodeURIComponent(c.id))
          .then(function (r) {
            if (Array.isArray(r)) { testLbl.textContent = '✓ ' + r.length + ' statuses'; testLbl.className = 'cr-test ok'; }
            else { testLbl.textContent = '✕ ' + ((r && r.error) || 'unreachable'); testLbl.className = 'cr-test bad'; }
          })
          .catch(function (e) { testLbl.textContent = '✕ ' + e.message; testLbl.className = 'cr-test bad'; });
      });
      row.querySelector('[data-role=remove]').addEventListener('click', function () {
        if (!window.confirm('Remove "' + c.label + '" and delete its stored token?')) return;
        api('/api/connections?c=' + encodeURIComponent(c.id), { method: 'DELETE' })
          .then(function (r) {
            if (r && r.ok) {
              state.connections = state.connections.filter(function (x) { return x.id !== c.id; });
              renderConnections();
              showBanner('Removed <strong>' + esc(c.label) + '</strong> and its token.', 'ok');
            } else {
              showBanner('Could not remove: ' + esc((r && r.error) || 'unknown error'));
            }
          });
      });
      el.connList.appendChild(row);
    });
  }

  function collect() {
    return {
      name: el.name.value,
      number: el.number.value,
      accent: state.prefs.accent,
      autoSyncMinutes: state.prefs.autoSyncMinutes,
      shiftEnabled: state.prefs.shiftEnabled,
      shiftDays: state.prefs.shiftDays,
      shiftStart: el.shiftStart.value || '09:00',
      shiftEnd: el.shiftEnd.value || '17:00',
    };
  }

  function save() {
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = 'Saving…';
    api('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect()),
    })
      .then(function (res) {
        if (res && res.ok) {
          showBanner('Saved ✓ — <a href="index.html">open the board</a> to see your changes.', 'ok');
        } else {
          showBanner('Could not save: ' + esc((res && res.error) || 'unknown error'));
        }
      })
      .catch(function (e) { showBanner('Could not save: ' + esc(e.message)); })
      .finally(function () {
        el.saveBtn.disabled = false;
        el.saveBtn.textContent = 'Save';
      });
  }

  function load() {
    Promise.all([api('/api/preferences'), api('/api/connections')])
      .then(function (r) {
        var p = r[0] || {};
        var conn = r[1] || {};
        state.prefs = {
          name: p.name || '', number: p.number || '22',
          accent: ACCENTS.indexOf(p.accent) >= 0 ? p.accent : 'pitwall',
          autoSyncMinutes: Number(p.autoSyncMinutes) || 0,
          shiftEnabled: !!p.shiftEnabled,
          shiftDays: Array.isArray(p.shiftDays) ? p.shiftDays.slice() : [1, 2, 3, 4, 5],
          shiftStart: p.shiftStart || '09:00', shiftEnd: p.shiftEnd || '17:00',
        };
        state.connections = Array.isArray(conn.connections) ? conn.connections : [];
        state.sample = !!conn.sample;

        el.name.value = state.prefs.name;
        el.number.value = state.prefs.number;
        el.shiftStart.value = state.prefs.shiftStart;
        el.shiftEnd.value = state.prefs.shiftEnd;
        selectSeg(el.syncSeg, 'min', state.prefs.autoSyncMinutes);
        selectSeg(el.shiftSeg, 'on', state.prefs.shiftEnabled ? 1 : 0);
        renderAccents();
        renderDays();
        renderConnections();
        applyTheme(state.prefs.accent);
      })
      .catch(function (e) { showBanner('Failed to load preferences: ' + esc(e.message)); });
  }

  el.syncSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.prefs.autoSyncMinutes = Number(b.getAttribute('data-min'));
    selectSeg(el.syncSeg, 'min', state.prefs.autoSyncMinutes);
  });
  el.shiftSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.prefs.shiftEnabled = b.getAttribute('data-on') === '1';
    selectSeg(el.shiftSeg, 'on', state.prefs.shiftEnabled ? 1 : 0);
  });
  el.saveBtn.addEventListener('click', save);
  load();
})();
