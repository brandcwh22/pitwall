/* Pit Wall frontend — vanilla, no build step.
 * Fetches a normalized snapshot from the server and renders the Timing Tower
 * and Telemetry Feed. Provider-agnostic: it only knows the snapshot shape. */
(function () {
  'use strict';

  var state = { window: 'week', snapshot: null, selected: null, sample: false };

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
        'Showing <strong>sample data</strong>. Copy <code>config.example.json</code> to ' +
        '<code>config.json</code>, set your token env var, and restart to see live QA metrics.';
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

  function load() {
    el.syncBtn.disabled = true;
    el.syncBtn.textContent = '↻ Syncing…';
    fetch('/api/snapshot?window=' + encodeURIComponent(state.window))
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

  load();
})();
