/* Pit Wall — onboarding flow. Choose a platform, enter + test credentials,
 * save the connection, then hand off to the tile picker. Vanilla JS. */
(function () {
  'use strict';

  var state = { providers: [], provider: null, tested: false };
  var el = {
    banner: document.getElementById('banner'),
    grid: document.getElementById('providerGrid'),
    stepProvider: document.getElementById('stepProvider'),
    stepConnect: document.getElementById('stepConnect'),
    steps: document.getElementById('steps'),
    connectTitle: document.getElementById('connectTitle'),
    connectHelp: document.getElementById('connectHelp'),
    form: document.getElementById('credForm'),
    testBtn: document.getElementById('testBtn'),
    connectBtn: document.getElementById('connectBtn'),
    testResult: document.getElementById('testResult'),
    backBtn: document.getElementById('backBtn'),
  };

  function api(path, opts) { return fetch(path, opts).then(function (r) { return r.json(); }); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function markStep(n) {
    [].forEach.call(el.steps.children, function (li) {
      var s = Number(li.getAttribute('data-step'));
      li.classList.toggle('active', s === n);
      li.classList.toggle('done', s < n);
    });
  }

  function renderProviders() {
    if (!state.providers.length) {
      el.grid.innerHTML = '<p class="muted">No providers are enabled. See <code>src/providers/index.js</code>.</p>';
      return;
    }
    // Official brand colours (Simple Icons); fallback palette for future adapters.
    var BRAND = { shortcut: '#58B1E4', jira: '#0052CC', linear: '#5E6AD2', github: '#8b949e' };
    var FALLBACK = ['#c41f1a', '#1fb597', '#9a55d9', '#e08a2c'];
    var HAS_ICON = { shortcut: 1, jira: 1 };
    el.grid.innerHTML = '';
    state.providers.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'provider-card';
      b.style.setProperty('--livery', BRAND[p.id] || FALLBACK[i % FALLBACK.length]);
      b.style.animationDelay = (0.06 * i + 0.05) + 's';
      var icon = HAS_ICON[p.id]
        ? '<span class="pc-icon" style="-webkit-mask-image:url(logos/' + p.id + '.svg);mask-image:url(logos/' + p.id + '.svg)"></span>'
        : '';
      b.innerHTML =
        '<span class="pc-pos">' + String(i + 1).padStart(2, '0') + '</span>' +
        icon +
        '<span class="pc-body"><span class="name">' + esc(p.label) + '</span>' +
        '<span class="hint">Connect with an API token</span></span>' +
        '<span class="pc-go">Select <em>→</em></span>';
      b.addEventListener('click', function () { chooseProvider(p); });
      el.grid.appendChild(b);
    });
  }

  function chooseProvider(p) {
    state.provider = p;
    state.tested = false;
    el.connectBtn.disabled = true;
    el.testResult.textContent = '';
    el.testResult.className = 'test-result';
    el.connectTitle.textContent = 'Connect ' + p.label;
    el.connectHelp.innerHTML = 'Enter your ' + esc(p.label) + ' credentials. ' +
      (p.docsUrl ? 'Get a token from <a href="' + esc(p.docsUrl) + '" target="_blank" rel="noopener">here</a>.' : '');

    el.form.innerHTML = '';
    p.fields.forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.innerHTML =
        '<label for="f_' + f.name + '">' + esc(f.label) +
        (f.required ? ' <span class="req">*</span>' : '') + '</label>' +
        '<input id="f_' + f.name + '" name="' + f.name + '" type="' + (f.type || 'text') + '" ' +
        (f.required ? 'required' : '') + ' autocomplete="off" spellcheck="false" />' +
        (f.help ? '<span class="help">' + f.help + '</span>' : '');
      el.form.appendChild(wrap);
    });
    // Any edit invalidates a prior successful test.
    el.form.addEventListener('input', function () {
      state.tested = false;
      el.connectBtn.disabled = true;
    });

    el.stepProvider.hidden = true;
    el.stepConnect.hidden = false;
    markStep(2);
  }

  function collectValues() {
    var values = {};
    [].forEach.call(el.form.querySelectorAll('input'), function (i) {
      values[i.name] = i.value.trim();
    });
    return values;
  }

  function test() {
    el.testBtn.disabled = true;
    el.testResult.className = 'test-result';
    el.testResult.textContent = 'Testing…';
    api('/api/connections/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: state.provider.id, values: collectValues() }),
    })
      .then(function (res) {
        if (res.ok) {
          state.tested = true;
          el.connectBtn.disabled = false;
          el.testResult.className = 'test-result ok';
          el.testResult.textContent = '✓ Connected as ' + res.viewer.name + ' (' + res.viewer.handle + ')';
        } else {
          el.testResult.className = 'test-result err';
          el.testResult.textContent = '✗ ' + res.error;
        }
      })
      .catch(function (e) {
        el.testResult.className = 'test-result err';
        el.testResult.textContent = '✗ ' + e.message;
      })
      .finally(function () { el.testBtn.disabled = false; });
  }

  function connect() {
    el.connectBtn.disabled = true;
    el.connectBtn.textContent = 'Connecting…';
    api('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: state.provider.id,
        label: state.provider.label,
        values: collectValues(),
      }),
    })
      .then(function (res) {
        if (res.ok) {
          markStep(3);
          // Hand off to the tile picker for the new connection.
          window.location.href = 'settings.html?c=' + encodeURIComponent(res.connection.id) + '&first=1';
        } else {
          el.testResult.className = 'test-result err';
          el.testResult.textContent = '✗ ' + res.error;
          el.connectBtn.disabled = false;
          el.connectBtn.textContent = 'Connect & continue →';
        }
      })
      .catch(function (e) {
        el.testResult.className = 'test-result err';
        el.testResult.textContent = '✗ ' + e.message;
        el.connectBtn.disabled = false;
        el.connectBtn.textContent = 'Connect & continue →';
      });
  }

  function back() {
    el.stepConnect.hidden = true;
    el.stepProvider.hidden = false;
    markStep(1);
  }

  el.testBtn.addEventListener('click', test);
  el.connectBtn.addEventListener('click', connect);
  el.backBtn.addEventListener('click', back);

  // Load providers; if the user already has a connection, note it.
  Promise.all([api('/api/providers'), api('/api/connections')])
    .then(function (r) {
      state.providers = Array.isArray(r[0]) ? r[0] : [];
      renderProviders();
      if (r[1] && r[1].connections && r[1].connections.length) {
        el.banner.hidden = false;
        el.banner.innerHTML = 'You already have a connection (<strong>' +
          esc(r[1].connections[0].label) + '</strong>). Add another below, or ' +
          '<a href="index.html">go to your board</a>.';
      }
    })
    .catch(function (e) {
      el.banner.hidden = false;
      el.banner.textContent = 'Failed to load providers: ' + e.message;
    });
})();
