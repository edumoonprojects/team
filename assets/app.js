/* EduMoon Team Portal, phase 1.
   Plain JavaScript, no build step. Data lives in Supabase.
   Who can see and change what is enforced by the database rules in setup/setup.sql;
   the checks in this file only decide which buttons to show. */
(function () {
  'use strict';

  var cfg = window.PORTAL_CONFIG || {};
  var $view = document.getElementById('view');
  var $nav = document.getElementById('nav');
  var $top = document.getElementById('topbar');
  var $modal = document.getElementById('modal-root');
  var $toast = document.getElementById('toast');

  var sb = null;
  var S = { user: null, me: null, people: [], byId: {}, offDays: {}, calMonth: {}, routed: false };
  var seq = 0;

  // ---------- small helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    var a = (p[0] || '?').charAt(0);
    var b = p.length > 1 ? p[p.length - 1].charAt(0) : '';
    return (a + b).toUpperCase();
  }
  function first(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dstr(new Date()); }
  function addDays(s, n) { var d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return dstr(d); }
  function tsDay(ts) { return ts ? dstr(new Date(ts)) : null; }
  function daysBetween(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }
  function fmtDay(s) {
    return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  function fmtLongDay(s) {
    return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function fmtWhen(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    var day = tsDay(ts), gap = daysBetween(day, today());
    if (gap === 0) return 'today, ' + t;
    if (gap === 1) return 'yesterday, ' + t;
    return fmtDay(day) + ', ' + t;
  }
  function monthLabel(m) {
    return new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  function shiftMonth(m, n) {
    var d = new Date(m + '-01T00:00:00'); d.setMonth(d.getMonth() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function monthEnd(m) {
    var d = new Date(m + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return dstr(d);
  }
  function nameOf(id) { var p = S.byId[id]; return p ? p.name : 'Someone'; }
  function firstOf(id) { var p = S.byId[id]; return p ? first(p.name) : 'Someone'; }
  function toast(msg) {
    $toast.textContent = msg; $toast.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.hidden = true; }, 2600);
  }
  function errMsg(e) {
    var m = (e && (e.message || e.error_description)) || 'Something went wrong. Please try again.';
    if (/row-level security/i.test(m)) m = 'You are not allowed to do that.';
    return m;
  }
  async function q(promise) {
    var r = await promise;
    if (r.error) throw r.error;
    return r.data;
  }

  var ICON = {
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>',
    checkin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M8.5 13.5l2.5 2.5 5-5"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5M15.5 14.2c3 .2 6 2.3 6 5.8"/></svg>',
    approvals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="#fff"/><circle cx="15" cy="12" r="2" fill="#fff"/><circle cx="7" cy="18" r="2" fill="#fff"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    left: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>'
  };

  // ---------- what a check-in can say ----------
  var KINDS = {
    video: { label: 'Made a video or reel', work: true, need: 'Which video or reel?' },
    event: { label: 'Hosted an event', work: true, need: 'Event name and roughly how many joined' },
    whatsapp: { label: 'Interacted in the WhatsApp group', work: true, need: '', hint: 'Which group? (optional)' },
    college: { label: 'Talked to a college or students', work: true, need: 'Which college, or who?' },
    other: { label: 'Other work', work: true, need: 'Describe what you did' },
    exams: { label: 'Exams' },
    family: { label: 'Family or personal' },
    unwell: { label: 'Not well' },
    no_task: { label: 'No task given' }
  };
  var WORK_KINDS = ['video', 'event', 'whatsapp', 'college', 'other'];
  var OFF_KINDS = ['exams', 'family', 'unwell', 'no_task'];

  var STATUS = {
    todo: { label: 'To do', cls: '' },
    in_progress: { label: 'In progress', cls: 'warn' },
    waiting: { label: 'Waiting on someone', cls: 'sky' },
    submitted: { label: 'Waiting for approval', cls: 'warn' },
    done: { label: 'Done', cls: 'ok' }
  };

  // ---------- permissions (mirror of the database rules) ----------
  function canSee(p) {
    var m = S.me; if (!p || !m) return false;
    return p.id === m.id ||
      (m.is_admin && !p.is_private) ||
      (m.is_team && p.is_team && !p.is_private) ||
      (m.is_sl_head && p.is_student_lead);
  }
  function canVerify(p) {
    var m = S.me; if (!p || !m) return false;
    if (p.id === m.id) return m.is_admin && m.is_private;
    return (m.is_admin && !p.is_private) || (m.is_sl_head && p.is_student_lead);
  }
  function canSeeCheckins(p) {
    var m = S.me; if (!p || !m) return false;
    return p.id === m.id || (m.is_admin && !p.is_private) || (m.is_sl_head && p.is_student_lead);
  }
  function isLeadOnly(p) { return p.is_student_lead && !p.is_team && !p.is_admin; }
  function canApprove() { return !!(S.me && (S.me.is_admin || S.me.is_sl_head)); }
  function hasTeamView() { return !!(S.me && (S.me.is_admin || S.me.is_team || S.me.is_sl_head)); }
  function visiblePeople() {
    return S.people.filter(function (p) { return p.id !== S.me.id && p.active && canSee(p); });
  }
  function roleLine(p) {
    var bits = [];
    if (p.title) bits.push(p.title);
    if (p.chapter) bits.push(p.chapter);
    return bits.join(' · ');
  }

  // ---------- start ----------
  async function boot() {
    if (!cfg.url || !cfg.anonKey || /YOUR-/.test(cfg.url + cfg.anonKey)) { renderSetupNeeded(); return; }
    if (!window.supabase || !window.supabase.createClient) {
      $view.innerHTML = '<div class="card">Could not load. Check your internet connection and refresh.</div>';
      return;
    }
    sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'SIGNED_OUT') { S.me = null; history.replaceState(null, '', location.pathname); renderLogin(); }
    });
    var res = await sb.auth.getSession();
    var session = res.data && res.data.session;
    if (!session) { renderLogin(); return; }
    await startApp(session.user);
  }

  async function startApp(user) {
    S.user = user;
    $view.innerHTML = '<div class="loading">Loading...</div>';
    try {
      await sb.rpc('claim_profile');
      var me = await q(sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle());
      if (!me || !me.active) { renderNoProfile(user.email); return; }
      S.me = me;
      await Promise.all([loadPeople(), loadOffDays()]);
    } catch (e) {
      $view.innerHTML = '<div class="card err">' + esc(errMsg(e)) + '</div>';
      return;
    }
    renderChrome();
    if (!S.routed) { window.addEventListener('hashchange', route); S.routed = true; }
    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      location.hash = canApprove() ? '#/approvals' : '#/me';
    } else { route(); }
  }

  async function loadPeople() {
    var rows = await q(sb.from('profiles').select('*').order('name'));
    S.people = rows; S.byId = {};
    rows.forEach(function (p) { S.byId[p.id] = p; });
    if (S.me && S.byId[S.me.id]) S.me = S.byId[S.me.id];
  }
  async function loadOffDays() {
    var rows = await q(sb.from('off_days').select('*'));
    S.offDays = {};
    rows.forEach(function (r) { S.offDays[r.day] = r.note || 'Off day'; });
  }

  // ---------- screens outside the app ----------
  function renderSetupNeeded() {
    $top.hidden = true; $nav.hidden = true;
    $view.innerHTML = '<div class="card stack"><h2>Almost ready</h2><p class="muted">Open <b>assets/config.js</b> and paste your Supabase Project URL and anon key. The steps are in README.md.</p></div>';
  }

  function renderLogin() {
    $top.hidden = true; $nav.hidden = true; $modal.innerHTML = '';
    $view.className = '';
    $view.innerHTML =
      '<div class="login"><form class="box" id="login-form" novalidate>' +
      '<div class="row"><img src="assets/logo.png" alt=""><div><h1 style="font-size:24px;font-weight:700">EduMoon Team</h1>' +
      '<div class="muted small">Members only</div></div></div>' +
      '<div class="field"><label class="lbl" for="lg-email">Email</label><input class="input" id="lg-email" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label class="lbl" for="lg-pass">Password</label><input class="input" id="lg-pass" type="password" autocomplete="current-password" required></div>' +
      '<div class="err" id="lg-err" role="alert"></div>' +
      '<button class="btn primary big" type="submit" id="lg-btn">Sign in</button>' +
      '<p class="muted small" style="margin:0">Forgot your password? Ask Vikas or Aparna to reset it.</p>' +
      '</form></div>';
    document.getElementById('login-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var email = document.getElementById('lg-email').value.trim();
      var pass = document.getElementById('lg-pass').value;
      var $err = document.getElementById('lg-err'), $btn = document.getElementById('lg-btn');
      $err.textContent = '';
      if (!email || !pass) { $err.textContent = 'Enter your email and password.'; return; }
      $btn.disabled = true; $btn.textContent = 'Signing in...';
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (r.error) {
        $btn.disabled = false; $btn.textContent = 'Sign in';
        $err.textContent = /invalid/i.test(r.error.message) ? 'Wrong email or password.' : r.error.message;
        return;
      }
      $view.className = 'view';
      await startApp(r.data.user);
    });
  }

  function renderNoProfile(email) {
    $top.hidden = true; $nav.hidden = true;
    $view.className = 'view';
    $view.innerHTML = '<div class="card stack"><h2>Not added yet</h2><p class="muted">The email <b>' + esc(email) +
      '</b> is not on the EduMoon team list. Ask Vikas or Aparna to add it.</p>' +
      '<button class="btn" data-action="signout">Sign out</button></div>';
  }

  // ---------- chrome ----------
  function renderChrome() {
    $view.className = 'view';
    $top.hidden = false;
    $top.innerHTML =
      '<a class="brand" href="#/me"><img src="assets/logo.png" alt=""><b>EduMoon</b><span>Team</span></a>' +
      '<div class="spacer"></div>' +
      '<div class="who"><span class="nm">' + esc(first(S.me.name)) + '</span>' +
      '<button class="btn sm" data-action="signout">Sign out</button></div>';
    var items = [
      ['me', 'My page', ICON.me],
      ['checkin', 'Check-in', ICON.checkin]
    ];
    if (hasTeamView()) items.push(['team', 'Team', ICON.team]);
    if (canApprove()) items.push(['approvals', 'Approvals', ICON.approvals]);
    if (S.me.is_admin) items.push(['admin', 'Admin', ICON.admin]);
    $nav.hidden = false;
    $nav.innerHTML = items.map(function (it) {
      return '<a href="#/' + it[0] + '" data-nav="' + it[0] + '">' + it[2] + '<span>' + it[1] + '</span>' +
        (it[0] === 'approvals' ? '<span class="badge" id="appr-badge" hidden></span>' : '') + '</a>';
    }).join('');
    refreshBadge();
  }
  function markNav(key) {
    [].forEach.call($nav.querySelectorAll('a'), function (a) {
      var on = a.getAttribute('data-nav') === key;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  async function refreshBadge() {
    if (!canApprove()) return;
    try {
      var items = await loadPending();
      var b = document.getElementById('appr-badge');
      if (b) { b.textContent = items.length; b.hidden = items.length === 0; }
    } catch (e) { /* badge is optional */ }
  }

  // ---------- router ----------
  function route() {
    if (!S.me) return;
    closeModal();
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var key = parts[0] || 'me';
    markNav(key === 'person' ? 'team' : key);
    window.scrollTo(0, 0);
    var my = ++seq;
    var go;
    if (key === 'me') go = viewPerson(S.me.id, my);
    else if (key === 'person') go = viewPerson(parts[1], my);
    else if (key === 'checkin') go = viewCheckin(my);
    else if (key === 'team' && hasTeamView()) go = viewTeam(my);
    else if (key === 'approvals' && canApprove()) go = viewApprovals(my);
    else if (key === 'admin' && S.me.is_admin) go = viewAdmin(my);
    else { location.hash = '#/me'; return; }
    $view.innerHTML = '<div class="loading">Loading...</div>';
    Promise.resolve(go).catch(function (e) {
      if (my === seq) $view.innerHTML = '<div class="card err">' + esc(errMsg(e)) + '</div>';
    });
  }
  function rerender() { route(); refreshBadge(); }

  // ---------- day status for the calendar ----------
  function buildDayStatus(person, checkins, tasks) {
    var ci = {}, sub = {}, done = {};
    checkins.forEach(function (c) { ci[c.day] = c; });
    tasks.forEach(function (t) {
      var d = tsDay(t.submitted_at);
      if (!d) return;
      if (t.status === 'done') done[d] = true;
      else if (t.status === 'submitted') sub[d] = true;
    });
    var start = person.start_date || tsDay(person.created_at);
    var t0 = today();
    return function (day) {
      if (day > t0) return 'future';
      if (start && day < start) return 'none';
      var c = ci[day];
      if (c && c.status === 'approved') return 'worked';
      if (done[day]) return 'worked';
      if (c && (c.status === 'pending' || c.status === 'sent_back')) return 'pending';
      if (sub[day]) return 'pending';
      if (c && c.status === 'excused') return 'excused';
      if (S.offDays[day]) return 'excused';
      if (day === t0) return 'today';
      return 'missed';
    };
  }
  function monthCounts(statusOf, month) {
    var n = { worked: 0, pending: 0, excused: 0, missed: 0 };
    var end = monthEnd(month);
    for (var d = month + '-01'; d <= end; d = addDays(d, 1)) {
      var s = statusOf(d);
      if (n[s] != null) n[s]++;
    }
    return n;
  }
  function calendarHtml(pid, month, statusOf) {
    var startDow = (new Date(month + '-01T00:00:00').getDay() + 6) % 7;
    var end = monthEnd(month), cells = '';
    for (var i = 0; i < startDow; i++) cells += '<div class="d-none"></div>';
    var titles = { worked: 'Worked, verified', pending: 'Waiting for verification', excused: 'Excused or off day', missed: 'Nothing logged', today: 'Today', future: '', none: '' };
    for (var d = month + '-01'; d <= end; d = addDays(d, 1)) {
      var s = statusOf(d);
      cells += '<div class="d-' + s + '" title="' + esc(fmtDay(d) + (titles[s] ? ': ' + titles[s] : '')) + '">' + Number(d.slice(8)) + '</div>';
    }
    var c = monthCounts(statusOf, month);
    var canNext = month < today().slice(0, 7);
    return '<div class="card stack">' +
      '<div class="row between"><button class="btn sm" data-action="cal" data-pid="' + pid + '" data-m="' + shiftMonth(month, -1) + '" aria-label="Previous month">' + ICON.left + '</button>' +
      '<div style="text-align:center"><h2 style="font-size:17px;font-weight:600">' + esc(monthLabel(month)) + '</h2>' +
      '<div class="muted small">Worked ' + c.worked + ' · Waiting ' + c.pending + ' · Excused ' + c.excused + ' · Missed ' + c.missed + '</div></div>' +
      '<button class="btn sm" data-action="cal" data-pid="' + pid + '" data-m="' + shiftMonth(month, 1) + '" aria-label="Next month"' + (canNext ? '' : ' disabled') + '>' + ICON.chev + '</button></div>' +
      '<div class="cal-head"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>' +
      '<div class="cal">' + cells + '</div>' +
      '<div class="legend"><span><i style="background:var(--violet)"></i>Worked</span><span><i style="background:var(--lime)"></i>Waiting</span>' +
      '<span><i style="background:#E4E0F0"></i>Excused or off</span><span><i style="background:var(--badbg)"></i>Missed</span></div>' +
      '</div>';
  }

  // ---------- person page (also "My page") ----------
  async function viewPerson(pid, my) {
    var p = S.byId[pid];
    if (!p || !canSee(p)) { $view.innerHTML = '<div class="card">This page is not available.</div>'; return; }
    var self = p.id === S.me.id;
    var showCal = canSeeCheckins(p);
    var month = S.calMonth[pid] || today().slice(0, 7);
    var from = month + '-01';
    var recentFrom = addDays(today(), -14);
    if (recentFrom < from) from = recentFrom;
    var to = monthEnd(month);
    if (today() > to) to = today();

    var res = await Promise.all([
      q(sb.from('tasks').select('*').eq('assignee', pid).order('created_at', { ascending: false }).limit(400)),
      showCal ? q(sb.from('checkins').select('*').eq('person', pid).gte('day', from).lte('day', to).order('day', { ascending: false })) : Promise.resolve([])
    ]);
    if (my !== seq) return;
    var tasks = res[0], checkins = res[1];
    var statusOf = buildDayStatus(p, checkins, tasks);
    var thisMonth = monthCounts(statusOf, today().slice(0, 7));

    var open = tasks.filter(function (t) { return t.status === 'todo' || t.status === 'in_progress' || t.status === 'waiting'; });
    open.sort(function (a, b) {
      var ad = a.due_date || '9999', bd = b.due_date || '9999';
      return ad < bd ? -1 : ad > bd ? 1 : (a.created_at < b.created_at ? -1 : 1);
    });
    var submitted = tasks.filter(function (t) { return t.status === 'submitted'; });
    var done = tasks.filter(function (t) { return t.status === 'done'; })
      .sort(function (a, b) { return (b.verified_at || '') < (a.verified_at || '') ? -1 : 1; }).slice(0, 8);

    var h = '<div class="stack">';
    if (!self) h += '<div><a class="linkbtn" href="#/team" style="text-decoration:none">' + ICON.left.replace('width="18"', 'width="16"') + ' Team</a></div>';

    // hero
    var t0 = today();
    var dueToday = open.filter(function (t) { return t.due_date === t0; }).length;
    var overdue = open.filter(function (t) { return t.due_date && t.due_date < t0; }).length;
    if (self) {
      var hr = new Date().getHours();
      var greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
      var plan;
      if (!open.length) plan = 'Your plate is clear right now. Add a task, or check in to log what you did today.';
      else {
        plan = 'You have ' + open.length + (open.length === 1 ? ' task' : ' tasks') + ' on your plate';
        if (dueToday) plan += ', ' + dueToday + ' due today';
        if (overdue) plan += ', ' + overdue + ' overdue';
        plan += '. Pick one and get going.';
      }
      h += '<section class="hero"><span class="hi">' + greet + '</span>' +
        '<div><h1>Hey ' + esc(first(p.name)) + '</h1>' +
        '<div class="lead" style="margin-top:6px">Welcome to the EduMoon team. Here is your day.</div></div>' +
        '<div class="sub">' + esc(plan) + '</div>';
      var focus = open.slice(0, 3);
      if (focus.length) {
        h += '<div class="focus">' + focus.map(function (t) {
          var when = t.due_date ? (t.due_date < t0 ? 'Overdue' : t.due_date === t0 ? 'Due today' : 'Due ' + fmtDay(t.due_date)) : '';
          return '<a href="#task-' + t.id + '" data-action="jump" data-id="' + t.id + '"><span class="dot"></span><span>' + esc(t.title) + '</span>' +
            (when ? '<span class="when">' + esc(when) + '</span>' : '') + '</a>';
        }).join('') + '</div>';
      }
    } else {
      h += '<section class="hero"><div class="row"><div class="av lg">' + esc(initials(p.name)) + '</div><div style="min-width:0">' +
        '<h1 style="font-size:26px">' + esc(p.name) + '</h1><div class="sub">' + esc(roleLine(p) || (p.is_student_lead ? 'Student Lead' : 'EduMoon team')) + '</div>' +
        (p.em_id ? '<div class="sub tiny">' + esc(p.em_id) + '</div>' : '') + '</div></div>';
    }
    if (showCal) {
      h += '<div class="grid3"><div class="stat"><b>' + thisMonth.worked + '</b><span>Days worked</span></div>' +
        '<div class="stat"><b>' + open.length + '</b><span>Open tasks</span></div>' +
        '<div class="stat"><b>' + submitted.length + '</b><span>For approval</span></div></div>';
    } else {
      h += '<div class="grid2"><div class="stat"><b>' + open.length + '</b><span>Open tasks</span></div>' +
        '<div class="stat"><b>' + submitted.length + '</b><span>For approval</span></div></div>';
    }
    h += '</section>';

    // today's check-in card for myself
    if (self) {
      var todayCi = checkins.filter(function (c) { return c.day === today(); })[0];
      h += '<div class="card row between wrap">' + checkinSummary(todayCi, true) +
        '<a class="btn ' + (todayCi ? '' : 'primary') + '" href="#/checkin">' + (todayCi ? 'Edit check-in' : 'Check in now') + '</a></div>';
    }

    // tasks
    h += '<div class="sec-h"><h2>' + (self ? 'My tasks' : 'Tasks') + '</h2>' +
      '<button class="btn sm sky" data-action="new-task" data-pid="' + pid + '">' + ICON.plus + (self ? 'Add my task' : 'Assign task') + '</button></div>';
    h += '<div class="card flush list">' + (open.length ? open.map(function (t) { return taskHtml(t, p); }).join('') :
      '<div class="empty">No open tasks.</div>') + '</div>';

    if (submitted.length) {
      h += '<div class="sec-h"><h2>Waiting for approval</h2></div><div class="card flush list">' +
        submitted.map(function (t) { return taskHtml(t, p); }).join('') + '</div>';
    }

    if (showCal) h += calendarHtml(pid, month, statusOf);

    if (showCal && !self) {
      var recent = checkins.filter(function (c) { return c.day >= addDays(today(), -14); });
      h += '<div class="sec-h"><h2>Recent check-ins</h2></div><div class="card flush list">' +
        (recent.length ? recent.map(function (c) { return checkinRow(c, p); }).join('') : '<div class="empty">No check-ins in the last two weeks.</div>') + '</div>';
    }

    if (done.length) {
      h += '<div class="sec-h"><h2>Recently done</h2></div><div class="card flush list">' +
        done.map(function (t) { return taskHtml(t, p); }).join('') + '</div>';
    }

    if (self) {
      h += '<details class="card"><summary style="cursor:pointer;font-weight:600">Change my password</summary>' +
        '<form id="pw-form" class="stack" style="margin-top:12px" novalidate>' +
        '<div class="field"><label class="lbl" for="pw1">New password</label><input class="input" id="pw1" type="password" autocomplete="new-password" minlength="8"></div>' +
        '<div class="field"><label class="lbl" for="pw2">Type it again</label><input class="input" id="pw2" type="password" autocomplete="new-password"></div>' +
        '<div class="err" id="pw-err" role="alert"></div><button class="btn primary" type="submit">Save password</button></form></details>';
    }
    h += '</div>';
    $view.innerHTML = h;

    var pw = document.getElementById('pw-form');
    if (pw) pw.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var a = document.getElementById('pw1').value, b = document.getElementById('pw2').value, $e = document.getElementById('pw-err');
      $e.textContent = '';
      if (a.length < 8) { $e.textContent = 'Use at least 8 characters.'; return; }
      if (a !== b) { $e.textContent = 'The two passwords do not match.'; return; }
      var r = await sb.auth.updateUser({ password: a });
      if (r.error) { $e.textContent = r.error.message; return; }
      pw.reset(); toast('Password changed');
    });
  }

  function checkinSummary(c, mine) {
    if (!c) return '<div><div style="font-weight:600">' + (mine ? "You haven't checked in today" : 'No check-in today') + '</div><div class="muted small">Takes 30 seconds.</div></div>';
    var k = KINDS[c.kind] || { label: c.kind };
    return '<div style="min-width:0"><div style="font-weight:600">Today: ' + esc(k.label) + '</div>' +
      (c.detail ? '<div class="muted small">' + esc(c.detail) + '</div>' : '') +
      '<div style="margin-top:4px">' + ciChip(c) + '</div></div>';
  }
  function ciChip(c) {
    if (c.status === 'approved') return '<span class="chip ok">Verified by ' + esc(firstOf(c.verified_by)) + '</span>';
    if (c.status === 'sent_back') return '<span class="chip bad">Sent back by ' + esc(firstOf(c.verified_by)) + '</span>';
    if (c.status === 'excused') return '<span class="chip">Excused</span>';
    return '<span class="chip warn">Waiting for verification</span>';
  }
  function checkinRow(c, p) {
    var k = KINDS[c.kind] || { label: c.kind };
    var h = '<div class="task" data-ci="' + c.id + '"><div class="row between wrap"><div style="min-width:0"><div class="t-title">' + esc(fmtDay(c.day)) + ' · ' + esc(k.label) + '</div>' +
      (c.detail ? '<div class="t-meta">' + esc(c.detail) + '</div>' : '') +
      (c.note ? '<div class="t-meta">Note: ' + esc(c.note) + '</div>' : '') +
      (c.feedback ? '<div class="t-meta">Feedback: ' + esc(c.feedback) + '</div>' : '') +
      '</div>' + ciChip(c) + '</div>';
    if (canVerify(p) && (c.status === 'pending')) {
      h += '<div class="acts"><button class="btn sm primary" data-action="ci-approve" data-id="' + c.id + '">Approve</button>' +
        '<button class="btn sm danger" data-action="ci-back" data-id="' + c.id + '">Send back</button></div>' +
        '<div class="inline-box" data-box="ci-back-' + c.id + '" hidden><label class="lbl" for="fb-' + c.id + '">What should they fix?</label>' +
        '<input class="input" id="fb-' + c.id + '" maxlength="500"><button class="btn sm danger" data-action="ci-back-confirm" data-id="' + c.id + '">Send back</button></div>';
    }
    return h + '</div>';
  }

  function taskAge(t) {
    if (t.status === 'done' || t.status === 'submitted') return '';
    var t0 = today();
    if (t.due_date && t.due_date < t0) {
      var n = daysBetween(t.due_date, t0);
      return '<span class="chip bad">Overdue ' + n + (n === 1 ? ' day' : ' days') + '</span>';
    }
    var c = tsDay(t.created_at);
    if (c && c < t0) {
      var m = daysBetween(c, t0);
      return '<span class="chip ' + (m >= 3 ? 'bad' : '') + '">Pending ' + m + (m === 1 ? ' day' : ' days') + '</span>';
    }
    return '';
  }

  function taskHtml(t, p) {
    var me = S.me, mineToWork = t.assignee === me.id || t.created_by === me.id;
    var verifier = canVerify(p);
    var st = STATUS[t.status] || { label: t.status, cls: '' };
    var selfAdded = t.created_by === t.assignee;
    var meta = [];
    meta.push(selfAdded ? 'Added by ' + (t.assignee === me.id ? 'me' : first(nameOf(t.assignee))) : 'From ' + (t.created_by === me.id ? 'me' : nameOf(t.created_by)));
    if (t.due_date) meta.push('Due ' + fmtDay(t.due_date));

    var h = '<div class="task" data-task="' + t.id + '">' +
      '<div class="row between" style="align-items:flex-start"><div class="t-title">' + esc(t.title) + '</div>' +
      '<span class="chip ' + st.cls + '">' + esc(st.label) + '</span></div>' +
      '<div class="t-meta">' + esc(meta.join(' · ')) + '</div>' +
      (t.details ? '<div class="t-details">' + esc(t.details) + '</div>' : '');
    var chips = taskAge(t) + (selfAdded ? '<span class="chip sky">Self-added</span>' : '');
    if (t.status === 'done' && t.verified_by) chips += '<span class="chip ok">Verified by ' + esc(firstOf(t.verified_by)) + ' · ' + esc(fmtWhen(t.verified_at)) + '</span>';
    if (chips) h += '<div class="row wrap" style="gap:6px">' + chips + '</div>';

    var acts = '';
    var isOpen = t.status === 'todo' || t.status === 'in_progress' || t.status === 'waiting';
    if (isOpen && (mineToWork || verifier)) {
      acts += '<label class="sr" for="st-' + t.id + '">Status</label><select class="input" id="st-' + t.id + '" data-action="task-status" data-id="' + t.id + '">' +
        ['todo', 'in_progress', 'waiting'].map(function (s) {
          return '<option value="' + s + '"' + (s === t.status ? ' selected' : '') + '>' + STATUS[s].label + '</option>';
        }).join('') + '</select>';
      if (verifier) acts += '<button class="btn sm primary" data-action="task-done" data-id="' + t.id + '">Mark done</button>';
      else acts += '<button class="btn sm primary" data-action="task-submit" data-id="' + t.id + '">Submit as done</button>';
    }
    if (t.status === 'submitted') {
      if (verifier) acts += '<button class="btn sm primary" data-action="task-approve" data-id="' + t.id + '">Approve</button>' +
        '<button class="btn sm danger" data-action="task-back" data-id="' + t.id + '">Send back</button>';
      else acts += '<span class="muted small">Submitted ' + esc(fmtWhen(t.submitted_at)) + '</span>';
    }
    acts += '<button class="linkbtn" data-action="comments" data-id="' + t.id + '">Comments</button>';
    if (t.created_by === me.id || me.is_admin) acts += '<button class="linkbtn danger" style="color:var(--bad)" data-action="task-delete" data-id="' + t.id + '">Delete</button>';
    h += '<div class="acts">' + acts + '</div>';

    h += '<div class="inline-box" data-box="submit-' + t.id + '" hidden><label class="lbl" for="sn-' + t.id + '">Link or note for the approver (optional)</label>' +
      '<input class="input" id="sn-' + t.id + '" maxlength="2000" placeholder="e.g. Drive link to the final reel">' +
      '<button class="btn sm primary" data-action="task-submit-confirm" data-id="' + t.id + '">Submit</button></div>';
    h += '<div class="inline-box" data-box="back-' + t.id + '" hidden><label class="lbl" for="bk-' + t.id + '">What should they fix?</label>' +
      '<input class="input" id="bk-' + t.id + '" maxlength="2000"><button class="btn sm danger" data-action="task-back-confirm" data-id="' + t.id + '">Send back</button></div>';
    h += '<div class="comments" data-box="comments-' + t.id + '" hidden></div>';
    return h + '</div>';
  }

  async function loadComments(taskId) {
    var box = document.querySelector('[data-box="comments-' + taskId + '"]');
    if (!box) return;
    box.innerHTML = '<div class="muted small">Loading...</div>';
    var rows = await q(sb.from('task_comments').select('*').eq('task_id', taskId).order('created_at'));
    box.innerHTML = (rows.length ? rows.map(function (c) {
      return '<div class="cm"><b>' + esc(nameOf(c.author)) + '</b><span class="tiny">' + esc(fmtWhen(c.created_at)) + '</span><p>' + esc(c.body) + '</p></div>';
    }).join('') : '<div class="muted small">No comments yet.</div>') +
      '<div class="row"><label class="sr" for="cm-' + taskId + '">Write a comment</label><input class="input" id="cm-' + taskId + '" maxlength="2000" placeholder="Write a comment">' +
      '<button class="btn sm primary" data-action="comment-post" data-id="' + taskId + '">Post</button></div>';
  }

  // ---------- new task form ----------
  function openTaskForm(pid) {
    var options = S.people.filter(function (p) { return p.active && canSee(p); })
      .sort(function (a, b) { return a.id === S.me.id ? -1 : b.id === S.me.id ? 1 : a.name.localeCompare(b.name); });
    $modal.innerHTML = '<div class="modal-bg" data-action="modal-close-bg"><form class="modal stack" id="task-form" novalidate role="dialog" aria-modal="true" aria-labelledby="tf-h">' +
      '<div class="row between"><h2 id="tf-h" style="font-size:20px">' + (pid === S.me.id ? 'Add a task' : 'Assign a task') + '</h2>' +
      '<button type="button" class="btn sm" data-action="modal-close">Close</button></div>' +
      '<div class="field"><label class="lbl" for="tf-title">Task</label><input class="input" id="tf-title" maxlength="200" placeholder="e.g. Edit Nutraahi launch reel"></div>' +
      '<div class="field"><label class="lbl" for="tf-who">For</label><select class="input" id="tf-who">' +
      options.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === pid ? ' selected' : '') + '>' + esc(p.id === S.me.id ? p.name + ' (me)' : p.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label class="lbl" for="tf-due">Due date (optional)</label><input class="input" id="tf-due" type="date" min="' + today() + '"></div>' +
      '<div class="field"><label class="lbl" for="tf-details">Details (optional)</label><textarea class="input" id="tf-details" maxlength="2000"></textarea></div>' +
      '<div class="err" id="tf-err" role="alert"></div>' +
      '<button class="btn primary big" type="submit">Save task</button></form></div>';
    document.getElementById('tf-title').focus();
    document.getElementById('task-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var title = document.getElementById('tf-title').value.trim();
      var $e = document.getElementById('tf-err');
      $e.textContent = '';
      if (!title) { $e.textContent = 'Write what the task is.'; return; }
      var row = {
        title: title,
        assignee: document.getElementById('tf-who').value,
        due_date: document.getElementById('tf-due').value || null,
        details: document.getElementById('tf-details').value.trim() || null
      };
      try { await q(sb.from('tasks').insert(row)); } catch (e) { $e.textContent = errMsg(e); return; }
      closeModal(); toast('Task saved'); rerender();
    });
  }
  function closeModal() { $modal.innerHTML = ''; }

  // ---------- check-in ----------
  async function viewCheckin(my) {
    var rows = await q(sb.from('checkins').select('*').eq('person', S.me.id).order('day', { ascending: false }).limit(14));
    if (my !== seq) return;
    var day = S.ciDay || today();
    if (day !== today() && day !== addDays(today(), -1)) day = today();
    var cur = rows.filter(function (r) { return r.day === day; })[0];
    var locked = cur && cur.status === 'approved';
    var sel = cur ? cur.kind : '';

    function opt(k) {
      return '<label class="opt' + (sel === k ? ' sel' : '') + '"><input type="radio" name="kind" value="' + k + '"' + (sel === k ? ' checked' : '') + (locked ? ' disabled' : '') + '><span style="font-weight:' + (sel === k ? 600 : 500) + '">' + esc(KINDS[k].label) + '</span></label>';
    }
    var need = sel && KINDS[sel] ? (KINDS[sel].need || KINDS[sel].hint || '') : '';
    var h = '<div class="stack">' +
      '<div><div class="muted small" style="font-weight:600">' + esc(fmtLongDay(day)) + '</div><h1 style="font-size:26px;font-weight:700;letter-spacing:-.3px">' + (day === today() ? "Today's check-in" : "Yesterday's check-in") + '</h1>' +
      '<div class="muted">Hi ' + esc(first(S.me.name)) + ', what did ' + (day === today() ? 'today' : 'yesterday') + ' look like?</div></div>' +
      '<div class="row"><button class="btn sm' + (day === today() ? ' primary' : '') + '" data-action="ci-day" data-day="' + today() + '">Today</button>' +
      '<button class="btn sm' + (day !== today() ? ' primary' : '') + '" data-action="ci-day" data-day="' + addDays(today(), -1) + '">Yesterday</button></div>';
    if (cur) h += '<div class="card">' + checkinSummary(cur, true).replace('Today:', 'Saved:') + '</div>';
    if (locked) {
      h += '<div class="card muted">This check-in is verified, so it can no longer be changed.</div>';
    } else {
      h += '<form id="ci-form" class="stack" novalidate>' +
        '<fieldset class="opts" style="border:0;padding:0;margin:0"><legend style="font-weight:600;color:var(--ok);margin-bottom:8px">I worked</legend>' + WORK_KINDS.map(opt).join('') + '</fieldset>' +
        '<div class="field" id="ci-detail-wrap"' + (need ? '' : ' hidden') + '><label class="lbl" for="ci-detail" id="ci-detail-lbl">' + esc(need) + '</label><input class="input" id="ci-detail" maxlength="500" value="' + esc(cur ? cur.detail : '') + '"></div>' +
        '<fieldset class="opts two" style="border:0;padding:0;margin:0"><legend style="font-weight:600;color:var(--muted);margin-bottom:8px">I didn\'t work</legend>' + OFF_KINDS.map(opt).join('') + '</fieldset>' +
        '<div class="muted tiny">Your reason is only seen by Vikas, Aparna' + (S.me.is_student_lead ? ' and Srivalli' : '') + '.</div>' +
        '<div class="field"><label class="lbl" for="ci-note">Anything else? (optional)</label><textarea class="input" id="ci-note" maxlength="1000">' + esc(cur ? cur.note : '') + '</textarea></div>' +
        '<div class="err" id="ci-err" role="alert"></div>' +
        '<button class="btn primary big" type="submit">' + (cur ? 'Update check-in' : 'Submit check-in') + '</button></form>';
    }
    var past = rows.filter(function (r) { return r.day !== day; }).slice(0, 7);
    if (past.length) {
      h += '<div class="sec-h"><h2>My last few days</h2></div><div class="card flush list">' + past.map(function (c) {
        var k = KINDS[c.kind] || { label: c.kind };
        return '<div class="task"><div class="row between wrap"><div style="min-width:0"><div class="t-title" style="font-size:14.5px">' + esc(fmtDay(c.day)) + ' · ' + esc(k.label) + '</div>' +
          (c.detail ? '<div class="t-meta">' + esc(c.detail) + '</div>' : '') +
          (c.feedback ? '<div class="t-meta">Feedback: ' + esc(c.feedback) + '</div>' : '') + '</div>' + ciChip(c) + '</div></div>';
      }).join('') + '</div>';
    }
    h += '</div>';
    $view.innerHTML = h;

    var form = document.getElementById('ci-form');
    if (!form) return;
    form.addEventListener('change', function (ev) {
      if (ev.target.name !== 'kind') return;
      var k = ev.target.value;
      [].forEach.call(form.querySelectorAll('.opt'), function (o) {
        var on = o.querySelector('input').checked;
        o.classList.toggle('sel', on);
        o.querySelector('span').style.fontWeight = on ? 600 : 500;
      });
      var label = KINDS[k].need || KINDS[k].hint || '';
      document.getElementById('ci-detail-wrap').hidden = !label;
      document.getElementById('ci-detail-lbl').textContent = label;
      document.getElementById('ci-err').textContent = '';
    });
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var picked = form.querySelector('input[name="kind"]:checked');
      var $e = document.getElementById('ci-err');
      $e.textContent = '';
      if (!picked) { $e.textContent = 'Pick one option.'; return; }
      var k = picked.value;
      var detail = document.getElementById('ci-detail').value.trim();
      if (KINDS[k].need && !detail) { $e.textContent = KINDS[k].need + ' Please fill this in.'; document.getElementById('ci-detail').focus(); return; }
      if (!KINDS[k].work) detail = '';
      var note = document.getElementById('ci-note').value.trim();
      var row = { kind: k, detail: detail || null, note: note || null };
      try {
        if (cur) await q(sb.from('checkins').update(row).eq('id', cur.id));
        else { row.person = S.me.id; row.day = day; await q(sb.from('checkins').insert(row)); }
      } catch (e) { $e.textContent = errMsg(e); return; }
      toast('Check-in saved');
      S.ciDay = null;
      location.hash = '#/me';
    });
  }

  // ---------- approvals ----------
  async function loadPending() {
    var res = await Promise.all([
      q(sb.from('checkins').select('*').eq('status', 'pending').order('day', { ascending: false }).limit(300)),
      q(sb.from('tasks').select('*').eq('status', 'submitted').order('submitted_at').limit(300))
    ]);
    var items = [];
    res[0].forEach(function (c) { var p = S.byId[c.person]; if (canVerify(p)) items.push({ type: 'ci', row: c, p: p, at: c.updated_at }); });
    res[1].forEach(function (t) { var p = S.byId[t.assignee]; if (canVerify(p)) items.push({ type: 'task', row: t, p: p, at: t.submitted_at }); });
    items.sort(function (a, b) { return (a.at || '') < (b.at || '') ? -1 : 1; });
    return items;
  }

  async function viewApprovals(my) {
    var res = await Promise.all([
      loadPending(),
      q(sb.from('checkins').select('*').in('status', ['approved', 'sent_back']).not('verified_at', 'is', null).order('verified_at', { ascending: false }).limit(25)),
      q(sb.from('tasks').select('*').eq('status', 'done').not('verified_at', 'is', null).order('verified_at', { ascending: false }).limit(25))
    ]);
    if (my !== seq) return;
    var items = res[0];
    var teamN = items.filter(function (i) { return !isLeadOnly(i.p); }).length;
    var recent = [];
    res[1].forEach(function (c) { recent.push({ type: 'ci', row: c, p: S.byId[c.person], at: c.verified_at }); });
    res[2].forEach(function (t) { recent.push({ type: 'task', row: t, p: S.byId[t.assignee], at: t.verified_at }); });
    recent = recent.filter(function (r) { return r.p && canSee(r.p); })
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 25);

    var h = '<div class="stack"><div><div class="muted small" style="font-weight:600">Hello, ' + esc(first(S.me.name)) + '</div>' +
      '<h1 style="font-size:26px;font-weight:700;letter-spacing:-.3px">Approvals</h1></div>' +
      '<div class="grid3"><div class="stat" style="background:var(--violet);color:#fff"><b>' + items.length + '</b><span style="color:#EDE7FF">Waiting</span></div>' +
      '<div class="stat" style="background:var(--lime)"><b>' + teamN + '</b><span style="color:var(--ink)">Team</span></div>' +
      '<div class="stat" style="background:var(--pink)"><b>' + (items.length - teamN) + '</b><span style="color:var(--ink)">Student Leads</span></div></div>' +
      '<div class="sec-h"><h2>Waiting for you</h2>' + (items.length > 1 ? '<button class="btn sm" data-action="approve-all">Approve all</button>' : '') + '</div>';
    h += items.length ? '<div class="stack">' + items.map(approvalCard).join('') + '</div>' :
      '<div class="card empty">All caught up. Nothing is waiting for you.</div>';

    h += '<div class="sec-h"><h2>Recently verified</h2></div><div class="card flush list">' +
      (recent.length ? recent.map(function (r) {
        var what = r.type === 'ci' ? (KINDS[r.row.kind] || { label: r.row.kind }).label + (r.row.detail ? ': ' + r.row.detail : '') : r.row.title;
        var chip = r.type === 'ci' && r.row.status === 'sent_back' ?
          '<span class="chip bad">Sent back by ' + esc(firstOf(r.row.verified_by)) + ' · ' + esc(fmtWhen(r.at)) + '</span>' :
          '<span class="chip ok">Verified by ' + esc(firstOf(r.row.verified_by)) + ' · ' + esc(fmtWhen(r.at)) + '</span>';
        return '<div class="task"><div style="font-weight:600;font-size:14.5px">' + esc(first(r.p.name)) + ' · ' + esc(what) + '</div><div>' + chip + '</div></div>';
      }).join('') : '<div class="empty">Nothing verified yet.</div>') + '</div></div>';
    $view.innerHTML = h;
  }

  function approvalCard(i) {
    var p = i.p, r = i.row, head, body;
    if (i.type === 'ci') {
      var k = KINDS[r.kind] || { label: r.kind };
      head = 'Check-in · ' + fmtDay(r.day);
      body = '<div style="font-size:15px;font-weight:500">' + esc(k.label) + (r.detail ? ': ' + esc(r.detail) : '') + '</div>' +
        (r.note ? '<div class="muted small">Note: ' + esc(r.note) + '</div>' : '');
    } else {
      head = 'Task done · ' + fmtWhen(r.submitted_at);
      body = '<div style="font-size:15px;font-weight:500">' + esc(r.title) + '</div>' +
        '<div class="muted small">' + (r.created_by === r.assignee ? 'Self-added' : 'From ' + esc(nameOf(r.created_by))) + '</div>' +
        '<button class="linkbtn" style="align-self:flex-start" data-action="comments" data-id="' + r.id + '">See comments and links</button>' +
        '<div class="comments" data-box="comments-' + r.id + '" hidden></div>';
    }
    var a = i.type === 'ci' ? 'ci' : 'task';
    return '<div class="card stack" style="gap:10px"><div class="row"><div class="av">' + esc(initials(p.name)) + '</div><div style="min-width:0">' +
      '<div style="font-weight:600">' + esc(p.name) + '</div><div class="muted tiny">' + esc((isLeadOnly(p) ? 'Student Lead' : 'Team') + ' · ' + head) + '</div></div></div>' +
      body +
      '<div class="grid2"><button class="btn primary" data-action="' + a + '-approve" data-id="' + r.id + '">Approve</button>' +
      '<button class="btn danger" data-action="' + a + '-back" data-id="' + r.id + '">Send back</button></div>' +
      '<div class="inline-box" data-box="' + (a === 'ci' ? 'ci-back-' : 'back-') + r.id + '" hidden><label class="lbl" for="' + (a === 'ci' ? 'fb-' : 'bk-') + r.id + '">What should they fix?</label>' +
      '<input class="input" id="' + (a === 'ci' ? 'fb-' : 'bk-') + r.id + '" maxlength="500"><button class="btn sm danger" data-action="' + a + '-back-confirm" data-id="' + r.id + '">Send back</button></div></div>';
  }

  // ---------- team ----------
  async function viewTeam(my) {
    var people = visiblePeople();
    var month = today().slice(0, 7);
    var res = await Promise.all([
      q(sb.from('tasks').select('assignee,status').neq('status', 'done').limit(2000)),
      q(sb.from('checkins').select('person,day,status').gte('day', month + '-01').limit(5000))
    ]);
    if (my !== seq) return;
    var open = {}, waiting = {}, worked = {}, todayCi = {};
    res[0].forEach(function (t) {
      if (t.status === 'submitted') waiting[t.assignee] = (waiting[t.assignee] || 0) + 1;
      else open[t.assignee] = (open[t.assignee] || 0) + 1;
    });
    res[1].forEach(function (c) {
      if (c.status === 'approved') worked[c.person] = (worked[c.person] || 0) + 1;
      if (c.day === today()) todayCi[c.person] = c;
    });
    function card(p) {
      var line = [];
      line.push((open[p.id] || 0) + ' open');
      if (waiting[p.id]) line.push(waiting[p.id] + ' to approve');
      var extra = '';
      if (canSeeCheckins(p)) {
        var c = todayCi[p.id];
        extra = '<div class="row wrap" style="gap:6px;margin-top:4px">' +
          (c ? ciChip(c).replace('Waiting for verification', 'Checked in, waiting') : '<span class="chip">No check-in today</span>') +
          '<span class="chip sky">' + (worked[p.id] || 0) + ' days this month</span></div>';
      }
      return '<a class="person" href="#/person/' + p.id + '"><div class="av">' + esc(initials(p.name)) + '</div><div style="min-width:0">' +
        '<div class="nm">' + esc(p.name) + '</div><div class="muted small">' + esc(roleLine(p) || (p.is_student_lead ? 'Student Lead' : '')) + '</div>' +
        '<div class="muted small">' + esc(line.join(' · ')) + '</div>' + extra + '</div><span class="chev">' + ICON.chev + '</span></a>';
    }
    var team = people.filter(function (p) { return p.is_team || p.is_admin; });
    var teamIds = {}; team.forEach(function (p) { teamIds[p.id] = 1; });
    var leads = people.filter(function (p) { return p.is_student_lead && !teamIds[p.id]; });
    var h = '<div class="stack"><div class="row between"><h1 style="font-size:26px;font-weight:700;letter-spacing:-.3px">Team</h1>' +
      '<button class="btn sm sky" data-action="new-task" data-pid="">' + ICON.plus + 'Assign task</button></div>';
    if (team.length) h += '<div class="sec-h"><h2>EduMoon team</h2></div><div class="card flush list">' + team.map(card).join('') + '</div>';
    if (leads.length) h += '<div class="sec-h"><h2>Student Leads</h2></div><div class="card flush list">' + leads.map(card).join('') + '</div>';
    if (!team.length && !leads.length) h += '<div class="card empty">No one to show yet.</div>';
    $view.innerHTML = h + '</div>';
  }

  // ---------- admin ----------
  async function viewAdmin(my) {
    await Promise.all([loadPeople(), loadOffDays()]);
    if (my !== seq) return;
    var people = S.people.slice().sort(function (a, b) {
      var ga = a.is_admin ? 0 : a.is_team ? 1 : 2, gb = b.is_admin ? 0 : b.is_team ? 1 : 2;
      return ga - gb || a.name.localeCompare(b.name);
    });
    var t0 = today();
    var offs = Object.keys(S.offDays).sort().filter(function (d) { return d >= addDays(t0, -30); });
    function roles(p) {
      var r = [];
      if (p.is_admin) r.push('<span class="chip navy">Admin</span>');
      if (p.is_team) r.push('<span class="chip sky">Team</span>');
      if (p.is_student_lead) r.push('<span class="chip">Student Lead</span>');
      if (p.is_sl_head) r.push('<span class="chip warn">Lead Head</span>');
      if (p.is_private) r.push('<span class="chip">Private</span>');
      if (!p.active) r.push('<span class="chip bad">Inactive</span>');
      return r.join(' ');
    }
    var h = '<div class="stack"><div class="row between"><h1 style="font-size:26px;font-weight:700;letter-spacing:-.3px">Admin</h1>' +
      '<button class="btn sm sky" data-action="person-edit" data-id="">' + ICON.plus + 'Add person</button></div>' +
      '<details class="card"><summary style="cursor:pointer;font-weight:600">How to give someone a login</summary><ol class="small" style="margin:10px 0 0;padding-left:20px;line-height:1.7">' +
      '<li>Make sure the person is in the list below with their email (Add person or Edit).</li>' +
      '<li>Open Supabase, go to <b>Authentication</b>, then <b>Users</b>, then <b>Add user</b>, then <b>Create new user</b>.</li>' +
      '<li>Type the same email and a password, tick <b>Auto Confirm User</b>, and create.</li>' +
      '<li>Send them the link to this site and their password on WhatsApp. They can change it from My page.</li>' +
      '<li>To reset a forgotten password: Supabase, Authentication, Users, open the person, and set a new password.</li></ol></details>' +
      '<div class="sec-h"><h2>People (' + people.length + ')</h2></div><div class="card flush list">' +
      people.map(function (p) {
        return '<div class="person" style="align-items:flex-start"><div class="av">' + esc(initials(p.name)) + '</div><div style="min-width:0;flex:1">' +
          '<div class="nm">' + esc(p.name) + '</div><div class="muted small">' + esc(roleLine(p)) + '</div>' +
          '<div class="small" style="margin:2px 0">' + (p.email ? esc(p.email) : '<span style="color:var(--bad);font-weight:600">No email yet</span>') +
          (p.user_id ? ' · <span style="color:var(--ok);font-weight:600">Has logged in</span>' : (p.email ? ' · <span class="muted">Not logged in yet</span>' : '')) + '</div>' +
          '<div class="row wrap" style="gap:6px">' + roles(p) + '</div></div>' +
          '<button class="btn sm" data-action="person-edit" data-id="' + p.id + '">Edit</button></div>';
      }).join('') + '</div>' +
      '<div class="sec-h"><h2>Team off days</h2></div><div class="card stack">' +
      '<p class="muted small" style="margin:0">Festivals or holidays when nobody is expected to work. These days count as excused for everyone.</p>' +
      '<form id="off-form" class="row wrap" novalidate><label class="sr" for="off-day">Date</label><input class="input" id="off-day" type="date" style="width:auto;flex:1;min-width:150px">' +
      '<label class="sr" for="off-note">Reason</label><input class="input" id="off-note" placeholder="e.g. Diwali" maxlength="80" style="flex:2;min-width:150px">' +
      '<button class="btn primary" type="submit">Add</button></form><div class="err" id="off-err" role="alert"></div>' +
      (offs.length ? '<div class="list">' + offs.map(function (d) {
        return '<div class="row between" style="padding:8px 0"><span><b>' + esc(fmtDay(d)) + '</b> <span class="muted">' + esc(S.offDays[d]) + '</span></span>' +
          '<button class="linkbtn" style="color:var(--bad)" data-action="off-del" data-day="' + d + '">Remove</button></div>';
      }).join('') + '</div>' : '<div class="muted small">No off days added.</div>') +
      '</div></div>';
    $view.innerHTML = h;

    document.getElementById('off-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var d = document.getElementById('off-day').value, n = document.getElementById('off-note').value.trim();
      var $e = document.getElementById('off-err'); $e.textContent = '';
      if (!d) { $e.textContent = 'Pick a date.'; return; }
      try { await q(sb.from('off_days').upsert({ day: d, note: n || null })); } catch (e) { $e.textContent = errMsg(e); return; }
      toast('Off day added'); rerender();
    });
  }

  function openPersonForm(id) {
    var p = id ? S.byId[id] : { name: '', email: '', title: '', chapter: '', em_id: '', active: true, start_date: today() };
    function cb(key, label) {
      return '<label><input type="checkbox" id="pf-' + key + '"' + (p[key] ? ' checked' : '') + '>' + label + '</label>';
    }
    $modal.innerHTML = '<div class="modal-bg" data-action="modal-close-bg"><form class="modal stack" id="person-form" novalidate role="dialog" aria-modal="true" aria-labelledby="pf-h">' +
      '<div class="row between"><h2 id="pf-h" style="font-size:20px">' + (id ? 'Edit person' : 'Add person') + '</h2><button type="button" class="btn sm" data-action="modal-close">Close</button></div>' +
      '<div class="field"><label class="lbl" for="pf-name">Full name</label><input class="input" id="pf-name" maxlength="120" value="' + esc(p.name) + '"></div>' +
      '<div class="field"><label class="lbl" for="pf-email">Email (used to log in)</label><input class="input" id="pf-email" type="email" value="' + esc(p.email) + '"></div>' +
      '<div class="field"><label class="lbl" for="pf-title">Role or work (shown on their card)</label><input class="input" id="pf-title" maxlength="120" placeholder="e.g. Video editor" value="' + esc(p.title) + '"></div>' +
      '<div class="field"><label class="lbl" for="pf-chapter">College (for Student Leads)</label><input class="input" id="pf-chapter" maxlength="120" value="' + esc(p.chapter) + '"></div>' +
      '<div class="field"><label class="lbl" for="pf-emid">EduMoon ID (optional)</label><input class="input" id="pf-emid" maxlength="40" placeholder="EM-26-VZG-AUW-001" value="' + esc(p.em_id) + '"></div>' +
      '<div class="field"><label class="lbl" for="pf-start">Tracking starts on</label><input class="input" id="pf-start" type="date" value="' + esc(p.start_date || today()) + '"></div>' +
      '<div><div class="lbl">Groups</div><div class="checks">' +
      cb('is_team', 'Paid team') + cb('is_student_lead', 'Student Lead') + cb('is_sl_head', 'Student Lead Head') + cb('is_admin', 'Admin') +
      cb('is_private', 'Private page') + cb('active', 'Active') + '</div>' +
      '<p class="muted tiny" style="margin:8px 0 0">Admins see and approve everyone. An admin who is not ticked as Paid team is seen only by the other admins. Lead Head sees and approves Student Leads. Paid team members see each other. A private page is seen by nobody else.</p></div>' +
      '<div class="err" id="pf-err" role="alert"></div><button class="btn primary big" type="submit">Save</button></form></div>';
    document.getElementById('pf-name').focus();
    document.getElementById('person-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var $e = document.getElementById('pf-err'); $e.textContent = '';
      function v(k) { return document.getElementById('pf-' + k).value.trim(); }
      function c(k) { return document.getElementById('pf-' + k).checked; }
      var row = {
        name: v('name'), email: v('email').toLowerCase() || null, title: v('title') || null, chapter: v('chapter') || null,
        em_id: v('emid') || null, start_date: v('start') || today(),
        is_team: c('is_team'), is_student_lead: c('is_student_lead'), is_sl_head: c('is_sl_head'),
        is_admin: c('is_admin'), is_private: c('is_private'), active: c('active')
      };
      if (!row.name) { $e.textContent = 'Enter a name.'; return; }
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) { $e.textContent = 'That email does not look right.'; return; }
      if (id === S.me.id && !row.is_admin) { $e.textContent = 'You cannot remove your own admin access.'; return; }
      try {
        if (id) await q(sb.from('profiles').update(row).eq('id', id));
        else await q(sb.from('profiles').insert(row));
      } catch (e) {
        $e.textContent = /duplicate|unique/i.test(e.message || '') ? 'Someone else already has this email.' : errMsg(e); return;
      }
      closeModal(); toast('Saved'); await loadPeople(); renderChrome(); rerender();
    });
  }

  // ---------- one click handler for everything ----------
  function box(name) { return document.querySelector('[data-box="' + name + '"]'); }

  async function act(fn, btn) {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { toast(errMsg(e)); if (btn) btn.disabled = false; return false; }
    return true;
  }

  document.addEventListener('click', async function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var a = el.getAttribute('data-action'), id = el.getAttribute('data-id');
    if (el.tagName === 'SELECT') return;
    if (a === 'modal-close-bg') { if (ev.target === el) closeModal(); return; }
    ev.preventDefault();

    if (a === 'signout') { await sb.auth.signOut(); return; }
    if (a === 'modal-close') { closeModal(); return; }
    if (a === 'new-task') { openTaskForm(el.getAttribute('data-pid') || S.me.id); return; }
    if (a === 'person-edit') { openPersonForm(id); return; }
    if (a === 'cal') { S.calMonth[el.getAttribute('data-pid')] = el.getAttribute('data-m'); route(); return; }
    if (a === 'ci-day') { S.ciDay = el.getAttribute('data-day'); route(); return; }
    if (a === 'jump') {
      var tEl = document.querySelector('[data-task="' + id + '"]');
      if (tEl) {
        tEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tEl.style.background = 'var(--lav)';
        setTimeout(function () { tEl.style.background = ''; }, 1400);
      }
      return;
    }

    if (a === 'comments') {
      var b = box('comments-' + id);
      if (!b) return;
      b.hidden = !b.hidden;
      if (!b.hidden) await act(function () { return loadComments(id); });
      return;
    }
    if (a === 'comment-post') {
      var inp = document.getElementById('cm-' + id), body = inp.value.trim();
      if (!body) { inp.focus(); return; }
      if (await act(function () { return q(sb.from('task_comments').insert({ task_id: id, author: S.me.id, body: body })); }, el)) await loadComments(id);
      return;
    }

    if (a === 'task-submit') { var sbx = box('submit-' + id); sbx.hidden = !sbx.hidden; if (!sbx.hidden) document.getElementById('sn-' + id).focus(); return; }
    if (a === 'task-submit-confirm') {
      var note = document.getElementById('sn-' + id).value.trim();
      if (await act(async function () {
        await q(sb.from('tasks').update({ status: 'submitted' }).eq('id', id));
        if (note) await q(sb.from('task_comments').insert({ task_id: id, author: S.me.id, body: note }));
      }, el)) { toast('Sent for approval'); rerender(); }
      return;
    }
    if (a === 'task-done' || a === 'task-approve') {
      if (await act(function () { return q(sb.from('tasks').update({ status: 'done' }).eq('id', id)); }, el)) { toast(a === 'task-done' ? 'Marked done' : 'Approved'); rerender(); }
      return;
    }
    if (a === 'task-back') { var bb = box('back-' + id); bb.hidden = !bb.hidden; if (!bb.hidden) document.getElementById('bk-' + id).focus(); return; }
    if (a === 'task-back-confirm') {
      var why = document.getElementById('bk-' + id).value.trim();
      if (!why) { document.getElementById('bk-' + id).focus(); return; }
      if (await act(async function () {
        await q(sb.from('tasks').update({ status: 'in_progress' }).eq('id', id));
        await q(sb.from('task_comments').insert({ task_id: id, author: S.me.id, body: 'Sent back: ' + why }));
      }, el)) { toast('Sent back'); rerender(); }
      return;
    }
    if (a === 'task-delete') {
      if (el.getAttribute('data-sure') !== '1') { el.setAttribute('data-sure', '1'); el.textContent = 'Tap again to delete'; return; }
      if (await act(function () { return q(sb.from('tasks').delete().eq('id', id)); }, el)) { toast('Deleted'); rerender(); }
      return;
    }

    if (a === 'ci-approve') {
      if (await act(function () { return q(sb.from('checkins').update({ status: 'approved' }).eq('id', id)); }, el)) { toast('Approved'); rerender(); }
      return;
    }
    if (a === 'ci-back') { var cb = box('ci-back-' + id); cb.hidden = !cb.hidden; if (!cb.hidden) document.getElementById('fb-' + id).focus(); return; }
    if (a === 'ci-back-confirm') {
      var fb = document.getElementById('fb-' + id).value.trim();
      if (!fb) { document.getElementById('fb-' + id).focus(); return; }
      if (await act(function () { return q(sb.from('checkins').update({ status: 'sent_back', feedback: fb }).eq('id', id)); }, el)) { toast('Sent back'); rerender(); }
      return;
    }
    if (a === 'approve-all') {
      if (el.getAttribute('data-sure') !== '1') { el.setAttribute('data-sure', '1'); el.textContent = 'Tap again to approve all'; return; }
      var ok = await act(async function () {
        var items = await loadPending();
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (it.type === 'ci') await q(sb.from('checkins').update({ status: 'approved' }).eq('id', it.row.id));
          else await q(sb.from('tasks').update({ status: 'done' }).eq('id', it.row.id));
        }
      }, el);
      if (ok) { toast('All approved'); rerender(); }
      return;
    }
    if (a === 'off-del') {
      if (await act(function () { return q(sb.from('off_days').delete().eq('day', el.getAttribute('data-day'))); }, el)) { toast('Removed'); rerender(); }
      return;
    }
  });

  document.addEventListener('change', async function (ev) {
    var el = ev.target;
    if (el.getAttribute('data-action') !== 'task-status') return;
    var id = el.getAttribute('data-id');
    var ok = await act(function () { return q(sb.from('tasks').update({ status: el.value }).eq('id', id)); });
    if (ok) { toast('Status updated'); rerender(); }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && $modal.innerHTML) closeModal();
  });

  boot();
})();
