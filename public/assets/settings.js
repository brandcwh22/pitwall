/* Pit Wall — tile settings picker. Vanilla JS, no build step.
 * Reads the connected platform's statuses (/api/states) and the current tiles
 * (/api/settings), lets you build/group tiles, and saves them back. */
(function () {
  'use strict';

  var COLORS = ['purple', 'silver', 'red', 'green', 'yellow', 'cyan', 'teal'];
  var CATS = [
    { key: 'qa', label: 'QA' },
    { key: 'started', label: 'In progress' },
    { key: 'done', label: 'Done' },
    { key: 'unstarted', label: 'To do' },
  ];

  var params = new URLSearchParams(location.search);
  var connParam = params.get('c');
  var isFirstRun = params.get('first') === '1';
  var qs = connParam ? '?c=' + encodeURIComponent(connParam) : '';

  var state = { tiles: [], statuses: [], sample: false };
  var el = {
    tiles: document.getElementById('tiles'),
    banner: document.getElementById('banner'),
    saveBtn: document.getElementById('saveBtn'),
    addBtn: document.getElementById('addBtn'),
    statusKey: document.getElementById('statusKey'),
    tpl: document.getElementById('tileTpl'),
  };

  function api(path, opts) {
    return fetch(path, opts).then(function (r) { return r.json(); });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function catOf(name) {
    var s = state.statuses.find(function (x) { return x.name === name; });
    return s ? s.category : 'unstarted';
  }
  function newKey() {
    return 'tile-' + Math.random().toString(36).slice(2, 8);
  }

  function showBanner(html, kind) {
    el.banner.hidden = false;
    el.banner.className = 'banner' + (kind ? ' ' + kind : '');
    el.banner.innerHTML = html;
  }

  function renderKey() {
    el.statusKey.innerHTML = CATS.map(function (c) {
      var n = state.statuses.filter(function (s) { return s.category === c.key; }).length;
      return '<span class="k"><span class="dot cat-' + c.key + '"></span>' + c.label + ' (' + n + ')</span>';
    }).join('');
  }

  function renderAll() {
    el.tiles.innerHTML = '';
    state.tiles.forEach(function (tile) { el.tiles.appendChild(buildCard(tile)); });
  }

  function buildCard(tile) {
    var node = el.tpl.content.firstElementChild.cloneNode(true);
    var q = function (sel) { return node.querySelector(sel); };

    // Label
    var label = q('.tile-label');
    label.value = tile.label || '';
    label.addEventListener('input', function () { tile.label = label.value; });

    // Colour swatches + the accent bar
    var drag = q('.drag');
    var swatches = q('.swatches');
    function paintColour() { drag.style.background = 'var(--' + tile.color + ')'; }
    COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (tile.color === c ? ' active' : '');
      b.style.background = 'var(--' + c + ')';
      b.title = c;
      b.addEventListener('click', function () {
        tile.color = c;
        [].forEach.call(swatches.children, function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        paintColour();
      });
      swatches.appendChild(b);
    });
    paintColour();

    // Segmented toggles: scope / role / bound
    wireSeg(q('.scope'), 'scope', tile, ['me', 'team']);
    wireSeg(q('.role'), 'role', tile, ['owner', 'requester']);
    wireSeg(q('.bound'), 'bound', tile, ['none', 'updated', 'created']);

    // Statuses
    renderChips(node, tile);
    fillStatusSelect(node, tile);

    // Type / text
    var type = q('.tile-type');
    type.value = tile.type || '';
    type.addEventListener('input', function () { tile.type = type.value.trim() || undefined; });
    var text = q('.tile-text');
    text.value = tile.text || '';
    text.addEventListener('input', function () { tile.text = text.value.trim() || undefined; });

    // Delete
    q('.del').addEventListener('click', function () {
      state.tiles = state.tiles.filter(function (t) { return t !== tile; });
      renderAll();
    });

    return node;
  }

  function wireSeg(seg, prop, tile, values) {
    var buttons = seg.querySelectorAll('button');
    [].forEach.call(buttons, function (b) {
      var v = b.getAttribute('data-' + prop);
      if ((tile[prop] || values[0]) === v) b.classList.add('active');
      b.addEventListener('click', function () {
        tile[prop] = v;
        [].forEach.call(buttons, function (x) { x.classList.remove('active'); });
        b.classList.add('active');
      });
    });
  }

  function renderChips(node, tile) {
    var chips = node.querySelector('.chips');
    var list = tile.states || [];
    if (!list.length) {
      chips.innerHTML = '<span class="chip-none">no statuses — add one, or use type/text below →</span>';
      return;
    }
    chips.innerHTML = '';
    list.forEach(function (name) {
      var tag = document.createElement('span');
      tag.className = 'chip-tag';
      tag.innerHTML = '<span class="dot cat-' + catOf(name) + '"></span>' + esc(name) + ' <button title="remove">✕</button>';
      tag.querySelector('button').addEventListener('click', function () {
        tile.states = tile.states.filter(function (s) { return s !== name; });
        renderChips(node, tile);
        fillStatusSelect(node, tile);
      });
      chips.appendChild(tag);
    });
  }

  function fillStatusSelect(node, tile) {
    var sel = node.querySelector('.add-status');
    var used = new Set(tile.states || []);
    sel.innerHTML = '<option value="">＋ add status…</option>';
    CATS.forEach(function (c) {
      var opts = state.statuses.filter(function (s) { return s.category === c.key && !used.has(s.name); });
      if (!opts.length) return;
      var g = document.createElement('optgroup');
      g.label = c.label;
      opts.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.name;
        o.textContent = s.name;
        g.appendChild(o);
      });
      sel.appendChild(g);
    });
    sel.onchange = function () {
      if (!sel.value) return;
      tile.states = (tile.states || []).concat(sel.value);
      renderChips(node, tile);
      fillStatusSelect(node, tile);
    };
  }

  function addTile() {
    state.tiles.push({
      key: newKey(), label: 'New tile', color: 'silver',
      scope: 'me', role: 'owner', states: [], bound: 'none',
    });
    renderAll();
    el.tiles.lastElementChild.querySelector('.tile-label').focus();
  }

  function save() {
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = 'Saving…';
    api('/api/settings' + qs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiles: state.tiles, scopeDefault: 'me' }),
    })
      .then(function (res) {
        if (res && res.ok) {
          if (isFirstRun) { window.location.href = 'index.html'; return; }
          showBanner('Saved ✓ — <a href="index.html">back to the board</a> to see your tiles.', 'ok');
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
    Promise.all([api('/api/settings' + qs), api('/api/states' + qs), api('/api/health')])
      .then(function (r) {
        var settings = r[0], statuses = r[1], health = r[2];
        state.statuses = Array.isArray(statuses) ? statuses : [];
        state.sample = !!(health && health.sample);
        state.tiles = (settings.tiles || []).map(function (t) {
          return {
            key: t.key || newKey(), label: t.label, color: t.color || 'silver',
            scope: t.scope || 'me', role: t.role || 'owner',
            states: Array.isArray(t.states) ? t.states.slice() : [],
            type: t.type, text: t.text, bound: t.bound || 'none',
          };
        });
        renderKey();
        renderAll();
        if (state.sample) {
          el.saveBtn.disabled = true;
          showBanner('<strong>Sample mode.</strong> These are demo statuses. <a href="onboard.html">Connect a platform</a> to load your real workflow and save tiles.');
        } else if (isFirstRun) {
          showBanner("<strong>You're connected! 🏁</strong> These are your real statuses, pre-grouped into starter tiles. Tweak them, then <strong>Save</strong> to open your board.", 'ok');
        }
      })
      .catch(function (e) { showBanner('Failed to load: ' + esc(e.message)); });
  }

  el.addBtn.addEventListener('click', addTile);
  el.saveBtn.addEventListener('click', save);
  load();
})();
