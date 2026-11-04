(function () {
  var Lib = window.RemodelLib;
  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDJ6p8LxMFhFn31SEyF_NeqyVetxlv3gb0',
    authDomain: 'boyle-family-hub-2533b.firebaseapp.com',
    databaseURL: 'https://boyle-family-hub-2533b-default-rtdb.firebaseio.com',
    projectId: 'boyle-family-hub-2533b',
    storageBucket: 'boyle-family-hub-2533b.firebasestorage.app',
    messagingSenderId: '603208983666',
    appId: '1:603208983666:web:7573f19352c8466d6d0eeb'
  };
  var FLOORS = ['Main', 'Upper', 'Lower', 'Outside'];
  var STATUSES = [
    ['idea', 'Idea'], ['planning', 'Planning'], ['bidding', 'Getting bids'],
    ['active', 'In progress'], ['punch', 'Punch list'], ['done', 'Done']
  ];
  var WHO = [['diy', 'DIY'], ['hire', 'Hire'], ['later', 'Later'], ['skip', 'Skip']];
  var moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var hourFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  var state = { data: null, preview: false, view: 'overview', roomId: null, ready: false };
  var silence = 0;
  var stale = false;
  var listening = false;
  var seedStarted = false;
  var dbRef = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function money(n) { return moneyFmt.format(Math.round(Number(n) || 0)); }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function uid(prefix) { return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function data() { return state.data; }
  function house() { return (data() && data().house) || {}; }
  function mapOf(key) { return (data() && data()[key]) || {}; }
  function isTyping() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }
  function toast(msg, isError) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2800);
  }
  function syncLabel(text, kind) {
    var dot = document.getElementById('sync-dot');
    var label = document.getElementById('sync-text');
    if (!dot) return;
    dot.className = 'sync-dot' + (kind ? ' ' + kind : '');
    label.textContent = text;
  }
  function authMsg(text, isError) {
    var el = document.getElementById('auth-msg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--accent2)' : 'var(--text3)';
  }
  function authError(e) {
    var code = e && e.code || '';
    var known = {
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/wrong-password': 'Wrong password.',
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
      'auth/network-request-failed': 'Network error. Check the connection.',
      'auth/operation-not-allowed': 'Email and password sign-in is not enabled in Firebase yet.',
      'permission-denied': 'Signed in, but the database blocked access. Publish database.rules.json.'
    };
    return known[code] || (e && e.message) || 'Something went wrong.';
  }

  function showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
  function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
  }

  function savePath(path, value) {
    if (state.preview || !dbRef) return;
    silence++;
    var ref = dbRef.child(path);
    var op = value == null ? ref.remove() : ref.set(value);
    op.then(function () { syncLabel('Saved', ''); }).catch(function (err) {
      toast(authError(err), true);
      syncLabel('Not saved', 'error');
    }).finally(function () {
      setTimeout(function () {
        silence = Math.max(0, silence - 1);
        if (silence === 0 && stale && !isTyping()) { stale = false; render(true); }
      }, 200);
    });
  }

  function applyRemote(val) {
    state.data = val;
    if (silence > 0 || isTyping()) { stale = true; return; }
    stale = false;
    render(true);
  }

  function listen() {
    if (listening || !dbRef) return;
    listening = true;
    syncLabel('Connecting…', 'syncing');
    dbRef.on('value', function (snap) {
      if (!snap.exists()) {
        if (!seedStarted) {
          seedStarted = true;
          dbRef.transaction(function (cur) { return cur ? undefined : Lib.seed(); }).catch(function () { seedStarted = false; });
        }
        return;
      }
      syncLabel('Live', '');
      applyRemote(snap.val());
    }, function () {
      syncLabel('Offline', 'error');
      toast('The database did not connect.', true);
    });
  }

  function people() {
    return (house().people || ['Justin', '']).map(function (n) { return String(n || '').trim(); }).filter(Boolean);
  }
  function rooms() {
    return Object.keys(mapOf('rooms')).map(function (id) { return mapOf('rooms')[id]; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function roomById(id) { return mapOf('rooms')[id]; }
  function itemsFor(roomId) {
    return Object.keys(mapOf('items')).map(function (id) { return mapOf('items')[id]; })
      .filter(function (item) { return item.roomId === roomId; });
  }
  function phaseName(id) {
    var p = mapOf('phases')[id];
    return p ? p.name : 'Unscheduled';
  }
  function statusLabel(v) {
    var hit = STATUSES.filter(function (s) { return s[0] === v; })[0];
    return hit ? hit[1] : 'Idea';
  }
  function livingSqft() {
    return rooms().reduce(function (sum, room) {
      return sum + (room.counts === false ? 0 : (Number(room.sqft) || 0));
    }, 0);
  }
  function totals() { return Lib.rollup(data() || { house: {}, items: {}, expenses: {} }); }

  function gapSentence(t) {
    var gap = t.hire - t.plan;
    if (Math.round(gap) === 0) return 'The plan matches hiring every line.';
    var direction = gap > 0 ? 'under' : 'over';
    var text = 'The plan is ' + money(Math.abs(gap)) + ' ' + direction + ' hiring every line';
    if (t.hours > 0) text += ', about ' + money(Math.abs(gap) / t.hours) + ' per hour across ' + hourFmt.format(t.hours) + ' hours';
    return text + '.';
  }

  function field(label, inner) {
    return '<label class="field"><span>' + label + '</span>' + inner + '</label>';
  }
  function opts(list, selected) {
    return list.map(function (pair) {
      var value = pair[0], label = pair[1];
      return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  function render(keepScroll) {
    if (!data()) return;
    if (state.view === 'phases') state.view = 'plan';
    var y = keepScroll ? window.scrollY : 0;
    var view = state.roomId ? renderRoom(state.roomId) : ({
      overview: renderOverview,
      rooms: renderRooms,
      budget: renderBudget,
      phases: renderPhases,
      plan: renderPhases,
      calendar: renderCalendar,
      ideas: renderIdeas,
      bids: renderBids,
      selections: renderSelections,
      decisions: renderDecisions,
      punch: renderPunch,
      expenses: renderExpenses,
      settings: renderSettings
    }[state.view] || renderOverview)();
    document.getElementById('view').innerHTML = view;
    refreshPins();
    document.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-nav') === (state.roomId ? 'rooms' : state.view));
    });
    var sub = document.getElementById('brand-sub');
    if (sub) sub.textContent = house().address ? '25 Basildon' : 'Remodel';
    if (keepScroll) window.scrollTo(0, y);
  }

  function pageHead(title, lede, actions) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' +
      (lede ? '<p class="lede">' + esc(lede) + '</p>' : '') +
      '</div><div class="page-actions">' + (actions || '') + '</div></div>';
  }

  function stat(label, value) {
    return '<div class="stat"><span>' + esc(label) + '</span><strong>' + value + '</strong></div>';
  }

  function renderOverview() {
    var t = totals();
    var h = house();
    var left = t.withCont - t.spentAll;
    var done = rooms().filter(function (r) { return r.status === 'done'; }).length;
    var all = rooms().length || 1;
    var groups = FLOORS.map(function (floor) {
      var list = rooms().filter(function (r) { return r.floor === floor; });
      if (!list.length) return '';
      return '<section class="block"><h2>' + esc(floor) + '</h2><div class="room-grid">' +
        list.map(roomCard).join('') + '</div></section>';
    }).join('');
    return pageHead(h.name || 'Remodel', h.address || '') +
      '<div class="stat-row">' +
        stat('Estimated plan', money(t.plan)) +
        stat('With ' + (h.contingency || 0) + '% contingency', money(t.withCont)) +
        stat('Spent', money(t.spentAll)) +
        stat('Left in the plan', money(left)) +
      '</div>' +
      '<p class="gap">' + esc(gapSentence(t)) + ' Hiring every line would be ' + money(t.hire) +
      '. Materials if every line is DIY would be ' + money(t.diy) + '.</p>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + all + '" aria-valuenow="' + done + '" aria-label="Rooms marked done">' +
        '<span style="width:' + Math.round(done / all * 100) + '%"></span></div>' +
      '<p class="meta">' + done + ' of ' + rooms().length + ' rooms marked done. Living area in the starter rooms is ' +
        livingSqft().toLocaleString('en-US') + ' sq ft. Zillow lists ' + Number(h.sqft || 0).toLocaleString('en-US') + '.</p>' +
      comingUp() +
      '<article class="note"><p>' + esc(h.note || '') + '</p></article>' +
      groups;
  }

  function roomCard(room) {
    var t = totals();
    var roll = t.byRoom[room.id] || { plan: 0, count: 0 };
    var spent = t.spent[room.id] || 0;
    var size = Number(room.sqft) || 0;
    var sizeText = room.counts === false
      ? (size ? size.toLocaleString('en-US') + ' sq ft, outside the living area' : 'Outside the living area')
      : size.toLocaleString('en-US') + ' sq ft';
    return '<button type="button" class="room-card" data-act="open-room" data-id="' + esc(room.id) + '">' +
      '<span class="room-top"><strong>' + esc(room.name) + '</strong><em>' + esc(statusLabel(room.status)) + '</em></span>' +
      '<span class="room-sub">' + sizeText + ' · ' + esc(phaseName(room.phaseId)) + '</span>' +
      '<span class="room-cost">' + (roll.count ? money(roll.plan) : 'No scope yet') +
      (spent ? ' · spent ' + money(spent) : '') + '</span></button>';
  }

  function renderRooms() {
    return pageHead('Rooms', 'Open a room to price the work, or add one that Zillow did not name.',
      '<button type="button" class="btn btn-primary" data-act="add-room">Add room</button>') +
      FLOORS.map(function (floor) {
        var list = rooms().filter(function (r) { return r.floor === floor; });
        if (!list.length) return '';
        return '<section class="block"><h2>' + esc(floor) + '</h2><div class="room-grid">' + list.map(roomCard).join('') + '</div></section>';
      }).join('');
  }

  function renderRoom(id) {
    var room = roomById(id);
    if (!room) return pageHead('Room', '') + '<p>That room is no longer in the plan.</p>';
    var lines = itemsFor(id);
    var t = totals();
    var roll = t.byRoom[id] || { plan: 0, hire: 0, diy: 0, hours: 0 };
    var spent = t.spent[id] || 0;
    var cats = [];
    lines.forEach(function (item) { if (cats.indexOf(item.cat || 'Other') < 0) cats.push(item.cat || 'Other'); });
    var body = cats.map(function (cat) {
      return '<h2>' + esc(cat) + '</h2>' + lines.filter(function (item) { return (item.cat || 'Other') === cat; }).map(lineRow).join('');
    }).join('');
    if (!lines.length) body = '<p class="empty">No scope yet. Add a typical set, or add one line.</p>';
    return '<button type="button" class="text-btn" data-act="close-room">All rooms</button>' +
      pageHead(room.name, (room.counts === false ? 'Not counted in the living area' : Number(room.sqft || 0).toLocaleString('en-US') + ' sq ft') +
        ' · ' + room.floor + ' · ' + phaseName(room.phaseId),
        '<button type="button" class="btn btn-ghost" data-act="edit-room" data-id="' + esc(id) + '">Edit room</button>' +
        '<button type="button" class="btn btn-primary" data-act="apply-template" data-id="' + esc(id) + '">Add typical scope</button>') +
      '<div class="stat-row">' +
        stat('This room', money(roll.plan)) +
        stat('If hired', money(roll.hire)) +
        stat('DIY materials', money(roll.diy)) +
        stat('Spent', money(spent)) +
      '</div>' +
      (roll.hours ? '<p class="meta">' + hourFmt.format(roll.hours) + ' hours on the DIY lines.</p>' : '') +
      '<div class="scope">' + body + '</div>' +
      '<form class="add-bar" data-act="add-line" data-id="' + esc(id) + '">' +
        '<input name="name" required placeholder="Custom line, such as pot filler" maxlength="80">' +
        '<button class="btn btn-primary" type="submit">Add line</button></form>' +
      field('Room notes', '<textarea data-act="room-notes" data-id="' + esc(id) + '" rows="3">' + esc(room.notes || '') + '</textarea>') +
      '<h2>Pinterest ideas</h2>' + ideaForm(id) + ideaGrid(ideasFor(id));
  }

  function lineRow(item) {
    var c = Lib.cost(item, house());
    var who = item.who || 'later';
    var buttons = WHO.map(function (pair) {
      return '<button type="button" data-act="item-who" data-id="' + esc(item.id) + '" data-who="' + pair[0] + '" aria-pressed="' + (who === pair[0]) + '">' + pair[1] + '</button>';
    }).join('');
    return '<article class="line">' +
      '<div><h3>' + esc(item.name) + '</h3><p>' + esc(formatQty(item)) + (item.notes ? ' · ' + esc(item.notes) : '') + '</p></div>' +
      '<div class="who" role="group" aria-label="Who does ' + esc(item.name) + '">' + buttons + '</div>' +
      '<div class="prices"><p><span>DIY</span><strong>' + money(c.diy) + '</strong></p><p><span>Hire</span><strong>' + money(c.hire) + '</strong></p></div>' +
      '<div class="line-edit">' +
        '<label>Qty <input data-act="item-field" data-id="' + esc(item.id) + '" data-field="qty" type="number" min="0" step="any" value="' + esc(item.qty) + '"></label>' +
        '<label>$ / unit <input data-act="item-field" data-id="' + esc(item.id) + '" data-field="mat" type="number" min="0" step="0.01" value="' + esc(item.mat) + '"></label>' +
        '<button type="button" class="text-btn danger" data-act="delete-item" data-id="' + esc(item.id) + '">Delete</button>' +
      '</div></article>';
  }
  function formatQty(item) {
    var qty = Number(item.qty) || 0;
    var text = (Math.round(qty * 10) / 10) + ' ' + (item.unit || '');
    if (item.waste) text += ' · ' + Math.round(item.waste * 100) + '% waste';
    return text;
  }

  function renderBudget() {
    var t = totals();
    var rows = rooms().slice().sort(function (a, b) {
      return ((t.byRoom[b.id] || {}).plan || 0) - ((t.byRoom[a.id] || {}).plan || 0);
    });
    var cats = Object.keys(t.byCat).sort(function (a, b) { return t.byCat[b].plan - t.byCat[a].plan; });
    return pageHead('Budget', 'Later is budgeted at the hire price, so an open choice does not shrink the plan.') +
      '<div class="stat-row">' + stat('Plan', money(t.plan)) + stat('Contingency', money(t.contingency)) + stat('Spent', money(t.spentAll)) + '</div>' +
      '<h2>By room</h2><div class="table-wrap"><table><thead><tr><th>Room</th><th>Plan</th><th>Spent</th><th>Left</th></tr></thead><tbody>' +
      rows.map(function (room) {
        var plan = (t.byRoom[room.id] || {}).plan || 0;
        var spent = t.spent[room.id] || 0;
        if (!plan && !spent) return '';
        return '<tr><td><button type="button" class="text-btn" data-act="open-room" data-id="' + esc(room.id) + '">' + esc(room.name) + '</button></td><td>' +
          money(plan) + '</td><td>' + money(spent) + '</td><td>' + money(plan - spent) + '</td></tr>';
      }).join('') +
      '<tr><td>Contingency</td><td>' + money(t.contingency) + '</td><td></td><td></td></tr></tbody></table></div>' +
      '<h2>By trade group</h2><div class="table-wrap"><table><thead><tr><th>Group</th><th>Plan</th><th>If hired</th></tr></thead><tbody>' +
      cats.map(function (cat) {
        return '<tr><td>' + esc(cat) + '</td><td>' + money(t.byCat[cat].plan) + '</td><td>' + money(t.byCat[cat].hire) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function phaseList() {
    return Object.keys(mapOf('phases')).map(function (id) { return mapOf('phases')[id]; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function listSchedule() {
    return Object.keys(mapOf('schedule')).map(function (id) { return mapOf('schedule')[id]; })
      .sort(function (a, b) { return String(a.start || '9999').localeCompare(String(b.start || '9999')) || String(a.title || '').localeCompare(String(b.title || '')); });
  }
  function roomOptions(selected, blank) {
    return '<option value="">' + esc(blank) + '</option>' + rooms().map(function (r) {
      return '<option value="' + esc(r.id) + '"' + (r.id === selected ? ' selected' : '') + '>' + esc(r.name) + '</option>';
    }).join('');
  }
  function phaseOptions(selected) {
    return '<option value="">No phase</option>' + phaseList().map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  }
  function pinKind(url) {
    try {
      var u = new URL(String(url || '').trim());
      var host = u.hostname.replace(/^www\./, '');
      if (host === 'pin.it') return 'pin';
      if (host !== 'pinterest.com' && host.slice(-14) !== '.pinterest.com') return '';
      if (u.pathname.indexOf('/pin/') >= 0) return 'pin';
      var parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] !== 'pin') return 'board';
      return '';
    } catch (e) { return ''; }
  }
  function ideasFor(roomId) {
    return Object.keys(mapOf('ideas')).map(function (id) { return mapOf('ideas')[id]; })
      .filter(function (idea) { return !roomId || idea.roomId === roomId; })
      .sort(function (a, b) { return String(b.added || '').localeCompare(String(a.added || '')); });
  }
  function ideaForm(roomId) {
    var roomField = roomId
      ? ''
      : field('Room', '<select name="roomId">' + roomOptions('', 'Whole house') + '</select>');
    return '<form class="stack" data-act="add-idea"' + (roomId ? ' data-id="' + esc(roomId) + '"' : '') + '>' +
      '<div class="split">' +
        field('Pinterest link', '<input name="url" type="url" required placeholder="https://www.pinterest.com/pin/…">') +
        roomField +
        field('What you like', '<input name="note" maxlength="140" placeholder="The warm oak and the brass pulls">') +
      '</div><button class="btn btn-primary" type="submit">Add idea</button></form>';
  }
  function ideaCard(idea) {
    var safeUrl = /^https?:\/\//i.test(idea.url || '') && pinKind(idea.url) ? idea.url : '';
    var kind = safeUrl ? pinKind(safeUrl) : '';
    var attrs = kind === 'board'
      ? 'data-pin-do="embedBoard" data-pin-board-width="360" data-pin-scale-height="200" data-pin-scale-width="80"'
      : 'data-pin-do="embedPin" data-pin-width="medium"';
    return '<article class="idea"><div class="card-head"><h2>' + esc(idea.note || 'Pinterest idea') + '</h2>' +
      '<button type="button" class="text-btn danger" data-act="delete-idea" data-id="' + esc(idea.id) + '">Remove</button></div>' +
      '<div class="split">' +
        field('What you like', '<input data-act="idea-field" data-id="' + esc(idea.id) + '" data-field="note" value="' + esc(idea.note || '') + '" maxlength="140">') +
        field('Room', '<select data-act="idea-field" data-id="' + esc(idea.id) + '" data-field="roomId">' + roomOptions(idea.roomId || '', 'Whole house') + '</select>') +
      '</div>' +
      field('Link', '<input data-act="idea-field" data-id="' + esc(idea.id) + '" data-field="url" value="' + esc(idea.url || '') + '">') +
      (safeUrl ? '<p class="meta"><a href="' + esc(safeUrl) + '" target="_blank" rel="noopener">Open on Pinterest</a></p><div class="pin"><a ' + attrs + ' href="' + esc(safeUrl) + '"></a></div>' : '') +
      '</article>';
  }
  function ideaGrid(list) {
    if (!list.length) return '<p class="empty">No Pinterest ideas yet. Paste a pin or a board link.</p>';
    return '<div class="idea-grid">' + list.map(ideaCard).join('') + '</div>';
  }
  function refreshPins() {
    if (!document.querySelector('[data-pin-do]')) return;
    function build() {
      if (window.PinUtils && window.PinUtils.build) {
        try { window.PinUtils.build(); } catch (e) {}
      }
    }
    if (window.PinUtils) { build(); return; }
    var s = document.getElementById('pinterest-js');
    if (!s) {
      s = document.createElement('script');
      s.id = 'pinterest-js';
      s.async = true;
      s.src = 'https://assets.pinterest.com/js/pinit.js';
      s.onload = build;
      document.body.appendChild(s);
    } else {
      s.addEventListener('load', build, { once: true });
    }
  }
  function comingUp() {
    var today = todayIso();
    var rows = listSchedule().filter(function (row) {
      return row.status !== 'done' && String(row.end || row.start || '') >= today;
    }).slice(0, 3);
    if (!rows.length) return '';
    return '<h2>Coming up</h2><ul class="plain">' + rows.map(function (row) {
      var room = roomById(row.roomId);
      return '<li><button type="button" class="text-btn" data-act="nav" data-nav="calendar">' + esc(row.title) + '</button>' +
        ' <span class="meta">' + esc(row.start || '') + (row.end && row.end !== row.start ? ' – ' + esc(row.end) : '') +
        (room ? ' · ' + esc(room.name) : '') + '</span></li>';
    }).join('') + '</ul>';
  }
  function scheduleCard(row) {
    return '<article class="card"><div class="card-head"><h2>' + esc(row.title || 'Step') + '</h2>' +
      '<button type="button" class="text-btn danger" data-act="delete-schedule" data-id="' + esc(row.id) + '">Delete</button></div>' +
      '<div class="split">' +
        field('Step', '<input data-act="schedule-field" data-id="' + esc(row.id) + '" data-field="title" value="' + esc(row.title || '') + '" maxlength="80">') +
        field('Starts', '<input type="date" data-act="schedule-field" data-id="' + esc(row.id) + '" data-field="start" value="' + esc(row.start || '') + '">') +
        field('Ends', '<input type="date" data-act="schedule-field" data-id="' + esc(row.id) + '" data-field="end" value="' + esc(row.end || '') + '">') +
        field('Status', '<select data-act="schedule-field" data-id="' + esc(row.id) + '" data-field="status">' +
          opts([['planned', 'Planned'], ['doing', 'In progress'], ['done', 'Done']], row.status || 'planned') + '</select>') +
        field('Room', '<select data-act="schedule-field" data-id="' + esc(row.id) + '" data-field="roomId">' + roomOptions(row.roomId || '', 'Whole house') + '</select>') +
        field('Phase', '<select data-act="schedule-field" data-id="' + esc(row.id) + '" data-field="phaseId">' + phaseOptions(row.phaseId || '') + '</select>') +
      '</div>' +
      field('Notes', '<input data-act="schedule-field" data-id="' + esc(row.id) + '" data-field="notes" value="' + esc(row.notes || '') + '" maxlength="180">') +
      '</article>';
  }
  function renderPhases() {
    var steps = listSchedule();
    return pageHead('Project plan', 'Give each phase a start and end, then add the steps that belong on the calendar.') +
      phaseList().map(function (phase) {
        var list = rooms().filter(function (r) { return r.phaseId === phase.id; });
        return '<article class="card"><div class="card-head"><h2>' + esc(phase.name) + '</h2><button type="button" class="text-btn danger" data-act="delete-phase" data-id="' + esc(phase.id) + '">Delete</button></div>' +
          '<div class="split">' +
          field('Label', '<input data-act="phase-field" data-id="' + esc(phase.id) + '" data-field="year" value="' + esc(phase.year || '') + '">') +
          field('Starts', '<input type="date" data-act="phase-field" data-id="' + esc(phase.id) + '" data-field="start" value="' + esc(phase.start || '') + '">') +
          field('Ends', '<input type="date" data-act="phase-field" data-id="' + esc(phase.id) + '" data-field="end" value="' + esc(phase.end || '') + '">') +
          field('Notes', '<input data-act="phase-field" data-id="' + esc(phase.id) + '" data-field="notes" value="' + esc(phase.notes || '') + '">') +
          '</div><ul class="plain">' + (list.length ? list.map(function (r) {
            return '<li><button type="button" class="text-btn" data-act="open-room" data-id="' + esc(r.id) + '">' + esc(r.name) + '</button></li>';
          }).join('') : '<li>No rooms in this phase.</li>') + '</ul></article>';
      }).join('') +
      '<form class="add-bar" data-act="add-phase"><input name="name" required placeholder="Phase name" maxlength="60"><input name="year" placeholder="Year 5"><button class="btn btn-primary" type="submit">Add phase</button></form>' +
      '<h2>Steps</h2>' +
      '<form class="stack" data-act="add-schedule"><div class="split">' +
        field('Step', '<input name="title" required maxlength="80" placeholder="Demo kitchen cabinets">') +
        field('Starts', '<input name="start" type="date" required value="' + todayIso() + '">') +
        field('Ends', '<input name="end" type="date">') +
        field('Room', '<select name="roomId">' + roomOptions('', 'Whole house') + '</select>') +
        field('Phase', '<select name="phaseId">' + phaseOptions('') + '</select>') +
      '</div>' +
      field('Notes', '<input name="notes" maxlength="180" placeholder="Dumpster arrives the day before">') +
      '<button class="btn btn-primary" type="submit">Add step</button></form>' +
      (steps.length ? steps.map(scheduleCard).join('') : '<p class="empty">No dated steps yet.</p>');
  }
  function calState() {
    if (!state.cal) {
      var now = new Date();
      state.cal = { y: now.getFullYear(), m: now.getMonth(), pick: '' };
    }
    return state.cal;
  }
  function renderCalendar() {
    var c = calState();
    var label = new Date(c.y, c.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    var first = new Date(c.y, c.m, 1);
    var start = new Date(c.y, c.m, 1 - first.getDay());
    var today = todayIso();
    var steps = listSchedule();
    var phases = phaseList().filter(function (p) { return p.start && p.end; });
    var weeks = '';
    var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (n) { return '<div class="dow">' + n + '</div>'; }).join('');
    for (var i = 0; i < 42; i++) {
      var dt = new Date(start);
      dt.setDate(start.getDate() + i);
      var iso = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      var chips = [];
      var inPhase = false;
      phases.forEach(function (p) {
        if (p.start <= iso && iso <= p.end) inPhase = true;
        if (p.start === iso) chips.push('<span class="chip phase">' + esc(p.name) + '</span>');
        else if (p.end === iso) chips.push('<span class="chip phase">' + esc(p.name) + ' ends</span>');
      });
      steps.forEach(function (row) {
        var a = row.start || row.end;
        var b = row.end || row.start;
        if (!a || !b || iso < a || iso > b) return;
        var span = Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
        if (span <= 2 || iso === a || iso === b) chips.push('<span class="chip">' + esc(row.title || 'Step') + (iso === b && iso !== a ? ' ends' : '') + '</span>');
      });
      var extra = chips.length > 3 ? '<span class="chip">+' + (chips.length - 3) + '</span>' : '';
      weeks += '<button type="button" class="day' + (dt.getMonth() !== c.m ? ' out' : '') + (inPhase ? ' in-phase' : '') + (iso === today ? ' today' : '') + (iso === c.pick ? ' pick' : '') +
        '" data-act="cal-pick" data-date="' + iso + '"><span class="num">' + dt.getDate() + '</span>' + chips.slice(0, 3).join('') + extra + '</button>';
    }
    var picked = c.pick;
    var daySteps = picked ? steps.filter(function (row) {
      var a = row.start || row.end;
      var b = row.end || row.start;
      return a && b && a <= picked && picked <= b;
    }) : [];
    var dayPhases = picked ? phases.filter(function (p) { return p.start <= picked && picked <= p.end; }) : [];
    var detail = picked
      ? '<h2>' + esc(new Date(picked + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })) + '</h2>' +
        (dayPhases.length ? '<ul class="plain">' + dayPhases.map(function (p) { return '<li>' + esc(p.name) + '</li>'; }).join('') + '</ul>' : '') +
        (daySteps.length ? daySteps.map(scheduleCard).join('') : '<p class="empty">Nothing scheduled this day.</p>') +
        '<form class="stack" data-act="add-schedule"><div class="split">' +
          field('Step', '<input name="title" required maxlength="80" placeholder="Order quartz">') +
          field('Starts', '<input name="start" type="date" required value="' + esc(picked) + '">') +
          field('Ends', '<input name="end" type="date" value="' + esc(picked) + '">') +
          field('Room', '<select name="roomId">' + roomOptions('', 'Whole house') + '</select>') +
          field('Phase', '<select name="phaseId">' + phaseOptions('') + '</select>') +
        '</div><button class="btn btn-primary" type="submit">Add step on this day</button></form>'
      : '<p class="meta">Select a day to see it, or to add a step.</p>';
    return pageHead('Calendar', 'A phase is marked on its first and last day, and the days between are shaded. Steps are the green labels.') +
      '<div class="cal-nav"><button type="button" class="btn btn-ghost" data-act="cal-move" data-dir="-1">Previous</button><h2>' + esc(label) + '</h2>' +
      '<button type="button" class="btn btn-ghost" data-act="cal-today">This month</button>' +
      '<button type="button" class="btn btn-ghost" data-act="cal-move" data-dir="1">Next</button></div>' +
      '<div class="cal">' + names + weeks + '</div>' + detail;
  }
  function renderIdeas() {
    return pageHead('Ideas', 'Paste a Pinterest pin or board. A full pinterest.com link can show here. A pin.it link still opens on Pinterest.') +
      ideaForm('') + ideaGrid(ideasFor(''));
  }

  function renderBids() {
    var bids = Object.keys(mapOf('bids')).map(function (id) { return mapOf('bids')[id]; });
    var roomOpts = rooms().map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('');
    return pageHead('Bids', 'Put a contractor number next to the allowance for that room.') +
      '<form class="stack" data-act="add-bid">' +
        '<div class="split">' +
          field('Contractor', '<input name="contractor" required maxlength="80" placeholder="Company">') +
          field('Amount', '<input name="amount" required type="number" min="0" step="1" placeholder="0">') +
          field('Room', '<select name="roomId"><option value="">Whole house</option>' + roomOpts + '</select>') +
          field('Status', '<select name="status">' + opts([['asked', 'Asked'], ['received', 'Received'], ['accepted', 'Accepted'], ['declined', 'Declined']], 'received') + '</select>') +
        '</div>' +
        field('What it includes', '<input name="notes" maxlength="180" placeholder="Labor and cabinets, appliances by owner">') +
        '<button class="btn btn-primary" type="submit">Add bid</button></form>' +
      (bids.length ? bids.map(function (bid) {
        var room = roomById(bid.roomId);
        var plan = room ? ((totals().byRoom[room.id] || {}).plan || 0) : totals().plan;
        return '<article class="card"><div class="card-head"><h2>' + esc(bid.contractor || 'Bid') + '</h2><button type="button" class="text-btn danger" data-act="delete-bid" data-id="' + esc(bid.id) + '">Delete</button></div>' +
          '<p><strong>' + money(bid.amount) + '</strong> · ' + esc(bid.status || '') + ' · ' + esc(room ? room.name : 'Whole house') + '</p>' +
          '<p class="meta">Allowance for that scope is ' + money(plan) + '. This bid is ' + money((Number(bid.amount) || 0) - plan) + ' against it.</p>' +
          (bid.notes ? '<p>' + esc(bid.notes) + '</p>' : '') + '</article>';
      }).join('') : '<p class="empty">No bids yet.</p>');
  }

  function renderSelections() {
    var rows = Object.keys(mapOf('selections')).map(function (id) { return mapOf('selections')[id]; });
    var roomOpts = rooms().map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('');
    return pageHead('Selections', 'The finish you actually picked, next to the allowance.') +
      '<form class="stack" data-act="add-selection"><div class="split">' +
        field('Item', '<input name="name" required maxlength="80" placeholder="Kitchen faucet">') +
        field('Room', '<select name="roomId">' + roomOpts + '</select>') +
        field('Price', '<input name="price" type="number" min="0" step="0.01" placeholder="0">') +
        field('Status', '<select name="status">' + opts([['considering', 'Considering'], ['chosen', 'Chosen'], ['ordered', 'Ordered'], ['installed', 'Installed']], 'considering') + '</select>') +
      '</div><div class="split">' +
        field('Spec', '<input name="spec" maxlength="120" placeholder="Brand, color, model">') +
        field('Link', '<input name="url" type="url" placeholder="https://">') +
      '</div><button class="btn btn-primary" type="submit">Add selection</button></form>' +
      (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Room</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.map(function (row) {
          var room = roomById(row.roomId);
          var safeUrl = /^https?:\/\//i.test(row.url || '') ? row.url : '';
          var name = safeUrl ? '<a href="' + esc(safeUrl) + '" target="_blank" rel="noopener">' + esc(row.name) + '</a>' : esc(row.name);
          return '<tr><td>' + name + (row.spec ? '<div class="meta">' + esc(row.spec) + '</div>' : '') + '</td><td>' + esc(room ? room.name : '') +
            '</td><td>' + money(row.price) + '</td><td>' + esc(row.status || '') + '</td><td><button type="button" class="text-btn danger" data-act="delete-selection" data-id="' + esc(row.id) + '">Delete</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">No selections yet.</p>');
  }

  function renderDecisions() {
    var rows = Object.keys(mapOf('decisions')).map(function (id) { return mapOf('decisions')[id]; })
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var names = people();
    var who = names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
    who += '<option value="Both">Both</option>';
    var roomOpts = '<option value="">Whole house</option>' + rooms().map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('');
    return pageHead('Decisions', 'What you agreed, with the date and the reason.') +
      '<form class="stack" data-act="add-decision"><div class="split">' +
        field('Decision', '<input name="title" required maxlength="100" placeholder="Quartz in the kitchen">') +
        field('Who', '<select name="by">' + who + '</select>') +
        field('Date', '<input name="date" type="date">') +
        field('Room', '<select name="roomId">' + roomOpts + '</select>') +
      '</div>' + field('Why', '<textarea name="detail" rows="2" maxlength="500" placeholder="What you compared, and why this won"></textarea>') +
      '<button class="btn btn-primary" type="submit">Add decision</button></form>' +
      (rows.length ? rows.map(function (row) {
        var room = roomById(row.roomId);
        return '<article class="card"><div class="card-head"><h2>' + esc(row.title) + '</h2><button type="button" class="text-btn danger" data-act="delete-decision" data-id="' + esc(row.id) + '">Delete</button></div>' +
          '<p class="meta">' + esc(row.date || 'No date') + ' · ' + esc(row.by || 'Both') + (room ? ' · ' + esc(room.name) : '') + '</p>' +
          (row.detail ? '<p>' + esc(row.detail) + '</p>' : '') + '</article>';
      }).join('') : '<p class="empty">No decisions yet.</p>');
  }

  function renderPunch() {
    var rows = Object.keys(mapOf('punch')).map(function (id) { return mapOf('punch')[id]; });
    var roomOpts = rooms().map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('');
    return pageHead('Punch', 'What is left after a room looks finished.') +
      '<form class="add-bar" data-act="add-punch"><input name="title" required maxlength="120" placeholder="Touch up the casing by the pantry"><select name="roomId">' + roomOpts + '</select><button class="btn btn-primary" type="submit">Add</button></form>' +
      (rows.length ? '<ul class="checks">' + rows.map(function (row) {
        var room = roomById(row.roomId);
        return '<li class="' + (row.done ? 'done' : '') + '"><label><input type="checkbox" data-act="toggle-punch" data-id="' + esc(row.id) + '"' + (row.done ? ' checked' : '') + '> ' +
          esc(row.title) + '</label><span class="meta">' + esc(room ? room.name : '') + '</span><button type="button" class="text-btn danger" data-act="delete-punch" data-id="' + esc(row.id) + '">Delete</button></li>';
      }).join('') + '</ul>' : '<p class="empty">Nothing on the punch list.</p>');
  }

  function renderExpenses() {
    var rows = Object.keys(mapOf('expenses')).map(function (id) { return mapOf('expenses')[id]; })
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var roomOpts = '<option value="">Unassigned</option>' + rooms().map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('');
    return pageHead('Expenses', 'Money that has actually left the account. It shows up as spent on that room.') +
      '<form class="stack" data-act="add-expense"><div class="split">' +
        field('Amount', '<input name="amount" required type="number" min="0" step="0.01" placeholder="0">') +
        field('Date', '<input name="date" type="date">') +
        field('Room', '<select name="roomId">' + roomOpts + '</select>') +
        field('Vendor', '<input name="vendor" maxlength="80" placeholder="Store or contractor">') +
      '</div>' + field('Note', '<input name="note" maxlength="140" placeholder="What it was">') +
      '<button class="btn btn-primary" type="submit">Add expense</button></form>' +
      '<p class="meta">Spent so far ' + money(totals().spentAll) + '.</p>' +
      (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>What</th><th>Room</th><th>Amount</th><th></th></tr></thead><tbody>' +
        rows.map(function (row) {
          var room = roomById(row.roomId);
          return '<tr><td>' + esc(row.date || '') + '</td><td>' + esc(row.note || row.vendor || 'Expense') +
            (row.vendor && row.note ? '<div class="meta">' + esc(row.vendor) + '</div>' : '') +
            '</td><td>' + esc(room ? room.name : 'Unassigned') + '</td><td>' + money(row.amount) +
            '</td><td><button type="button" class="text-btn danger" data-act="delete-expense" data-id="' + esc(row.id) + '">Delete</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">No expenses yet.</p>');
  }

  function renderSettings() {
    var h = house();
    var rates = h.rates || Lib.RATE;
    var rateFields = Object.keys(Lib.RATE).map(function (trade) {
      return field(trade.charAt(0).toUpperCase() + trade.slice(1) + ' $/hr',
        '<input data-rate="' + trade + '" type="number" min="0" step="1" value="' + esc(rates[trade] || Lib.RATE[trade]) + '">');
    }).join('');
    var peopleNames = h.people || ['Justin', ''];
    return pageHead('Settings', 'These settings rescale every allowance. A real quote still replaces a line.') +
      '<form class="stack" id="house-form">' +
        '<div class="split">' +
          field('Plan name', '<input name="name" value="' + esc(h.name || '') + '">') +
          field('Address', '<input name="address" value="' + esc(h.address || '') + '">') +
          field('Living area', '<input name="sqft" type="number" min="0" step="1" value="' + esc(h.sqft || 0) + '">') +
          field('Year built', '<input name="yearBuilt" type="number" min="1800" max="2100" step="1" value="' + esc(h.yearBuilt || '') + '">') +
        '</div><div class="split">' +
          field('Your name', '<input name="person0" value="' + esc(peopleNames[0] || '') + '">') +
          field('Second name', '<input name="person1" value="' + esc(peopleNames[1] || '') + '" placeholder="Name">') +
          field('Material quality', '<select name="quality">' + opts([['good', 'Good'], ['better', 'Better'], ['best', 'Best']], h.quality || 'better') + '</select>') +
          field('Local cost factor', '<input name="region" type="number" min="0.5" max="2" step="0.05" value="' + esc(h.region || 1) + '">') +
        '</div><div class="split">' +
          field('Contingency %', '<input name="contingency" type="number" min="0" max="40" step="1" value="' + esc(h.contingency || 0) + '">') +
          field('Markup on trade materials %', '<input name="markup" type="number" min="0" max="80" step="1" value="' + esc(h.markup || 0) + '">') +
          field('Value of an hour', '<input name="timeRate" type="number" min="0" max="300" step="1" value="' + esc(h.timeRate || 0) + '">') +
          '<label class="check"><input name="countTime" type="checkbox"' + (h.countTime ? ' checked' : '') + '> Count our time in DIY totals</label>' +
        '</div>' +
        field('Notes', '<textarea name="note" rows="4">' + esc(h.note || '') + '</textarea>') +
        '<h2>Trade rates</h2><div class="split rates">' + rateFields + '</div>' +
        '<div class="page-actions"><button class="btn btn-primary" type="button" data-act="save-house">Save settings</button>' +
        '<button class="btn btn-ghost" type="button" data-act="export-json">Download backup</button>' +
        '<label class="btn btn-ghost file">Restore backup<input type="file" accept="application/json" data-act="import-json" hidden></label>' +
        '<button class="btn btn-ghost" type="button" data-act="sign-out">Sign out</button></div></form>' +
      '<p class="meta">Same family email as the hub. The plan is stored in that Firebase project under remodel. Zestimate on file: ' +
        money(h.zestimate || 0) + ' as of ' + esc(h.zestimateDate || '') + '.</p>';
  }

  function go(view) {
    state.view = view;
    state.roomId = null;
    try { sessionStorage.setItem('remodel-view', view); } catch (e) {}
    render(false);
    window.scrollTo(0, 0);
  }

  function ensureCollections() {
    ['items', 'rooms', 'phases', 'bids', 'selections', 'decisions', 'punch', 'expenses', 'contractors', 'ideas', 'schedule'].forEach(function (key) {
      if (!data()[key]) data()[key] = {};
    });
  }

  function formValues(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }

  function onClick(event) {
    if (event.target && event.target.id === 'modal') { closeModal(); return; }
    var el = event.target.closest('[data-act]');
    if (!el || el.tagName === 'FORM') return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    if (act === 'nav') { closeNav(); go(el.getAttribute('data-nav')); return; }
    if (act === 'cal-move') {
      var dir = Number(el.getAttribute('data-dir')) || 0;
      var c = calState();
      var next = new Date(c.y, c.m + dir, 1);
      state.cal = { y: next.getFullYear(), m: next.getMonth(), pick: '' };
      render(false);
      return;
    }
    if (act === 'cal-today') {
      var now = new Date();
      state.cal = { y: now.getFullYear(), m: now.getMonth(), pick: todayIso() };
      render(false);
      return;
    }
    if (act === 'cal-pick') {
      calState().pick = el.getAttribute('data-date') || '';
      render(false);
      return;
    }
    if (act === 'menu') { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('overlay').classList.toggle('on'); return; }
    if (act === 'open-room') { state.roomId = id; state.view = 'rooms'; render(false); window.scrollTo(0, 0); return; }
    if (act === 'close-room') { state.roomId = null; render(false); return; }
    if (act === 'item-who') {
      var item = mapOf('items')[id];
      if (!item) return;
      item.who = el.getAttribute('data-who');
      render(true);
      savePath('items/' + id, item);
      return;
    }
    if (act === 'delete-item' && confirm('Delete this line?')) {
      delete data().items[id];
      render(true);
      savePath('items/' + id, null);
      return;
    }
    if (act === 'apply-template') return applyTemplate(id);
    if (act === 'add-room') return openRoomForm(null);
    if (act === 'edit-room') return openRoomForm(id);
    if (act === 'save-room') return saveRoom();
    if (act === 'delete-room') return deleteRoom(id);
    if (act === 'close-modal') return closeModal();
    if (act === 'save-house') return saveHouse();
    if (act === 'export-json') return exportJson();
    if (act === 'sign-out') return signOut();
    if (act === 'delete-phase' && confirm('Delete this phase? Rooms stay, unscheduled.')) {
      rooms().forEach(function (room) { if (room.phaseId === id) { room.phaseId = ''; savePath('rooms/' + room.id, room); } });
      delete data().phases[id];
      render(true);
      savePath('phases/' + id, null);
      return;
    }
    var trash = { bid: 'bids', selection: 'selections', decision: 'decisions', punch: 'punch', expense: 'expenses', idea: 'ideas', schedule: 'schedule' };
    Object.keys(trash).forEach(function (kind) {
      if (act !== 'delete-' + kind) return;
      if (!confirm('Delete this?')) return;
      var key = trash[kind];
      if (!data()[key]) data()[key] = {};
      delete data()[key][id];
      render(true);
      savePath(key + '/' + id, null);
    });
  }

  function onChange(event) {
    var el = event.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    if (act === 'item-field') {
      var item = mapOf('items')[id];
      if (!item) return;
      item[el.getAttribute('data-field')] = Math.max(0, num(el.value));
      savePath('items/' + id, item);
      render(true);
      return;
    }
    if (act === 'room-notes') {
      var room = roomById(id);
      if (!room) return;
      room.notes = el.value;
      savePath('rooms/' + id, room);
      return;
    }
    if (act === 'phase-field') {
      var phase = mapOf('phases')[id];
      if (!phase) return;
      var phaseKey = el.getAttribute('data-field');
      phase[phaseKey] = el.value;
      if ((phaseKey === 'start' || phaseKey === 'end') && phase.start && phase.end && phase.end < phase.start) {
        if (phaseKey === 'start') phase.end = phase.start;
        else phase.start = phase.end;
      }
      savePath('phases/' + id, phase);
      return;
    }
    if (act === 'idea-field') {
      var idea = mapOf('ideas')[id];
      if (!idea) return;
      var ideaKey = el.getAttribute('data-field');
      if (ideaKey === 'url') {
        var kind = pinKind(String(el.value || '').trim());
        if (!kind) { toast('Paste a Pinterest pin or board link.', true); render(true); return; }
        idea.url = String(el.value || '').trim();
        idea.kind = kind;
        savePath('ideas/' + id, idea);
        render(true);
        return;
      }
      idea[ideaKey] = el.value;
      savePath('ideas/' + id, idea);
      return;
    }
    if (act === 'schedule-field') {
      var step = mapOf('schedule')[id];
      if (!step) return;
      var stepKey = el.getAttribute('data-field');
      if (stepKey === 'title' && !String(el.value || '').trim()) { render(true); return; }
      step[stepKey] = (stepKey === 'title' || stepKey === 'notes') ? String(el.value || '').trim() : el.value;
      if ((stepKey === 'start' || stepKey === 'end') && step.start && step.end && step.end < step.start) {
        if (stepKey === 'start') step.end = step.start;
        else step.start = step.end;
      }
      savePath('schedule/' + id, step);
      if (stepKey !== 'title' && stepKey !== 'notes') render(true);
      return;
    }
    if (act === 'toggle-punch') {
      var punch = mapOf('punch')[id];
      if (!punch) return;
      punch.done = el.checked;
      savePath('punch/' + id, punch);
      render(true);
      return;
    }
    if (act === 'import-json') return importJson(el.files && el.files[0]);
  }

  function onSubmit(event) {
    var form = event.target.closest('form[data-act]');
    if (!form) return;
    event.preventDefault();
    var act = form.getAttribute('data-act');
    var values = formValues(form);
    ensureCollections();
    if (act === 'add-line') return addLine(form.getAttribute('data-id'), values.name);
    if (act === 'add-phase') return addRecord('phases', { name: values.name.trim(), year: values.year.trim(), notes: '', order: Date.now() });
    if (act === 'add-bid') return addRecord('bids', { contractor: values.contractor.trim(), amount: num(values.amount), roomId: values.roomId, status: values.status, notes: values.notes.trim(), date: new Date().toISOString().slice(0, 10) });
    if (act === 'add-selection') return addRecord('selections', { name: values.name.trim(), roomId: values.roomId, price: num(values.price), status: values.status, spec: values.spec.trim(), url: values.url.trim() });
    if (act === 'add-decision') return addRecord('decisions', { title: values.title.trim(), by: values.by, date: values.date || new Date().toISOString().slice(0, 10), roomId: values.roomId, detail: values.detail.trim() });
    if (act === 'add-punch') return addRecord('punch', { title: values.title.trim(), roomId: values.roomId, done: false });
    if (act === 'add-expense') return addRecord('expenses', { amount: num(values.amount), date: values.date || new Date().toISOString().slice(0, 10), roomId: values.roomId, vendor: values.vendor.trim(), note: values.note.trim() });
    if (act === 'add-idea') return addIdea(values, form.getAttribute('data-id') || '');
    if (act === 'add-schedule') return addSchedule(values);
  }

  function addIdea(values, roomId) {
    var url = String(values.url || '').trim();
    var kind = pinKind(url);
    if (!kind) { toast('Paste a Pinterest pin or board link.', true); return; }
    var note = String(values.note || '').trim();
    addRecord('ideas', {
      url: url,
      kind: kind,
      roomId: values.roomId || roomId || '',
      note: note,
      title: note || (kind === 'board' ? 'Pinterest board' : 'Pinterest pin'),
      added: todayIso()
    });
  }

  function addSchedule(values) {
    var title = String(values.title || '').trim();
    var start = values.start || '';
    if (!title || !start) return;
    var end = values.end || start;
    if (end < start) end = start;
    addRecord('schedule', {
      title: title,
      start: start,
      end: end,
      roomId: values.roomId || '',
      phaseId: values.phaseId || '',
      status: 'planned',
      notes: String(values.notes || '').trim()
    });
  }

  function addRecord(key, record) {
    if (record.name === '' || record.title === '' || record.contractor === '') return;
    var id = uid(key.slice(0, 2));
    record.id = id;
    data()[key][id] = record;
    render(false);
    savePath(key + '/' + id, record);
    toast('Saved');
  }

  function addLine(roomId, name) {
    name = String(name || '').trim();
    if (!name) return;
    ensureCollections();
    var id = uid('ln');
    var item = { id: id, roomId: roomId, name: name, cat: 'Other', qty: 1, unit: 'each', mat: 0, hours: 0, waste: 0, trade: 'labor', supply: 'trade', who: 'later', diyMult: 2.2, notes: '', status: 'planned' };
    data().items[id] = item;
    render(true);
    savePath('items/' + id, item);
  }

  function applyTemplate(roomId) {
    var room = roomById(roomId);
    if (!room) return;
    var lines = Lib.templateLines(room);
    if (!lines.length) { toast('This room has no typical scope. Add lines yourself.', true); return; }
    if (itemsFor(roomId).length && !confirm('Add another typical set to ' + room.name + '?')) return;
    ensureCollections();
    lines.forEach(function (row) {
      var id = uid('ln');
      var item = Object.assign({ id: id, roomId: roomId, status: 'planned' }, row);
      data().items[id] = item;
      savePath('items/' + id, item);
    });
    if (room.status === 'idea') { room.status = 'planning'; savePath('rooms/' + roomId, room); }
    render(true);
    toast('Typical scope added');
  }

  function openRoomForm(id) {
    var room = id ? roomById(id) : { id: '', name: '', floor: 'Main', sqft: '', status: 'idea', phaseId: '', template: 'living', counts: true, notes: '' };
    var phases = Object.keys(mapOf('phases')).map(function (pid) { return mapOf('phases')[pid]; });
    var phaseOpts = '<option value="">Unscheduled</option>' + phases.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (room.phaseId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
    var templates = [['', 'None'], ['kitchen', 'Kitchen'], ['bath', 'Full bath'], ['halfbath', 'Half bath'], ['bedroom', 'Bedroom'], ['closet', 'Closet'], ['living', 'Living space'], ['laundry', 'Laundry'], ['garage', 'Garage'], ['exterior', 'Exterior'], ['deck', 'Deck'], ['systems', 'Systems']];
    document.getElementById('modal-card').innerHTML =
      '<h2>' + (id ? 'Edit room' : 'Add room') + '</h2>' +
      field('Name', '<input id="rm-name" value="' + esc(room.name || '') + '" maxlength="60">') +
      '<div class="split">' +
        field('Floor', '<select id="rm-floor">' + opts(FLOORS.map(function (f) { return [f, f]; }), room.floor || 'Main') + '</select>') +
        field('Sq ft', '<input id="rm-sqft" type="number" min="0" step="1" value="' + esc(room.sqft || 0) + '">') +
        field('Status', '<select id="rm-status">' + opts(STATUSES, room.status || 'idea') + '</select>') +
        field('Phase', '<select id="rm-phase">' + phaseOpts + '</select>') +
      '</div>' +
      field('Typical scope', '<select id="rm-template">' + opts(templates, room.template || '') + '</select>') +
      '<label class="check"><input id="rm-counts" type="checkbox"' + (room.counts !== false ? ' checked' : '') + '> Count this square footage in the 4,300</label>' +
      field('Notes', '<textarea id="rm-notes" rows="3">' + esc(room.notes || '') + '</textarea>') +
      '<div class="page-actions"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>' +
      (id ? '<button type="button" class="btn btn-ghost danger-btn" data-act="delete-room" data-id="' + esc(id) + '">Delete room</button>' : '') +
      '<button type="button" class="btn btn-primary" data-act="save-room" data-id="' + esc(id || '') + '">Save room</button></div>';
    document.getElementById('modal').hidden = false;
  }
  function closeModal() { document.getElementById('modal').hidden = true; }
  function saveRoom() {
    var id = document.querySelector('[data-act="save-room"]').getAttribute('data-id');
    var name = document.getElementById('rm-name').value.trim();
    if (!name) { toast('Name the room.', true); return; }
    ensureCollections();
    if (!id) id = uid('rm');
    var existing = roomById(id) || { order: Date.now() };
    var room = Object.assign({}, existing, {
      id: id,
      name: name,
      floor: document.getElementById('rm-floor').value,
      sqft: Math.max(0, num(document.getElementById('rm-sqft').value)),
      status: document.getElementById('rm-status').value,
      phaseId: document.getElementById('rm-phase').value,
      template: document.getElementById('rm-template').value,
      counts: document.getElementById('rm-counts').checked,
      notes: document.getElementById('rm-notes').value
    });
    data().rooms[id] = room;
    closeModal();
    render(true);
    savePath('rooms/' + id, room);
  }
  function deleteRoom(id) {
    if (!confirm('Delete this room and its scope lines?')) return;
    itemsFor(id).forEach(function (item) {
      delete data().items[item.id];
      savePath('items/' + item.id, null);
    });
    delete data().rooms[id];
    if (state.roomId === id) state.roomId = null;
    closeModal();
    render(false);
    savePath('rooms/' + id, null);
  }

  function saveHouse() {
    var form = document.getElementById('house-form');
    var values = formValues(form);
    var next = Object.assign({}, house(), {
      name: values.name.trim() || 'Remodel',
      address: values.address.trim(),
      sqft: num(values.sqft),
      yearBuilt: num(values.yearBuilt),
      people: [values.person0.trim(), values.person1.trim()],
      quality: values.quality,
      region: num(values.region) || 1,
      contingency: num(values.contingency),
      markup: num(values.markup),
      timeRate: num(values.timeRate),
      countTime: !!values.countTime,
      note: values.note,
      rates: Object.assign({}, house().rates || Lib.RATE)
    });
    form.querySelectorAll('[data-rate]').forEach(function (el) { next.rates[el.getAttribute('data-rate')] = num(el.value); });
    data().house = next;
    savePath('house', next);
    toast('Saved');
    render(true);
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(data(), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'basildon-remodel.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  function importJson(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var next = JSON.parse(reader.result);
        if (!next || !next.house || !next.rooms) throw new Error('missing');
        if (!confirm('Replace the shared plan with this backup?')) return;
        state.data = next;
        render(false);
        if (!state.preview && dbRef) {
          silence++;
          dbRef.set(next).catch(function (err) { toast(authError(err), true); }).finally(function () { silence = Math.max(0, silence - 1); });
        }
        toast('Backup restored');
      } catch (e) { toast('That file is not a remodel backup.', true); }
    };
    reader.readAsText(file);
  }

  function signOut() {
    if (state.preview) { state.preview = false; state.data = null; showAuth(); return; }
    if (!confirm('Sign out on this device?')) return;
    firebase.auth().signOut();
  }
  function closeNav() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('on');
  }

  function bootAuth() {
    var create = /(?:\?|&)create=1(?:&|$)/.test(location.search || '');
    var createBtn = document.getElementById('auth-create');
    if (create) createBtn.hidden = false;
    document.getElementById('auth-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var email = document.getElementById('auth-email').value.trim();
      var password = document.getElementById('auth-pass').value;
      if (!email || !password) { authMsg('Enter the family email and password.', true); return; }
      authMsg('Signing in…');
      firebase.auth().signInWithEmailAndPassword(email, password).catch(function (err) { authMsg(authError(err), true); });
    });
    createBtn.addEventListener('click', function () {
      var email = document.getElementById('auth-email').value.trim();
      var password = document.getElementById('auth-pass').value;
      if (!email || password.length < 6) { authMsg('Use an email and a password of at least 6 characters.', true); return; }
      firebase.auth().createUserWithEmailAndPassword(email, password).catch(function (err) { authMsg(authError(err), true); });
    });
    document.getElementById('auth-reset').addEventListener('click', function () {
      var email = document.getElementById('auth-email').value.trim();
      if (!email) { authMsg('Enter the family email first.', true); return; }
      firebase.auth().sendPasswordResetEmail(email).then(function () { authMsg('Password reset email sent.'); }).catch(function (err) { authMsg(authError(err), true); });
    });
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) {
        listening = false;
        if (dbRef) dbRef.off();
        if (!state.preview) showAuth();
        authMsg('');
        return;
      }
      state.preview = false;
      showApp();
      listen();
    });
  }

  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('focusout', function () {
    if (stale && !isTyping()) { stale = false; render(true); }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeModal();
  });

  try { firebase.initializeApp(FIREBASE_CONFIG); } catch (e) {}
  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
  dbRef = firebase.database().ref('remodel');
  try {
    var saved = sessionStorage.getItem('remodel-view');
    if (saved === 'phases') saved = 'plan';
    if (saved) state.view = saved;
  } catch (e) {}
  bootAuth();

  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.__remodelPreview = function () {
      state.preview = true;
      state.data = Lib.seed();
      showApp();
      syncLabel('This browser only', 'syncing');
      render(false);
    };
  }
})();
