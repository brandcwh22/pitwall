/* Pit Wall frontend — vanilla, no build step.
 * Fetches a normalized snapshot from the server and renders the Timing Tower
 * and Telemetry Feed. Provider-agnostic: it only knows the snapshot shape. */
(function () {
  'use strict';

  var state = { window: 'week', snapshot: null, selected: null, sample: false, conn: null };

  var el = {
    driver: document.getElementById('driver'),
    stamp: document.getElementById('stamp'),
    banner: document.getElementById('banner'),
    tower: document.getElementById('tower'),
    feed: document.getElementById('feed'),
    feedTitle: document.getElementById('feedTitle'),
    syncBtn: document.getElementById('syncBtn'),
    windowSeg: document.getElementById('windowSeg'),
    footMode: document.getElementById('footMode'),
    connSel: document.getElementById('connSel'),
    configureLink: document.getElementById('configureLink'),
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  function render() {
    var s = state.snapshot;
    if (!s) return;

    el.driver.textContent = s.viewer ? s.viewer.name + ' · ' + s.viewer.handle : '';
    el.stamp.textContent = 'Snapshot ' + timeAgo(s.generatedAt);
    el.footMode.textContent = state.sample
      ? 'Sample data — add a connection in config.json to go live'
      : (s.connection ? s.connection.label + ' · ' + s.connection.provider : '');
    el.banner.hidden = !state.sample;
    if (state.sample) {
      el.banner.innerHTML =
        '👋 <strong>Welcome to Pit Wall.</strong> This is sample data — ' +
        '<a href="onboard.html">connect your platform</a> to see your real QA metrics.';
    }

    // Timing tower
    el.tower.innerHTML = '';
    (s.metrics || []).forEach(function (m, i) {
      var li = document.createElement('li');
      li.className = 'tower-row' + (state.selected === m.key ? ' active' : '');
      li.innerHTML =
        '<span class="tower-pos">' + (i + 1) + '</span>' +
        '<span class="tower-label"><span class="chip bg-' + esc(m.color) + '"></span>' + esc(m.label) + '</span>' +
        '<span class="tower-value c-' + esc(m.color) + '">' + m.value + '</span>';
      li.addEventListener('click', function () {
        state.selected = m.key;
        render();
      });
      el.tower.appendChild(li);
    });

    // Feed — default to the first metric with stories
    var sel = (s.metrics || []).find(function (m) { return m.key === state.selected; });
    if (!sel) sel = (s.metrics || []).find(function (m) { return m.stories && m.stories.length; }) || s.metrics[0];
    state.selected = sel ? sel.key : null;

    el.feedTitle.textContent = sel ? sel.label : 'Telemetry Feed';
    el.feed.innerHTML = '';
    var stories = (sel && sel.stories) || [];
    if (!stories.length) {
      el.feed.innerHTML = '<li class="feed-empty">No stories in this metric.</li>';
    } else {
      stories.forEach(function (st) {
        var li = document.createElement('li');
        li.className = 'feed-item';
        var href = st.url && st.url !== '#' ? ' href="' + esc(st.url) + '" target="_blank" rel="noopener"' : '';
        li.innerHTML =
          '<a' + href + '>' + esc(st.title) + '</a>' +
          '<span class="feed-state">' + esc(st.state) + ' · ' + timeAgo(st.updatedAt) + '</span>';
        el.feed.appendChild(li);
      });
    }
  }

  function snapshotUrl() {
    var u = '/api/snapshot?window=' + encodeURIComponent(state.window);
    if (state.conn) u += '&c=' + encodeURIComponent(state.conn);
    return u;
  }

  // Populate the connection switcher; hidden unless there are real connections.
  function loadConnections() {
    return fetch('/api/connections')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var conns = (data && data.connections) || [];
        if (data && data.sample) return; // sample mode: no switcher
        if (!conns.length) return;
        var saved = localStorage.getItem('pitwall_conn');
        state.conn = conns.some(function (c) { return c.id === saved; }) ? saved : conns[0].id;
        el.connSel.innerHTML = conns.map(function (c) {
          return '<option value="' + esc(c.id) + '"' + (c.id === state.conn ? ' selected' : '') + '>' +
            esc(c.label) + '</option>';
        }).join('') + '<option value="__add">＋ Add platform…</option>';
        el.connSel.hidden = conns.length < 1;
        el.configureLink.href = 'settings.html?c=' + encodeURIComponent(state.conn);
      })
      .catch(function () { /* switcher is optional */ });
  }

  function load() {
    el.syncBtn.disabled = true;
    el.syncBtn.textContent = '↻ Syncing…';
    fetch(snapshotUrl())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok === false) throw new Error(data.error || 'Snapshot failed');
        state.snapshot = data;
        state.sample = data.connection && data.connection.provider === 'sample';
        render();
      })
      .catch(function (err) {
        el.banner.hidden = false;
        el.banner.innerHTML = 'Sync failed: ' + esc(err.message);
      })
      .finally(function () {
        el.syncBtn.disabled = false;
        el.syncBtn.textContent = '↻ Sync';
      });
  }

  el.windowSeg.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-window]');
    if (!btn) return;
    state.window = btn.getAttribute('data-window');
    state.selected = null;
    [].forEach.call(el.windowSeg.children, function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    load();
  });

  el.syncBtn.addEventListener('click', load);

  el.connSel.addEventListener('change', function () {
    if (el.connSel.value === '__add') { window.location.href = 'onboard.html'; return; }
    state.conn = el.connSel.value;
    localStorage.setItem('pitwall_conn', state.conn);
    el.configureLink.href = 'settings.html?c=' + encodeURIComponent(state.conn);
    state.selected = null;
    load();
  });

  loadConnections().then(load);
})();
