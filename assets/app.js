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
  var S = { user: null, me: null, people: [], byId: {}, offDays: {}, calMonth: {}, routed: false, rules: {}, ruleList: [], lbPeriod: 'month', evFilter: 'all' };
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
  // short display name: the person's short name if set, else the first word that is not an initial
  function first(name) {
    var p = S.byName && S.byName[name];
    if (p && p.short_name) return p.short_name;
    var parts = String(name || '').trim().split(/\s+/);
    for (var i = 0; i < parts.length; i++) { if (parts[i].replace(/\./g, '').length > 2) return parts[i]; }
    return parts[0] || '';
  }
  // profile picture, or initials when there is no photo
  function avatar(p, cls) {
    cls = cls ? ' ' + cls.trim() : '';
    if (!p) return '<div class="av' + cls + '">?</div>';
    if (p.photo) return '<div class="av photo' + cls + '"><img src="assets/photos/' + esc(p.photo) + '?v=1" alt="" loading="lazy"></div>';
    return '<div class="av' + cls + '">' + esc(initials(p.name)) + '</div>';
  }
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
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    events: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 13.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    recruit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="8" r="4"/><path d="M3 21c0-3.9 3.1-7 7-7 1.6 0 3 .5 4.2 1.3M19 15v6M16 18h6"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
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
  var WORK_KINDS = ['video', 'whatsapp', 'college', 'other'];
  var OFF_KINDS = ['exams', 'family', 'unwell', 'no_task'];

  var STATUS = {
    todo: { label: 'To do', cls: '' },
    in_progress: { label: 'In progress', cls: 'warn' },
    waiting: { label: 'Waiting on someone', cls: 'sky' },
    submitted: { label: 'Waiting for approval', cls: 'warn' },
    done: { label: 'Done', cls: 'ok' }
  };

  var CLUBS = ['Coding', 'English', 'Career & Skills', 'Social Media', 'Project Club', 'Entrepreneurship', 'Other'];
  var EV_STATUS = {
    pending: '<span class="chip warn">Waiting for approval</span>',
    approved: '',
    sent_back: '<span class="chip bad">Sent back</span>'
  };
  var RECRUIT = {
    contacted: { label: 'Contacted', cls: '' },
    interested: { label: 'Interested', cls: 'warn' },
    onboarded: { label: 'Onboarded', cls: 'ok' },
    not_interested: { label: 'Not interested', cls: 'bad' }
  };
  function ruleLabel(t) { return (S.rules[t] && S.rules[t].label) || t; }
  function rulePoints(t) { return (S.rules[t] && S.rules[t].points) || 0; }
  function evPoints(e) { return e.points != null ? e.points : rulePoints(e.type); }
  function creditedIds(e) { return [e.person].concat(e.collab_with || []); }
  // points per person from approved events (collab partners get full points too)
  function tally(events) {
    var t = {};
    events.forEach(function (e) {
      if (e.status !== 'approved') return;
      creditedIds(e).forEach(function (pid) {
        var r = t[pid] || (t[pid] = { points: 0, events: 0, reached: 0, collabs: 0, inperson: 0 });
        r.points += evPoints(e);
        if (e.type !== 'whatsapp' && e.type !== 'streak') r.events++;
        r.reached += e.attendees || 0;
        if ((e.collab_with || []).length) r.collabs++;
        if (e.type === 'inperson') r.inperson++;
      });
    });
    return t;
  }
  function leadsRanked(events) {
    var t = tally(events);
    return S.people.filter(function (p) { return p.active && p.is_student_lead; })
      .map(function (p) { return { p: p, s: t[p.id] || { points: 0, events: 0, reached: 0, collabs: 0, inperson: 0 } }; })
      .sort(function (a, b) { return b.s.points - a.s.points || b.s.events - a.s.events || a.p.name.localeCompare(b.p.name); });
  }

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
  function canVerifyEvent(p) { return !!(S.me && p && S.me.is_admin && p.id !== S.me.id); }
  function canRecruit() { return !!(S.me && (S.me.is_admin || S.me.is_sl_head)); }
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
      await Promise.all([loadPeople(), loadOffDays(), loadRules()]);
    } catch (e) {
      $view.innerHTML = '<div class="card err">' + esc(errMsg(e)) + '</div>';
      return;
    }
    renderChrome();
    if (!S.routed) { window.addEventListener('hashchange', route); S.routed = true; }
    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      location.hash = canApprove() ? '#/approvals' : '#/home';
    } else { route(); }
  }

  async function loadPeople() {
    var rows = await q(sb.from('profiles').select('*').order('name'));
    S.people = rows; S.byId = {}; S.byName = {};
    rows.forEach(function (p) { S.byId[p.id] = p; S.byName[p.name] = p; });
    if (S.me && S.byId[S.me.id]) S.me = S.byId[S.me.id];
  }
  async function loadRules() {
    S.rules = {}; S.ruleList = [];
    try {
      var rows = await q(sb.from('point_rules').select('*').order('sort'));
      rows.forEach(function (r) { S.rules[r.type] = r; });
      S.ruleList = rows.filter(function (r) { return r.type !== 'streak'; });
    } catch (e) { /* upgrade-2.sql not run yet */ S.noUpgrade = true; }
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
      '<a class="brand" href="#/home"><img src="assets/logo.png" alt=""><b>EduMoon</b></a>' +
      '<div class="spacer"></div>' +
      '<div class="who"><span class="nm">' + esc(first(S.me.name)) + '</span>' +
      '<button class="btn sm" data-action="signout">Sign out</button></div>';
    $nav.hidden = false;
    var items = navItems();
    // on phones only the first four show; the rest sit under "More"
    var main = items.filter(function (it) { return it[3]; }).slice(0, 4);
    var mainKeys = main.map(function (it) { return it[0]; });
    $nav.innerHTML = items.map(function (it) {
      var extra = mainKeys.indexOf(it[0]) < 0 ? ' class="extra"' : '';
      return '<a href="#/' + it[0] + '" data-nav="' + it[0] + '"' + extra + '>' + it[2] + '<span>' + it[1] + '</span>' +
        (it[0] === 'approvals' ? '<span class="badge" id="appr-badge" hidden></span>' : '') +
        (it[0] === 'home' ? '<span class="badge" id="home-badge" hidden></span>' : '') + '</a>';
    }).join('') +
      (items.length > main.length ? '<a href="#" class="more-btn" data-action="more">' + ICON.more + '<span>More</span></a>' : '');
    refreshBadge();
  }
  // [key, label, icon, show in the phone bar]
  function navItems() {
    var items = [['home', 'Home', ICON.home, true]];
    if (canApprove()) items.push(['approvals', 'Approvals', ICON.approvals, true]);
    items.push(['me', 'My page', ICON.me, true]);
    items.push(['checkin', 'Check-in', ICON.checkin, true]);
    items.push(['events', 'Events', ICON.events, !canApprove()]);
    items.push(['leaderboard', 'Leaderboard', ICON.trophy, false]);
    if (S.me.is_admin) items.push(['calendar', 'Calendar', ICON.checkin, false]);
    if (hasTeamView()) items.push(['team', 'Team', ICON.team, false]);
    if (S.me.is_admin) items.push(['admin', 'Admin', ICON.admin, false]);
    return items;
  }
  function openMore() {
    $modal.innerHTML = '<div class="modal-bg" data-action="modal-close-bg"><div class="modal stack" role="dialog" aria-modal="true" aria-labelledby="more-h">' +
      '<div class="row between"><h2 id="more-h" style="font-size:20px">Menu</h2><button type="button" class="btn sm" data-action="modal-close">Close</button></div>' +
      '<div class="more-grid">' + navItems().map(function (it) {
        return '<a href="#/' + it[0] + '" class="more-item">' + it[2] + '<span>' + it[1] + '</span></a>';
      }).join('') + '</div></div></div>';
  }
  function markNav(key) {
    [].forEach.call($nav.querySelectorAll('a'), function (a) {
      var on = a.getAttribute('data-nav') === key;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  async function refreshBadge() {
    try {
      var al = await loadAlerts();
      var hb = document.getElementById('home-badge');
      if (hb) { hb.textContent = al.length; hb.hidden = al.length === 0; }
    } catch (e) { /* optional */ }
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
    var key = parts[0] || 'home';
    markNav(key === 'person' ? 'team' : key);
    window.scrollTo(0, 0);
    var my = ++seq;
    var go;
    if (S.noUpgrade && ['home', 'events', 'leaderboard', 'recruit', 'calendar'].indexOf(key) >= 0) {
      $view.innerHTML = '<div class="card stack"><h2>One more setup step</h2><p class="muted" style="margin:0">Run <b>setup/upgrade-2.sql</b> in the Supabase SQL Editor once, then refresh this page.</p></div>';
      return;
    }
    if (key === 'calendar' && S.me.is_admin) go = viewTeamCal(my);
    else if (key === 'home') go = viewHome(my);
    else if (key === 'events') go = viewEvents(my);
    else if (key === 'leaderboard') go = viewLeaderboard(my);
    else if (key === 'me') go = viewPerson(S.me.id, my);
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
  function buildDayStatus(person, checkins, tasks, events) {
    var ci = {}, sub = {}, done = {};
    (events || []).forEach(function (e) {
      if (e.status === 'approved') done[e.day] = true;
      else if (e.status === 'pending' && e.person === person.id) sub[e.day] = true;
    });
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
      var c = ci[day];
      // approved work always shows, even before tracking started (e.g. imported past events)
      if (c && c.status === 'approved') return 'worked';
      if (done[day]) return 'worked';
      if (start && day < start) return 'none';
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
  // streaks: approved days in a row. Excused, off and waiting days do not break a streak.
  function streakInfo(statusOf, start) {
    var cur = 0, d = today(), guard = 0;
    while (guard++ < 400) {
      var st = statusOf(d);
      if (st === 'worked') cur++;
      else if (st === 'missed' || st === 'none') break;
      if (start && d <= start) break;
      d = addDays(d, -1);
    }
    return cur;
  }
  function runPositions(statusOf, from, to) {
    var pos = {}, run = 0;
    for (var d = from; d <= to; d = addDays(d, 1)) {
      var st = statusOf(d);
      if (st === 'worked') { run++; pos[d] = run; }
      else if (st === 'missed' || st === 'none') run = 0;
    }
    return pos;
  }
  function calendarHtml(pid, month, statusOf) {
    var runs = runPositions(statusOf, addDays(month + '-01', -40), monthEnd(month));
    var best = 0; Object.keys(runs).forEach(function (k) { if (k.slice(0, 7) === month && runs[k] > best) best = runs[k]; });
    var cur = month === today().slice(0, 7) ? streakInfo(statusOf) : 0;
    var startDow = (new Date(month + '-01T00:00:00').getDay() + 6) % 7;
    var end = monthEnd(month), cells = '';
    for (var i = 0; i < startDow; i++) cells += '<div class="d-none"></div>';
    var titles = { worked: 'Worked, verified', pending: 'Waiting for verification', excused: 'Excused or off day', missed: 'Nothing logged', today: 'Today', future: '', none: '' };
    for (var d = month + '-01'; d <= end; d = addDays(d, 1)) {
      var s = statusOf(d);
      var extra = s === 'worked' && runs[d] ? ' s' + ((runs[d] - 1) % 5) : '';
      cells += '<div class="d-' + s + extra + '" title="' + esc(fmtDay(d) + (titles[s] ? ': ' + titles[s] : '') + (runs[d] > 1 ? ', day ' + runs[d] + ' in a row' : '')) + '">' + Number(d.slice(8)) + '</div>';
    }
    var c = monthCounts(statusOf, month);
    var canNext = month < today().slice(0, 7);
    return '<div class="card stack">' +
      '<div class="row between"><button class="btn sm" data-action="cal" data-pid="' + pid + '" data-m="' + shiftMonth(month, -1) + '" aria-label="Previous month">' + ICON.left + '</button>' +
      '<div style="text-align:center"><h2 style="font-size:17px;font-weight:600">' + esc(monthLabel(month)) + '</h2>' +
      '<div class="muted small">Worked ' + c.worked + ' · Waiting ' + c.pending + ' · Excused ' + c.excused + ' · Missed ' + c.missed + '</div></div>' +
      '<button class="btn sm" data-action="cal" data-pid="' + pid + '" data-m="' + shiftMonth(month, 1) + '" aria-label="Next month"' + (canNext ? '' : ' disabled') + '>' + ICON.chev + '</button></div>' +
      '<div class="streak-row"><div class="streak' + (cur >= 3 ? ' hot' : '') + '"><b>' + cur + '</b><span>' + (cur === 1 ? 'day' : 'days') + ' in a row</span></div>' +
      '<div class="streak"><b>' + best + '</b><span>best streak this month</span></div></div>' +
      '<div class="cal-head"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>' +
      '<div class="cal">' + cells + '</div>' +
      '<div class="legend"><span><i style="background:linear-gradient(90deg,var(--violet),var(--pink),var(--lime))"></i>Worked (colours build up as a streak)</span><span><i style="background:var(--lime)"></i>Waiting</span>' +
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
    var recentFrom = addDays(today(), -45);
    if (recentFrom < from) from = recentFrom;
    var to = monthEnd(month);
    if (today() > to) to = today();

    var res = await Promise.all([
      q(sb.from('tasks').select('*').eq('assignee', pid).order('created_at', { ascending: false }).limit(400)),
      showCal ? q(sb.from('checkins').select('*').eq('person', pid).gte('day', from).lte('day', to).order('day', { ascending: false })) : Promise.resolve([]),
      (p.is_student_lead && !S.noUpgrade) ? q(sb.from('events').select('*').or('person.eq.' + pid + ',collab_with.cs.{' + pid + '}').order('day', { ascending: false }).limit(500)) : Promise.resolve([]),
      (p.is_student_lead && !S.noUpgrade) ? q(sb.from('events').select('person,collab_with,status,type,points,attendees,day').eq('status', 'approved').gte('day', today().slice(0, 7) + '-01')) : Promise.resolve([])
    ]);
    if (my !== seq) return;
    var tasks = res[0], checkins = res[1], myEvents = res[2], monthEvents = res[3];
    var statusOf = buildDayStatus(p, checkins, tasks, myEvents);
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
        '<div class="lead" style="margin-top:6px">Here is your day.</div></div>' +
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
      h += '<section class="hero"><div class="row">' + avatar(p, 'lg') + '<div style="min-width:0">' +
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

    if (p.is_student_lead && !S.noUpgrade) h += leadBlock(p, self, myEvents, monthEvents);

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
  function canEditCi(p) { return !!(S.me.is_admin && canVerify(p)); }
  function checkinRow(c, p) {
    S.ciCache = S.ciCache || {}; S.ciCache[c.id] = c;
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
    if (canEditCi(p)) h += '<div class="acts"><button class="linkbtn" data-action="ci-edit" data-id="' + c.id + '">Edit check-in</button></div>';
    return h + '</div>';
  }

  // admins can correct what someone logged; saving counts as verified
  function openCheckinEdit(id) {
    var c = (S.ciCache || {})[id]; if (!c) return;
    var p = S.byId[c.person];
    var kinds = Object.keys(KINDS);
    $modal.innerHTML = '<div class="modal-bg" data-action="modal-close-bg"><form class="modal stack" id="cie-form" novalidate role="dialog" aria-modal="true" aria-labelledby="cie-h">' +
      '<div class="row between"><h2 id="cie-h" style="font-size:20px">Edit check-in</h2><button type="button" class="btn sm" data-action="modal-close">Close</button></div>' +
      '<div class="muted small">' + esc(p ? p.name : '') + ' · ' + esc(fmtLongDay(c.day)) + '</div>' +
      '<div class="field"><label class="lbl" for="cie-kind">What they did</label><select class="input" id="cie-kind">' +
      kinds.map(function (k) { return '<option value="' + k + '"' + (k === c.kind ? ' selected' : '') + '>' + esc(KINDS[k].label) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label class="lbl" for="cie-detail">Details</label><input class="input" id="cie-detail" maxlength="500" value="' + esc(c.detail) + '"></div>' +
      '<div class="field"><label class="lbl" for="cie-note">Note</label><textarea class="input" id="cie-note" maxlength="1000">' + esc(c.note) + '</textarea></div>' +
      '<p class="muted tiny" style="margin:0">Saving marks this day as verified by you. Exams, family, not well and no task count as excused.</p>' +
      '<div class="err" id="cie-err" role="alert"></div><button class="btn primary big" type="submit">Save</button></form></div>';
    document.getElementById('cie-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var $e = document.getElementById('cie-err'); $e.textContent = '';
      var row = { kind: document.getElementById('cie-kind').value, detail: document.getElementById('cie-detail').value.trim() || null, note: document.getElementById('cie-note').value.trim() || null };
      try { await q(sb.from('checkins').update(row).eq('id', id)); } catch (er) { $e.textContent = errMsg(er); return; }
      closeModal(); toast('Check-in updated'); rerender();
    });
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
        (S.me.is_student_lead ? '<div class="card row between wrap" style="background:var(--lav);box-shadow:none"><div style="min-width:0"><b>Hosted an event?</b><div class="small">Log it under Events instead. It counts as your day and earns points.</div></div><button type="button" class="btn sm sky" data-action="log-event">Log an event</button></div>' : '') +
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
      q(sb.from('tasks').select('*').eq('status', 'submitted').order('submitted_at').limit(300)),
      (S.me.is_admin && !S.noUpgrade) ? q(sb.from('events').select('*').eq('status', 'pending').order('created_at').limit(300)) : Promise.resolve([])
    ]);
    var items = [];
    res[2].forEach(function (e) { var p = S.byId[e.person]; if (canVerifyEvent(p)) items.push({ type: 'ev', row: e, p: p, at: e.created_at }); });
    res[0].forEach(function (c) { var p = S.byId[c.person]; if (canVerify(p)) items.push({ type: 'ci', row: c, p: p, at: c.updated_at }); });
    res[1].forEach(function (t) { var p = S.byId[t.assignee]; if (canVerify(p)) items.push({ type: 'task', row: t, p: p, at: t.submitted_at }); });
    items.sort(function (a, b) { return (a.at || '') < (b.at || '') ? -1 : 1; });
    return items;
  }

  async function viewApprovals(my) {
    var res = await Promise.all([
      loadPending(),
      q(sb.from('checkins').select('*').in('status', ['approved', 'sent_back']).not('verified_at', 'is', null).order('verified_at', { ascending: false }).limit(25)),
      q(sb.from('tasks').select('*').eq('status', 'done').not('verified_at', 'is', null).order('verified_at', { ascending: false }).limit(25)),
      S.noUpgrade ? Promise.resolve([]) : q(sb.from('events').select('*').in('status', ['approved', 'sent_back']).not('verified_at', 'is', null).order('verified_at', { ascending: false }).limit(25))
    ]);
    if (my !== seq) return;
    var items = res[0];
    var teamN = items.filter(function (i) { return !isLeadOnly(i.p); }).length;
    var recent = [];
    res[1].forEach(function (c) { recent.push({ type: 'ci', row: c, p: S.byId[c.person], at: c.verified_at }); });
    res[2].forEach(function (t) { recent.push({ type: 'task', row: t, p: S.byId[t.assignee], at: t.verified_at }); });
    res[3].forEach(function (e) { recent.push({ type: 'ev', row: e, p: S.byId[e.person], at: e.verified_at, open: true }); });
    recent = recent.filter(function (r) { return r.p && (r.open || canSee(r.p)); })
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
        var what = r.type === 'ci' ? (KINDS[r.row.kind] || { label: r.row.kind }).label + (r.row.detail ? ': ' + r.row.detail : '') :
          r.type === 'ev' ? 'Event: ' + r.row.title + (r.row.status === 'approved' ? ' (+' + evPoints(r.row) + ')' : '') : r.row.title;
        var chip = (r.type === 'ci' || r.type === 'ev') && r.row.status === 'sent_back' ?
          '<span class="chip bad">Sent back by ' + esc(firstOf(r.row.verified_by)) + ' · ' + esc(fmtWhen(r.at)) + '</span>' :
          '<span class="chip ok">Verified by ' + esc(firstOf(r.row.verified_by)) + ' · ' + esc(fmtWhen(r.at)) + '</span>';
        return '<div class="task"><div style="font-weight:600;font-size:14.5px">' + esc(first(r.p.name)) + ' · ' + esc(what) + '</div><div>' + chip + '</div></div>';
      }).join('') : '<div class="empty">Nothing verified yet.</div>') + '</div></div>';
    $view.innerHTML = h;
  }

  function approvalCard(i) {
    var p = i.p, r = i.row, head, body;
    if (i.type === 'ev') {
      var partners = (r.collab_with || []).map(function (id) { return first(nameOf(id)); });
      head = 'Event · ' + fmtDay(r.day);
      body = '<div style="font-size:15px;font-weight:600">' + esc(r.title) + '</div>' +
        '<div class="muted small">' + esc([ruleLabel(r.type) + ' (+' + rulePoints(r.type) + ')', r.club, r.attendees != null ? r.attendees + ' joined' : ''].filter(Boolean).join(' · ')) + '</div>' +
        (partners.length ? '<div class="small">Collab with ' + esc(partners.join(', ')) + '. They get the points too.</div>' : '') +
        (r.link ? '<a class="linkbtn" style="align-self:flex-start" href="' + esc(/^https?:\/\//i.test(r.link) ? r.link : 'https://' + r.link) + '" target="_blank" rel="noopener">Open link</a>' : '') +
        (r.note ? '<div class="muted small">Note: ' + esc(r.note) + '</div>' : '');
    } else if (i.type === 'ci') {
      var k = KINDS[r.kind] || { label: r.kind };
      head = 'Check-in · ' + fmtDay(r.day);
      S.ciCache = S.ciCache || {}; S.ciCache[r.id] = r;
      body = '<div style="font-size:15px;font-weight:500">' + esc(k.label) + (r.detail ? ': ' + esc(r.detail) : '') + '</div>' +
        (r.note ? '<div class="muted small">Note: ' + esc(r.note) + '</div>' : '') +
        (canEditCi(p) ? '<button class="linkbtn" style="align-self:flex-start" data-action="ci-edit" data-id="' + r.id + '">Edit check-in</button>' : '');
    } else {
      head = 'Task done · ' + fmtWhen(r.submitted_at);
      body = '<div style="font-size:15px;font-weight:500">' + esc(r.title) + '</div>' +
        '<div class="muted small">' + (r.created_by === r.assignee ? 'Self-added' : 'From ' + esc(nameOf(r.created_by))) + '</div>' +
        '<button class="linkbtn" style="align-self:flex-start" data-action="comments" data-id="' + r.id + '">See comments and links</button>' +
        '<div class="comments" data-box="comments-' + r.id + '" hidden></div>';
    }
    var a = i.type;
    var boxPre = a === 'ci' ? 'ci-back-' : a === 'ev' ? 'ev-back-' : 'back-';
    var inPre = a === 'ci' ? 'fb-' : a === 'ev' ? 'eb-' : 'bk-';
    return '<div class="card stack" style="gap:10px"><div class="row">' + avatar(p, '') + '<div style="min-width:0">' +
      '<div style="font-weight:600">' + esc(p.name) + '</div><div class="muted tiny">' + esc((isLeadOnly(p) || i.type === 'ev' ? 'Student Lead' : 'Team') + ' · ' + head) + '</div></div></div>' +
      body +
      '<div class="grid2"><button class="btn primary" data-action="' + a + '-approve" data-id="' + r.id + '">Approve</button>' +
      '<button class="btn danger" data-action="' + a + '-back" data-id="' + r.id + '">Send back</button></div>' +
      '<div class="inline-box" data-box="' + boxPre + r.id + '" hidden><label class="lbl" for="' + inPre + r.id + '">What should they fix?</label>' +
      '<input class="input" id="' + inPre + r.id + '" maxlength="500"><button class="btn sm danger" data-action="' + a + '-back-confirm" data-id="' + r.id + '">Send back</button></div></div>';
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
      return '<a class="person" href="#/person/' + p.id + '">' + avatar(p, '') + '<div style="min-width:0">' +
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
        return '<div class="person" style="align-items:flex-start">' + avatar(p, '') + '<div style="min-width:0;flex:1">' +
          '<div class="nm">' + esc(p.name) + '</div><div class="muted small">' + esc(roleLine(p)) + '</div>' +
          '<div class="small" style="margin:2px 0">' + (p.email ? esc(p.email) : '<span style="color:var(--bad);font-weight:600">No email yet</span>') +
          (p.user_id ? ' · <span style="color:var(--ok);font-weight:600">Has logged in</span>' : (p.email ? ' · <span class="muted">Not logged in yet</span>' : '')) + '</div>' +
          '<div class="row wrap" style="gap:6px">' + roles(p) + '</div></div>' +
          '<button class="btn sm" data-action="person-edit" data-id="' + p.id + '">Edit</button></div>';
      }).join('') + '</div>' +
      (S.noUpgrade ? '<div class="card" style="background:var(--warnbg)"><b>One more setup step:</b> run setup/upgrade-2.sql in Supabase to turn on events, points, leaderboard, Home and recruitment.</div>' :
      '<div class="sec-h"><h2>Points</h2></div><form class="card stack" id="rules-form" novalidate>' +
      '<p class="muted small" style="margin:0">Points a Student Lead earns when you approve each kind of activity. Changes apply to events approved from now on.</p>' +
      S.ruleList.map(function (r) {
        return '<div class="row between"><label for="rule-' + r.type + '" style="font-weight:600">' + esc(r.label) + '</label>' +
          '<input class="input" id="rule-' + r.type + '" data-type="' + r.type + '" type="number" min="0" max="1000" value="' + r.points + '" style="width:96px"></div>';
      }).join('') + '<div class="err" id="rules-err" role="alert"></div><button class="btn primary" type="submit">Save points</button></form>' +
      '<div class="sec-h"><h2>Chapters site</h2></div><div class="card stack"><p class="muted small" style="margin:0">Once a week, export approved events and paste them into the Chapters site so its leaderboard matches.</p>' +
      '<button class="btn sky" data-action="export">Export for Chapters</button></div>') +
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

    var rf = document.getElementById('rules-form');
    if (rf) rf.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var $e = document.getElementById('rules-err'); $e.textContent = '';
      var inputs = [].slice.call(rf.querySelectorAll('input[data-type]'));
      for (var i = 0; i < inputs.length; i++) {
        var v = +inputs[i].value;
        if (inputs[i].value === '' || isNaN(v) || v < 0 || v > 1000) { $e.textContent = 'Points must be a number from 0 to 1000.'; inputs[i].focus(); return; }
      }
      try {
        for (var j = 0; j < inputs.length; j++) {
          await q(sb.from('point_rules').update({ points: Math.round(+inputs[j].value) }).eq('type', inputs[j].getAttribute('data-type')));
        }
      } catch (er) { $e.textContent = errMsg(er); return; }
      await loadRules(); toast('Points saved');
    });
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
      '<div class="field"><label class="lbl" for="pf-short">Short name (what the portal calls them)</label><input class="input" id="pf-short" maxlength="40" placeholder="e.g. Harshita" value="' + esc(p.short_name) + '"></div>' +
      '<div class="field"><label class="lbl" for="pf-photo">Photo file (in assets/photos, optional)</label><input class="input" id="pf-photo" maxlength="80" placeholder="e.g. hardik.jpg" value="' + esc(p.photo) + '"></div>' +
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
      if (!S.noUpgrade) row.short_name = v('short') || null;
      if ('photo' in (S.people[0] || {})) row.photo = v('photo') || null;
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

  // ---------- Student Lead block on a person's page ----------
  var BADGES = [
    ['first', 'First event', function (s) { return s.events >= 1; }],
    ['five', '5 events', function (s) { return s.events >= 5; }],
    ['collab', 'First collab', function (s) { return s.collabs >= 1; }],
    ['circle', 'First Circle', function (s) { return s.inperson >= 1; }],
    ['reach', '100 reached', function (s) { return s.reached >= 100; }],
    ['top', 'Top of the month', function (s, rank) { return rank === 1 && s.points > 0; }]
  ];
  function badgeIcon(k) {
    var paths = {
      first: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.4 9.3l6-.7z"/>',
      five: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/>',
      collab: '<circle cx="9" cy="8" r="3.5"/><circle cx="16" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 2 6 5.5"/>',
      circle: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
      reach: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
      top: '<path d="M3 18l2-11 5 5 2-7 2 7 5-5 2 11z"/><path d="M3 21h18"/>'
    };
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[k] + '</svg>';
  }
  function leadBlock(p, self, myEvents, monthEvents) {
    var all = tally(myEvents)[p.id] || { points: 0, events: 0, reached: 0, collabs: 0, inperson: 0 };
    var ranked = leadsRanked(monthEvents);
    var rank = 0;
    ranked.forEach(function (r, i) { if (r.p.id === p.id) rank = i + 1; });
    var monthPts = (ranked[rank - 1] || { s: { points: 0 } }).s.points;
    var h = '<div class="grid2" style="grid-template-columns:repeat(4,minmax(0,1fr))">' +
      '<div class="stat" style="background:var(--lime)"><b>' + all.points + '</b><span style="color:var(--ink)">Points</span></div>' +
      '<div class="stat"><b>' + all.events + '</b><span>Events</span></div>' +
      '<div class="stat"><b>' + all.reached + '</b><span>Students reached</span></div>' +
      '<div class="stat" style="background:var(--pink)"><b>' + (monthPts > 0 ? '#' + rank : '-') + '</b><span style="color:var(--ink)">Rank this month</span></div></div>';
    if (self) h += '<button class="btn sky big block" data-action="log-event">' + ICON.plus + 'Log an event</button>';
    var earned = BADGES.filter(function (b) { return b[2](all, rank); }).length;
    h += '<div class="sec-h"><h2>Badges</h2><span class="muted small" style="font-weight:600">' + earned + ' of ' + BADGES.length + '</span></div>' +
      '<div class="badges">' + BADGES.map(function (b) {
        var on = b[2](all, rank);
        return '<div class="badge-card' + (on ? ' on' : '') + '"><div class="bi">' + badgeIcon(b[0]) + '</div><span>' + esc(b[1]) + '</span>' +
          (on ? '' : '<span class="tiny muted">Locked</span>') + '</div>';
      }).join('') + '</div>';
    var recent = myEvents.slice(0, 5);
    h += '<div class="sec-h"><h2>' + (self ? 'My events' : 'Events') + '</h2><a class="linkbtn" href="#/events">See all</a></div>' +
      '<div class="card flush list">' + (recent.length ? recent.map(eventRow).join('') : '<div class="empty">No events logged yet.' + (self ? ' Hosted one? Log it to earn points.' : '') + '</div>') + '</div>';
    return h;
  }

  // ---------- events ----------
  function eventRow(e) {
    var p = S.byId[e.person] || { name: 'Someone' };
    var me = S.me;
    var partners = (e.collab_with || []).map(function (id) { return first(nameOf(id)); });
    var meta = [ruleLabel(e.type)];
    if (e.club) meta.push(e.club);
    meta.push(fmtDay(e.day));
    if (e.attendees != null) meta.push(e.attendees + ' joined');
    var chips = (e.status === 'approved' ? '<span class="chip ok">+' + evPoints(e) + ' points' + (e.verified_by ? ' · Verified by ' + esc(firstOf(e.verified_by)) : '') + '</span>' :
      EV_STATUS[e.status] + '<span class="chip">+' + evPoints(e) + ' points</span>');
    if (partners.length) chips += '<span class="chip sky">Collab with ' + esc(partners.join(', ')) + '</span>';
    var h = '<div class="task" data-ev="' + e.id + '">' +
      '<div class="row" style="align-items:flex-start;gap:12px">' + avatar(p, '') + '<div style="min-width:0;flex:1">' +
      '<div class="t-title">' + esc(e.title) + '</div>' +
      '<div class="t-meta">' + esc(first(p.name)) + ' · ' + esc(meta.join(' · ')) + '</div></div></div>' +
      '<div class="row wrap" style="gap:6px">' + chips + '</div>';
    if (e.link) h += '<a class="linkbtn" style="align-self:flex-start" href="' + esc(/^https?:\/\//i.test(e.link) ? e.link : 'https://' + e.link) + '" target="_blank" rel="noopener">Open link</a>';
    if (e.note) h += '<div class="t-details">' + esc(e.note) + '</div>';
    if (e.status === 'sent_back' && e.feedback) h += '<div class="t-meta" style="color:var(--bad)">Feedback: ' + esc(e.feedback) + '</div>';
    var acts = '';
    if (e.status === 'pending' && canVerifyEvent(p)) {
      acts += '<button class="btn sm primary" data-action="ev-approve" data-id="' + e.id + '">Approve</button>' +
        '<button class="btn sm danger" data-action="ev-back" data-id="' + e.id + '">Send back</button>';
    }
    S.evAll = S.evAll || {}; S.evAll[e.id] = e;
    if (e.status === 'approved' && (creditedIds(e).indexOf(me.id) >= 0 || me.is_admin)) {
      acts += '<button class="btn sm sky" data-action="share-ev" data-id="' + e.id + '">Share card</button>';
    }
    if ((e.person === me.id && e.status !== 'approved') || me.is_admin) {
      acts += '<button class="linkbtn" data-action="ev-edit" data-id="' + e.id + '">Edit</button>' +
        '<button class="linkbtn" style="color:var(--bad)" data-action="ev-delete" data-id="' + e.id + '">Delete</button>';
    }
    if (acts) h += '<div class="acts">' + acts + '</div>';
    h += '<div class="inline-box" data-box="ev-back-' + e.id + '" hidden><label class="lbl" for="eb-' + e.id + '">What should they fix?</label>' +
      '<input class="input" id="eb-' + e.id + '" maxlength="500"><button class="btn sm danger" data-action="ev-back-confirm" data-id="' + e.id + '">Send back</button></div>';
    return h + '</div>';
  }

  async function viewEvents(my) {
    var rows = await q(sb.from('events').select('*').order('day', { ascending: false }).order('created_at', { ascending: false }).limit(200));
    if (my !== seq) return;
    S.evCache = {}; rows.forEach(function (e) { S.evCache[e.id] = e; });
    var f = S.evFilter;
    var list = rows.filter(function (e) {
      if (f === 'mine') return creditedIds(e).indexOf(S.me.id) >= 0;
      if (f === 'waiting') return e.status === 'pending';
      return e.status !== 'sent_back' || e.person === S.me.id || S.me.is_admin;
    });
    var canLog = S.me.is_student_lead || S.me.is_admin;
    var h = '<div class="stack"><div class="row between"><h1 style="font-size:28px;font-weight:700">Events</h1>' +
      (canLog ? '<button class="btn sm sky" data-action="log-event">' + ICON.plus + 'Log an event</button>' : '') + '</div>' +
      '<p class="muted" style="margin:0">Every event a Student Lead hosts, across all colleges. Points count once Vikas or Aparna approve.</p>' +
      '<div class="seg" role="group" aria-label="Filter">' +
      [['all', 'All'], ['mine', 'Mine'], ['waiting', 'Waiting approval']].map(function (x) {
        return '<button class="' + (f === x[0] ? 'on' : '') + '" data-action="ev-filter" data-f="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="card flush list">' + (list.length ? list.map(eventRow).join('') : '<div class="empty">No events here yet.</div>') + '</div>' +
      pointsGuide() + '</div>';
    $view.innerHTML = h;
  }

  function pointsGuide() {
    if (!S.ruleList.length) return '';
    return '<div class="sec-h"><h2>How to earn points</h2></div><div class="pts">' + S.ruleList.map(function (r) {
      return '<div class="stat"><b>' + r.points + '</b><span>' + esc(r.label) + '</span></div>';
    }).join('') + '</div><p class="muted small" style="margin:4px 2px 0">Collab events give full points to every Student Lead in the collab.</p>';
  }

  async function openEventForm(id) {
    var e = id ? (S.evCache && S.evCache[id]) : null;
    if (id && !e) e = await q(sb.from('events').select('*').eq('id', id).maybeSingle());
    e = e || { type: 'virtual', day: today(), collab_with: [], person: S.me.id };
    var leads = S.people.filter(function (p) { return p.active && p.is_student_lead; });
    var forSel = '';
    if (S.me.is_admin && !id) {
      forSel = '<div class="field"><label class="lbl" for="ef-for">Student Lead</label><select class="input" id="ef-for">' +
        leads.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select></div>';
    }
    $modal.innerHTML = '<div class="modal-bg" data-action="modal-close-bg"><form class="modal stack" id="ev-form" novalidate role="dialog" aria-modal="true" aria-labelledby="ef-h">' +
      '<div class="row between"><h2 id="ef-h" style="font-size:20px">' + (id ? 'Edit event' : 'Log an event') + '</h2><button type="button" class="btn sm" data-action="modal-close">Close</button></div>' +
      forSel +
      '<div class="field"><label class="lbl" for="ef-type">What kind?</label><select class="input" id="ef-type">' +
      S.ruleList.map(function (r) { return '<option value="' + r.type + '"' + (r.type === e.type ? ' selected' : '') + '>' + esc(r.label) + ' (' + r.points + ' points)</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label class="lbl" for="ef-title">Event name</label><input class="input" id="ef-title" maxlength="200" placeholder="e.g. Game Zone quiz night" value="' + esc(e.title) + '"></div>' +
      '<div class="grid2"><div class="field"><label class="lbl" for="ef-day">Date</label><input class="input" id="ef-day" type="date" max="' + today() + '" min="' + addDays(today(), -30) + '" value="' + esc(e.day) + '"></div>' +
      '<div class="field"><label class="lbl" for="ef-att">How many joined</label><input class="input" id="ef-att" type="number" min="0" inputmode="numeric" placeholder="About" value="' + esc(e.attendees == null ? '' : e.attendees) + '"></div></div>' +
      '<div class="field"><label class="lbl" for="ef-club">Club (optional)</label><select class="input" id="ef-club"><option value="">None</option>' +
      CLUBS.map(function (c) { return '<option' + (c === e.club ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div><div class="lbl">Collab with (optional)</div><p class="muted tiny" style="margin:0 0 8px">Every Student Lead you tick gets the full points too.</p><div class="checks" id="ef-collab">' +
      leads.filter(function (p) { return p.id !== e.person; }).map(function (p) {
        return '<label><input type="checkbox" value="' + p.id + '"' + ((e.collab_with || []).indexOf(p.id) >= 0 ? ' checked' : '') + '>' + esc(first(p.name)) + '</label>';
      }).join('') + '</div></div>' +
      '<div class="field"><label class="lbl" for="ef-link">Link (optional)</label><input class="input" id="ef-link" maxlength="500" placeholder="Instagram post, recording or photos" value="' + esc(e.link) + '"></div>' +
      '<div class="field"><label class="lbl" for="ef-note">Note (optional)</label><textarea class="input" id="ef-note" maxlength="1000">' + esc(e.note) + '</textarea></div>' +
      '<div class="err" id="ef-err" role="alert"></div><button class="btn primary big" type="submit">' + (id ? 'Save changes' : 'Submit for approval') + '</button></form></div>';
    document.getElementById('ef-title').focus();
    document.getElementById('ev-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var $e = document.getElementById('ef-err'); $e.textContent = '';
      var title = document.getElementById('ef-title').value.trim();
      var day = document.getElementById('ef-day').value;
      var att = document.getElementById('ef-att').value;
      if (!title) { $e.textContent = 'Write the event name.'; return; }
      if (!day) { $e.textContent = 'Pick the date.'; return; }
      if (day > today()) { $e.textContent = 'The date cannot be in the future.'; return; }
      if (att !== '' && (isNaN(+att) || +att < 0)) { $e.textContent = 'How many joined should be a number.'; return; }
      var row = {
        type: document.getElementById('ef-type').value, title: title, day: day,
        attendees: att === '' ? null : Math.round(+att),
        club: document.getElementById('ef-club').value || null,
        link: document.getElementById('ef-link').value.trim() || null,
        note: document.getElementById('ef-note').value.trim() || null,
        collab_with: [].map.call(document.querySelectorAll('#ef-collab input:checked'), function (x) { return x.value; })
      };
      try {
        if (id) await q(sb.from('events').update(row).eq('id', id));
        else {
          var forEl = document.getElementById('ef-for');
          row.person = forEl ? forEl.value : S.me.id;
          if (row.collab_with.indexOf(row.person) >= 0) row.collab_with = row.collab_with.filter(function (x) { return x !== row.person; });
          await q(sb.from('events').insert(row));
        }
      } catch (er) { $e.textContent = errMsg(er); return; }
      closeModal(); toast(id ? 'Saved' : 'Sent for approval'); rerender();
    });
  }

  // ---------- leaderboard ----------
  async function viewLeaderboard(my) {
    var rows = await q(sb.from('events').select('person,collab_with,status,type,points,attendees,day').eq('status', 'approved').limit(5000));
    if (my !== seq) return;
    var m = today().slice(0, 7), prev = shiftMonth(m, -1);
    var monthRows = rows.filter(function (e) { return e.day.slice(0, 7) === m; });
    var prevRanked = leadsRanked(rows.filter(function (e) { return e.day.slice(0, 7) === prev; }));
    var ranked = leadsRanked(S.lbPeriod === 'all' ? rows : monthRows);
    var top = ranked.filter(function (r) { return r.s.points > 0; }).slice(0, 3), restList = [];
    function pod(r, place) {
      if (!r) return '<div></div>';
      var hgt = place === 1 ? 128 : place === 2 ? 96 : 76;
      return '<div class="pod">' + avatar(r.p, place === 1 ? 'gold' : '') +
        '<b>' + esc(first(r.p.name)) + '</b><span class="tiny">' + esc((r.p.chapter || '').split(',')[0]) + '</span>' +
        '<div class="pod-bar p' + place + '" style="height:' + hgt + 'px"><b>' + place + '</b><span>' + r.s.points + ' pts</span></div></div>';
    }
    var h = '<div class="stack"><div><h1 style="font-size:28px;font-weight:700">Leaderboard</h1>' +
      '<div class="muted">Student Leads · ' + (S.lbPeriod === 'all' ? 'All time' : esc(monthLabel(m))) + '</div></div>' +
      '<div class="seg" role="group" aria-label="Period">' +
      '<button class="' + (S.lbPeriod === 'month' ? 'on' : '') + '" data-action="lb-period" data-p="month" aria-pressed="' + (S.lbPeriod === 'month') + '">This month</button>' +
      '<button class="' + (S.lbPeriod === 'all' ? 'on' : '') + '" data-action="lb-period" data-p="all" aria-pressed="' + (S.lbPeriod === 'all') + '">All time</button></div>';
    if (!ranked.length || ranked[0].s.points === 0) {
      h += '<div class="card empty">No approved events yet' + (S.lbPeriod === 'month' ? ' this month' : '') + '. The first event takes the top spot.</div>';
    } else {
      h += '<section class="podium">' + pod(top[1], 2) + pod(top[0], 1) + pod(top[2], 3) + '</section>';
    }
    var prevTop = prevRanked.filter(function (r) { return r.s.points > 0; }).slice(0, 3);
    S.top3 = { month: prev, list: prevTop };
    if (prevTop.length) {
      h += '<div class="sec-h"><h2>Top 3 of ' + esc(monthLabel(prev)) + '</h2></div><div class="card flush list" style="background:var(--warnbg)">' + prevTop.map(function (r, i) {
        var mine = r.p.id === S.me.id || S.me.is_admin;
        return '<div class="person">' + avatar(r.p, i === 0 ? 'gold' : '') + '<div style="min-width:0;flex:1"><div class="nm">#' + (i + 1) + ' ' + esc(r.p.name) + '</div>' +
          '<div class="muted small">' + r.s.points + ' points · ' + r.s.events + (r.s.events === 1 ? ' event' : ' events') + '</div></div>' +
          (mine ? '<button class="btn sm sky" data-action="share-rank" data-i="' + i + '">Share</button>' : '') + '</div>';
      }).join('') + '</div>';
    }
    var started = ranked.filter(function (r) { return r.s.points > 0; });
    var notYet = ranked.filter(function (r) { return r.s.points === 0; });
    h += '<div class="sec-h"><h2>Rankings</h2></div><div class="card flush list">' + (started.length ? '' : '<div class="empty">Nobody on the board yet.</div>') + started.map(function (r, i) {
      var meRow = r.p.id === S.me.id;
      var tag = canSee(r.p) ? 'a' : 'div';
      return '<' + tag + ' class="person"' + (tag === 'a' ? ' href="#/person/' + r.p.id + '"' : '') + ' style="' + (meRow ? 'background:var(--lav)' : '') + '">' +
        '<b style="width:26px;font-size:16px">' + (i + 1) + '</b>' + avatar(r.p, '') + '<div style="min-width:0;flex:1">' +
        '<div class="nm">' + esc(r.p.name) + (meRow ? ' <span class="chip navy">You</span>' : '') + '</div>' +
        '<div class="muted small">' + esc((r.p.chapter || 'Student Lead').split(',')[0]) + ' · ' + r.s.events + (r.s.events === 1 ? ' event' : ' events') + ' · ' + r.s.reached + ' reached</div></div>' +
        '<b style="font-size:18px">' + r.s.points + '</b></' + tag + '>';
    }).join('') + '</div>' +
      (notYet.length ? '<div class="sec-h"><h2>Not yet started' + (S.lbPeriod === 'month' ? ' this month' : '') + '</h2><span class="muted small" style="font-weight:600">' + notYet.length + '</span></div>' +
        '<div class="card notyet"><p class="small muted" style="margin:0 0 10px">One event gets you on the board.</p><div class="ny-grid">' + notYet.map(function (r) {
          return '<div class="ny">' + avatar(r.p, '') + '<span>' + esc(first(r.p.name)) + '</span></div>';
        }).join('') + '</div></div>' : '') +
      pointsGuide() + '</div>';
    void restList;
    $view.innerHTML = h;
  }

  // ---------- home ----------
  async function viewHome(my) {
    var m = today().slice(0, 7);
    var res = await Promise.all([
      q(sb.from('plans').select('*').order('day', { ascending: true, nullsFirst: false }).limit(50)),
      q(sb.from('events').select('*').eq('status', 'approved').order('verified_at', { ascending: false }).limit(6)),
      q(sb.from('events').select('person,collab_with,status,type,points,attendees,day').eq('status', 'approved').gte('day', m + '-01')),
      q(sb.from('ideas').select('*').order('created_at', { ascending: false }).limit(60)),
      q(sb.from('idea_votes').select('*').limit(5000)),
      q(sb.from('idea_replies').select('idea_id').limit(5000)),
      canApprove() ? loadPending() : Promise.resolve([]),
      q(sb.from('checkins').select('*').eq('person', S.me.id).eq('day', today()).maybeSingle()),
      q(sb.from('tasks').select('*').eq('assignee', S.me.id).in('status', ['todo', 'in_progress', 'waiting', 'submitted']).order('created_at', { ascending: false })),
      S.me.is_admin ? q(sb.from('tasks').select('*').neq('assignee', S.me.id).in('status', ['todo', 'in_progress', 'waiting']).limit(1000)) : Promise.resolve([]),
      S.me.is_admin ? q(sb.from('checkins').select('person,day,status').gte('day', addDays(today(), -30)).limit(5000)) : Promise.resolve([]),
      S.me.is_admin ? q(sb.from('events').select('person,collab_with,day,status').gte('day', addDays(today(), -30)).limit(5000)) : Promise.resolve([]),
      S.me.is_admin ? q(sb.from('tasks').select('assignee,status,submitted_at,verified_at').gte('submitted_at', addDays(today(), -30) + 'T00:00:00').limit(5000)) : Promise.resolve([]),
      loadAlerts()
    ]);
    if (my !== seq) return;
    var plans = res[0], wins = res[1], ranked = leadsRanked(res[2]).filter(function (r) { return r.s.points > 0; }).slice(0, 3);
    var votes = {}, mine = {}, replies = {};
    res[4].forEach(function (v) { votes[v.idea_id] = (votes[v.idea_id] || 0) + 1; if (v.person === S.me.id) mine[v.idea_id] = true; });
    res[5].forEach(function (r) { replies[r.idea_id] = (replies[r.idea_id] || 0) + 1; });
    var ideas = res[3].slice().sort(function (a, b) {
      var ad = a.status === 'done' ? 1 : 0, bd = b.status === 'done' ? 1 : 0;
      return ad - bd || (votes[b.id] || 0) - (votes[a.id] || 0) || (a.created_at < b.created_at ? 1 : -1);
    });
    var pending = res[6].length;
    var hr = new Date().getHours();
    var greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    var pinned = plans.filter(function (x) { return x.pinned; });
    var upcoming = plans.filter(function (x) { return !x.pinned && (!x.day || x.day >= today()); });

    // what needs doing right now
    var todo = [];
    if (!res[7]) todo.push(['You have not checked in today.', '<a class="btn sm" href="#/checkin">Check in now</a>']);
    else if (res[7].status === 'sent_back') todo.push(['Your check-in was sent back. Fix it.', '<a class="btn sm" href="#/checkin">Fix it</a>']);
    var myOpen = res[8].filter(function (t) { return t.status !== 'submitted'; });
    var mySent = res[8].filter(function (t) { return t.status === 'submitted'; });
    myOpen.sort(function (a, b) { var ad = a.due_date || '9999', bd = b.due_date || '9999'; return ad < bd ? -1 : ad > bd ? 1 : 0; });
    var overdue = myOpen.filter(function (t) { return t.due_date && t.due_date < today(); }).length;
    var dueToday = myOpen.filter(function (t) { return t.due_date === today(); }).length;
    if (overdue) todo.push([overdue + (overdue === 1 ? ' task is' : ' tasks are') + ' overdue.', '<a class="btn sm" href="#/me">Open</a>']);
    else if (dueToday) todo.push([dueToday + (dueToday === 1 ? ' task is' : ' tasks are') + ' due today.', '<a class="btn sm" href="#/me">Open</a>']);
    if (S.me.is_student_lead) {
      var allRank = leadsRanked(res[2]);
      var myIdx = -1; allRank.forEach(function (r, i) { if (r.p.id === S.me.id) myIdx = i; });
      var mine = myIdx >= 0 ? allRank[myIdx].s.points : 0;
      if (mine === 0) todo.push(['No points yet this month. Host an event and get on the board.', '<button class="btn sm" data-action="log-event">Log an event</button>']);
      else if (myIdx === 0) todo.push(['You are #1 this month with ' + mine + ' points. Hold the top spot.', '<a class="btn sm" href="#/leaderboard">See board</a>']);
      else {
        var gap = allRank[myIdx - 1].s.points - mine + 1;
        todo.push(['You are #' + (myIdx + 1) + ' this month. ' + gap + ' more ' + (gap === 1 ? 'point' : 'points') + ' to pass ' + first(allRank[myIdx - 1].p.name) + '.', '<button class="btn sm" data-action="log-event">Log an event</button>']);
      }
    }
    var next = upcoming[0];
    var headline = todo.length ? todo.length + (todo.length === 1 ? ' thing needs you today' : ' things need you today') : 'You are all caught up. Keep the streak going.';
    var h = '<div class="stack"><section class="hero"><span class="hi">' + greet + '</span>' +
      '<div><h1>Hey ' + esc(first(S.me.name)) + '</h1><div class="lead" style="margin-top:6px;font-weight:600">' + esc(headline) + '</div></div>' +
      (todo.length ? '<div class="focus">' + todo.map(function (t) {
        return '<div class="todo"><span class="dot"></span><span style="flex:1;min-width:0">' + esc(t[0]) + '</span>' + t[1] + '</div>';
      }).join('') + '</div>' : '') +
      (next ? '<div class="sub">Next up: <b>' + esc(next.title) + '</b>' + (next.day ? ' · ' + esc(fmtDay(next.day)) : next.note ? ' · ' + esc(next.note) : '') + '</div>' : '') +
      '</section>';
    // new for you
    var alerts = res[13] || [];
    if (alerts.length) {
      h += '<div class="card stack alerts" style="gap:10px"><div class="row between"><h2 style="font-size:18px">New for you <span class="chip" style="background:var(--pink)">' + alerts.length + '</span></h2>' +
        '<button class="linkbtn" data-action="alerts-seen">Mark as seen</button></div>' +
        alerts.map(function (a) {
          return '<a class="alert-row" href="' + a.href + '"><span class="adot ' + a.tone + '"></span><span style="flex:1;min-width:0">' + esc(a.text) + '</span><span class="tiny muted">' + esc(fmtWhen(a.at)) + '</span></a>';
        }).join('') + '</div>';
    }
    if (S.me.is_admin) h += weeklySummary(res[9], res[10], res[11], res[12]) + pendingFromTeam(res[9]);

    // my tasks, right on Home, with a one-tap Done
    var givers = {};
    myOpen.forEach(function (t) { if (t.created_by && t.created_by !== S.me.id) givers[first(nameOf(t.created_by))] = 1; });
    var gv = Object.keys(givers);
    h += '<div class="sec-h"><h2>Your tasks</h2>' + (S.me.is_admin || S.me.is_sl_head ? '<button class="btn sm sky" data-action="new-task" data-pid="">' + ICON.plus + 'Assign task</button>' : '<button class="btn sm" data-action="new-task" data-pid="">' + ICON.plus + 'Add my task</button>') + '</div>';
    if (gv.length) h += '<div class="muted small" style="margin:-6px 2px 0;font-weight:600">' + esc((gv.length > 1 ? gv.slice(0, -1).join(', ') + ' and ' + gv[gv.length - 1] : gv[0]) + ' gave you ' + myOpen.filter(function (t) { return t.created_by !== S.me.id; }).length + ' to do') + '</div>';
    h += '<div class="card flush list">' + (myOpen.length ? myOpen.map(function (t) {
      var due = t.due_date ? (t.due_date < today() ? '<span class="chip bad">Overdue</span>' : t.due_date === today() ? '<span class="chip warn">Due today</span>' : '<span class="chip">Due ' + esc(fmtDay(t.due_date)) + '</span>') : '';
      return '<div class="person"><div style="min-width:0;flex:1"><div class="nm">' + esc(t.title) + '</div>' +
        '<div class="muted small">' + esc(t.created_by === S.me.id ? 'Added by me' : 'From ' + first(nameOf(t.created_by))) + '</div>' +
        (due ? '<div style="margin-top:4px">' + due + '</div>' : '') + '</div>' +
        '<button class="btn sm primary" data-action="home-done" data-id="' + t.id + '">Done</button></div>';
    }).join('') : '<div class="empty">No tasks right now.</div>') + '</div>';
    if (mySent.length) h += '<div class="muted small" style="margin:-4px 2px 0">' + mySent.length + (mySent.length === 1 ? ' task is' : ' tasks are') + ' waiting for approval.</div>';
    if (pending) h += '<a class="card row between" href="#/approvals" style="text-decoration:none;color:inherit;background:var(--lime)"><div><b style="font-size:17px">' + pending + (pending === 1 ? ' thing is' : ' things are') + ' waiting for your approval</b><div class="small">Tap to review</div></div>' + ICON.chev + '</a>';
    pinned.forEach(function (x) {
      h += '<div class="card" style="background:var(--peach)"><div class="row between" style="align-items:flex-start"><div><span class="chip" style="background:#fff">Announcement</span>' +
        '<div style="font-weight:700;font-size:17px;margin-top:6px">' + esc(x.title) + '</div>' +
        (x.note ? '<div class="small" style="margin-top:2px">' + esc(x.note) + '</div>' : '') +
        (x.day ? '<div class="small" style="margin-top:2px;font-weight:600">' + esc(fmtLongDay(x.day)) + '</div>' : '') + '</div>' +
        (S.me.is_admin ? '<button class="linkbtn" data-action="plan-edit" data-id="' + x.id + '">Edit</button>' : '') + '</div></div>';
    });

    h += '<div class="sec-h"><h2>Coming up at EduMoon</h2>' + (S.me.is_admin ? '<button class="btn sm sky" data-action="plan-edit" data-id="">' + ICON.plus + 'Add</button>' : '') + '</div>' +
      '<div class="card flush list">' + (upcoming.length ? upcoming.map(function (x) {
        var dt = x.day ? new Date(x.day + 'T00:00:00') : null;
        return '<div class="person"><div class="datebox">' + (dt ? '<small>' + dt.toLocaleDateString('en-IN', { month: 'short' }) + '</small><b>' + dt.getDate() + '</b>' : '<small>Date</small><b>TBA</b>') + '</div>' +
          '<div style="min-width:0;flex:1"><div class="nm">' + esc(x.title) + '</div><div class="muted small">' + esc([x.note, x.owner ? 'Lead: ' + x.owner : ''].filter(Boolean).join(' · ')) + '</div></div>' +
          (S.me.is_admin ? '<button class="linkbtn" data-action="plan-edit" data-id="' + x.id + '">Edit</button>' : '') + '</div>';
      }).join('') : '<div class="empty">Nothing planned yet.' + (S.me.is_admin ? ' Add the hackathon, cohort or next team meetup.' : '') + '</div>') + '</div>';

    h += '<div class="sec-h"><h2>Top Student Leads this month</h2><a class="linkbtn" href="#/leaderboard">Leaderboard</a></div>' +
      '<div class="card flush list">' + (ranked.length ? ranked.map(function (r, i) {
        return '<div class="person"><b style="width:22px;font-size:17px">' + (i + 1) + '</b>' + avatar(r.p, i === 0 ? 'gold' : '') + '<div style="flex:1;min-width:0"><div class="nm">' + esc(r.p.name) + '</div>' +
          '<div class="muted small">' + esc((r.p.chapter || '').split(',')[0]) + '</div></div><b>' + r.s.points + ' pts</b></div>';
      }).join('') : '<div class="empty">No approved events this month yet.</div>') + '</div>';

    if (wins.length) {
      h += '<div class="sec-h"><h2>Recent wins</h2><a class="linkbtn" href="#/events">All events</a></div><div class="card flush list">' + wins.map(function (e) {
        var partners = (e.collab_with || []).map(function (id) { return first(nameOf(id)); });
        return '<div class="person">' + avatar(S.byId[e.person], '') + '<div style="min-width:0;flex:1"><div class="nm" style="font-size:14.5px">' +
          esc(first(nameOf(e.person)) + (partners.length ? ' and ' + partners.join(', ') : '') + ' hosted ' + e.title) + '</div>' +
          '<div class="muted small">' + esc(ruleLabel(e.type) + (e.attendees != null ? ' · ' + e.attendees + ' joined' : '') + ' · ' + fmtDay(e.day)) + '</div></div><span class="chip ok">+' + evPoints(e) + '</span></div>';
      }).join('') + '</div>';
    }

    h += '<div class="sec-h"><h2>What\'s on your mind?</h2></div>' +
      '<form class="card stack" id="idea-form" style="gap:10px" novalidate><label class="lbl" for="idea-body" style="margin:0">Share an idea, or what your college needs from EduMoon</label>' +
      '<textarea class="input" id="idea-body" maxlength="1000" placeholder="e.g. ABC College wants a resume workshop"></textarea>' +
      '<div class="row wrap"><label class="sr" for="idea-college">College (optional)</label><input class="input" id="idea-college" maxlength="160" placeholder="College (optional)" style="flex:1;min-width:160px" value="' + esc(S.me.chapter || '') + '">' +
      '<button class="btn primary" type="submit">Post</button></div><div class="err" id="idea-err" role="alert"></div></form>' +
      '<div class="stack" style="gap:12px">' + (ideas.length ? ideas.map(function (x) {
        var st = x.status === 'planned' ? '<span class="chip warn">Planned</span>' : x.status === 'done' ? '<span class="chip ok">Done</span>' : '';
        var canDel = x.author === S.me.id || S.me.is_admin;
        return '<div class="card idea" data-idea="' + x.id + '"><div class="row" style="align-items:flex-start;gap:12px">' +
          '<button class="vote' + (mine[x.id] ? ' on' : '') + '" data-action="idea-vote" data-id="' + x.id + '" aria-pressed="' + !!mine[x.id] + '" aria-label="Upvote">' + ICON.up + '<b>' + (votes[x.id] || 0) + '</b></button>' +
          '<div style="flex:1;min-width:0"><div style="font-size:15.5px;font-weight:600;white-space:pre-wrap">' + esc(x.body) + '</div>' +
          '<div class="muted small" style="margin-top:4px">' + esc(first(nameOf(x.author)) + (x.college ? ' · ' + x.college : '') + ' · ' + fmtWhen(x.created_at)) + '</div>' +
          '<div class="acts" style="margin-top:6px">' + st +
          '<button class="linkbtn" data-action="idea-replies" data-id="' + x.id + '">Replies (' + (replies[x.id] || 0) + ')</button>' +
          (S.me.is_admin ? '<label class="sr" for="is-' + x.id + '">Status</label><select class="input" style="height:34px;width:auto;font-size:13px;border-radius:10px;padding:0 6px" id="is-' + x.id + '" data-action="idea-status" data-id="' + x.id + '">' +
            [['new', 'New'], ['planned', 'Planned'], ['done', 'Done']].map(function (o) { return '<option value="' + o[0] + '"' + (x.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' : '') +
          (canDel ? '<button class="linkbtn" style="color:var(--bad)" data-action="idea-del" data-id="' + x.id + '">Delete</button>' : '') +
          '</div><div class="comments" data-box="idea-' + x.id + '" hidden style="margin-top:8px"></div></div></div></div>';
      }).join('') : '<div class="card empty">No ideas yet. Be the first.</div>') + '</div></div>';
    $view.innerHTML = h;

    document.getElementById('idea-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var body = document.getElementById('idea-body').value.trim(), $e = document.getElementById('idea-err');
      $e.textContent = '';
      if (!body) { $e.textContent = 'Write your idea first.'; document.getElementById('idea-body').focus(); return; }
      try { await q(sb.from('ideas').insert({ body: body, college: document.getElementById('idea-college').value.trim() || null })); }
      catch (er) { $e.textContent = errMsg(er); return; }
      toast('Posted'); rerender();
    });
  }

  async function loadIdeaReplies(id) {
    var b = box('idea-' + id); if (!b) return;
    b.innerHTML = '<div class="muted small">Loading...</div>';
    var rows = await q(sb.from('idea_replies').select('*').eq('idea_id', id).order('created_at'));
    b.innerHTML = (rows.length ? rows.map(function (c) {
      return '<div class="cm"><b>' + esc(nameOf(c.author)) + '</b><span class="tiny">' + esc(fmtWhen(c.created_at)) + '</span><p>' + esc(c.body) + '</p></div>';
    }).join('') : '<div class="muted small">No replies yet.</div>') +
      '<div class="row"><label class="sr" for="ir-' + id + '">Write a reply</label><input class="input" id="ir-' + id + '" maxlength="1000" placeholder="Write a reply">' +
      '<button class="btn sm primary" data-action="idea-reply-post" data-id="' + id + '">Post</button></div>';
  }

  async function openPlanForm(id) {
    var x = id ? await q(sb.from('plans').select('*').eq('id', id).maybeSingle()) : { title: '', day: '', owner: '', note: '', pinned: false };
    $modal.innerHTML = '<div class="modal-bg" data-action="modal-close-bg"><form class="modal stack" id="plan-form" novalidate role="dialog" aria-modal="true" aria-labelledby="pl-h">' +
      '<div class="row between"><h2 id="pl-h" style="font-size:20px">' + (id ? 'Edit' : 'Add to Coming up') + '</h2><button type="button" class="btn sm" data-action="modal-close">Close</button></div>' +
      '<div class="field"><label class="lbl" for="pl-title">What is coming up?</label><input class="input" id="pl-title" maxlength="160" placeholder="e.g. EduMoon Hackathon" value="' + esc(x.title) + '"></div>' +
      '<div class="grid2"><div class="field"><label class="lbl" for="pl-day">Date (leave empty for TBA)</label><input class="input" id="pl-day" type="date" value="' + esc(x.day || '') + '"></div>' +
      '<div class="field"><label class="lbl" for="pl-owner">Lead (optional)</label><input class="input" id="pl-owner" maxlength="120" value="' + esc(x.owner) + '"></div></div>' +
      '<div class="field"><label class="lbl" for="pl-note">Details (optional)</label><input class="input" id="pl-note" maxlength="500" value="' + esc(x.note) + '"></div>' +
      '<div class="checks" style="grid-template-columns:1fr"><label><input type="checkbox" id="pl-pin"' + (x.pinned ? ' checked' : '') + '>Show as an announcement at the top of Home</label></div>' +
      '<div class="err" id="pl-err" role="alert"></div><button class="btn primary big" type="submit">Save</button>' +
      (id ? '<button type="button" class="btn danger" data-action="plan-del" data-id="' + id + '">Delete</button>' : '') + '</form></div>';
    document.getElementById('pl-title').focus();
    document.getElementById('plan-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var $e = document.getElementById('pl-err'); $e.textContent = '';
      var row = {
        title: document.getElementById('pl-title').value.trim(), day: document.getElementById('pl-day').value || null,
        owner: document.getElementById('pl-owner').value.trim() || null, note: document.getElementById('pl-note').value.trim() || null,
        pinned: document.getElementById('pl-pin').checked
      };
      if (!row.title) { $e.textContent = 'Write what is coming up.'; return; }
      try {
        if (id) await q(sb.from('plans').update(row).eq('id', id));
        else await q(sb.from('plans').insert(row));
      } catch (er) { $e.textContent = errMsg(er); return; }
      closeModal(); toast('Saved'); rerender();
    });
  }

  // ---------- recruitment ----------
  async function viewRecruit(my) {
    var rows = await q(sb.from('recruits').select('*').order('updated_at', { ascending: false }).limit(500));
    if (my !== seq) return;
    S.recCache = {}; rows.forEach(function (r) { S.recCache[r.id] = r; });
    var m = today().slice(0, 7);
    var onMonth = rows.filter(function (r) { return r.status === 'onboarded' && r.onboarded_at && tsDay(r.onboarded_at).slice(0, 7) === m; }).length;
    var count = function (st) { return rows.filter(function (r) { return r.status === st; }).length; };
    var h = '<div class="stack"><div class="row between"><div><h1 style="font-size:28px;font-weight:700">Recruitment</h1><div class="muted">New Student Leads in the pipeline</div></div>' +
      '<button class="btn sm sky" data-action="recruit-edit" data-id="">' + ICON.plus + 'Add person</button></div>' +
      '<div class="grid3"><div class="stat" style="background:var(--lime)"><b>' + onMonth + '</b><span style="color:var(--ink)">Onboarded this month</span></div>' +
      '<div class="stat"><b>' + count('interested') + '</b><span>Interested</span></div><div class="stat"><b>' + count('contacted') + '</b><span>Contacted</span></div></div>';
    ['interested', 'contacted', 'onboarded', 'not_interested'].forEach(function (st) {
      var list = rows.filter(function (r) { return r.status === st; });
      if (!list.length) return;
      h += '<div class="sec-h"><h2>' + RECRUIT[st].label + ' (' + list.length + ')</h2></div><div class="card flush list">' + list.map(function (r) {
        return '<div class="task"><div class="row between" style="align-items:flex-start"><div style="min-width:0"><div class="t-title">' + esc(r.name) + '</div>' +
          '<div class="t-meta">' + esc([r.college, r.contact].filter(Boolean).join(' · ')) + '</div>' +
          (r.note ? '<div class="t-details">' + esc(r.note) + '</div>' : '') +
          '<div class="tiny muted" style="margin-top:4px">Added by ' + esc(first(nameOf(r.added_by))) + ' · updated ' + esc(fmtWhen(r.updated_at)) + '</div></div>' +
          '<span class="chip ' + RECRUIT[r.status].cls + '">' + RECRUIT[r.status].label + '</span></div>' +
          '<div class="acts"><label class="sr" for="rs-' + r.id + '">Status</label><select class="input" id="rs-' + r.id + '" data-action="recruit-status" data-id="' + r.id + '">' +
          Object.keys(RECRUIT).map(function (k) { return '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + RECRUIT[k].label + '</option>'; }).join('') + '</select>' +
          '<button class="linkbtn" data-action="recruit-edit" data-id="' + r.id + '">Edit</button>' +
          '<button class="linkbtn" style="color:var(--bad)" data-action="recruit-del" data-id="' + r.id + '">Delete</button></div></div>';
      }).join('') + '</div>';
    });
    if (!rows.length) h += '<div class="card empty">Nobody added yet. Add everyone you approach, and move them along as they reply.</div>';
    if (count('onboarded')) h += '<p class="muted small" style="margin:0 2px">When someone is onboarded, Vikas or Aparna adds them in Admin and creates their login.</p>';
    $view.innerHTML = h + '</div>';
  }

  function openRecruitForm(id) {
    var r = id ? S.recCache[id] : { name: '', college: '', contact: '', note: '', status: 'contacted' };
    $modal.innerHTML = '<div class="modal-bg" data-action="modal-close-bg"><form class="modal stack" id="rec-form" novalidate role="dialog" aria-modal="true" aria-labelledby="rc-h">' +
      '<div class="row between"><h2 id="rc-h" style="font-size:20px">' + (id ? 'Edit' : 'Add a person') + '</h2><button type="button" class="btn sm" data-action="modal-close">Close</button></div>' +
      '<div class="field"><label class="lbl" for="rc-name">Name</label><input class="input" id="rc-name" maxlength="120" value="' + esc(r.name) + '"></div>' +
      '<div class="field"><label class="lbl" for="rc-college">College</label><input class="input" id="rc-college" maxlength="160" value="' + esc(r.college) + '"></div>' +
      '<div class="field"><label class="lbl" for="rc-contact">Phone or Instagram (optional)</label><input class="input" id="rc-contact" maxlength="160" value="' + esc(r.contact) + '"></div>' +
      '<div class="field"><label class="lbl" for="rc-status">Status</label><select class="input" id="rc-status">' +
      Object.keys(RECRUIT).map(function (k) { return '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + RECRUIT[k].label + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label class="lbl" for="rc-note">Note (optional)</label><textarea class="input" id="rc-note" maxlength="1000">' + esc(r.note) + '</textarea></div>' +
      '<div class="err" id="rc-err" role="alert"></div><button class="btn primary big" type="submit">Save</button></form></div>';
    document.getElementById('rc-name').focus();
    document.getElementById('rec-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var $e = document.getElementById('rc-err'); $e.textContent = '';
      var row = {
        name: document.getElementById('rc-name').value.trim(), college: document.getElementById('rc-college').value.trim() || null,
        contact: document.getElementById('rc-contact').value.trim() || null, status: document.getElementById('rc-status').value,
        note: document.getElementById('rc-note').value.trim() || null
      };
      if (!row.name) { $e.textContent = 'Enter a name.'; return; }
      try {
        if (id) await q(sb.from('recruits').update(row).eq('id', id));
        else await q(sb.from('recruits').insert(row));
      } catch (er) { $e.textContent = errMsg(er); return; }
      closeModal(); toast('Saved'); rerender();
    });
  }

  // ---------- new for you ----------
  function seenKey() { return 'em_seen_' + S.me.id; }
  function lastSeen() {
    try { var v = localStorage.getItem(seenKey()); if (v) return v; } catch (e) { /* storage blocked */ }
    return new Date(Date.now() - 3 * 86400000).toISOString();
  }
  function markSeen() { try { localStorage.setItem(seenKey(), new Date().toISOString()); } catch (e) { /* ignore */ } }
  async function loadAlerts() {
    if (!S.me) return [];
    var since = lastSeen(), me = S.me.id;
    var res = await Promise.all([
      q(sb.from('tasks').select('id,title,created_by,created_at').eq('assignee', me).neq('created_by', me).gt('created_at', since).limit(50)),
      q(sb.from('tasks').select('id,title,verified_by,verified_at').eq('assignee', me).eq('status', 'done').gt('verified_at', since).limit(50)),
      q(sb.from('checkins').select('id,day,status,feedback,verified_by,verified_at').eq('person', me).in('status', ['approved', 'sent_back']).gt('verified_at', since).limit(50)),
      S.noUpgrade ? Promise.resolve([]) : q(sb.from('events').select('id,title,status,points,feedback,verified_by,verified_at,person,collab_with').or('person.eq.' + me + ',collab_with.cs.{' + me + '}').in('status', ['approved', 'sent_back']).gt('verified_at', since).limit(50))
    ]);
    var out = [];
    res[0].forEach(function (t) { out.push({ at: t.created_at, tone: 'task', href: '#/me', text: first(nameOf(t.created_by)) + ' gave you a task: ' + t.title }); });
    res[1].forEach(function (t) { if (t.verified_by !== me) out.push({ at: t.verified_at, tone: 'ok', href: '#/me', text: 'Task approved by ' + first(nameOf(t.verified_by)) + ': ' + t.title }); });
    res[2].forEach(function (c) {
      if (c.verified_by === me) return;
      out.push(c.status === 'approved' ?
        { at: c.verified_at, tone: 'ok', href: '#/checkin', text: 'Your check-in for ' + fmtDay(c.day) + ' was verified by ' + first(nameOf(c.verified_by)) } :
        { at: c.verified_at, tone: 'bad', href: '#/checkin', text: 'Your check-in for ' + fmtDay(c.day) + ' was sent back' + (c.feedback ? ': ' + c.feedback : '') });
    });
    res[3].forEach(function (e) {
      if (e.verified_by === me) return;
      out.push(e.status === 'approved' ?
        { at: e.verified_at, tone: 'ok', href: '#/events', text: 'Your event ' + e.title + ' was approved, +' + evPoints(e) + ' points. Share your card.' } :
        { at: e.verified_at, tone: 'bad', href: '#/events', text: 'Your event ' + e.title + ' was sent back' + (e.feedback ? ': ' + e.feedback : '') });
    });
    out.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    return out.slice(0, 10);
  }

  // ---------- weekly summary for admins ----------
  function weeklySummary(openTasks, cis, evs, doneTasks) {
    var from = addDays(today(), -6), t0 = today();
    var inWeek = function (d) { return d && d >= from && d <= t0; };
    var worked = {}, evCount = 0, perPerson = {}, last = {};
    function bump(pid, n) { perPerson[pid] = (perPerson[pid] || 0) + n; }
    function seen(pid, d) { if (d && (!last[pid] || d > last[pid])) last[pid] = d; }
    cis.forEach(function (c) {
      if (c.status !== 'sent_back') seen(c.person, c.day);
      if (c.status === 'approved' && inWeek(c.day)) { worked[c.person + '|' + c.day] = 1; }
    });
    evs.forEach(function (e) {
      creditedIds(e).forEach(function (pid) {
        if (e.status !== 'sent_back') seen(pid, e.day);
        if (e.status === 'approved' && inWeek(e.day)) { worked[pid + '|' + e.day] = 1; bump(pid, 2); }
      });
      if (e.status === 'approved' && inWeek(e.day)) evCount++;
    });
    var tasksDone = 0;
    doneTasks.forEach(function (t) {
      seen(t.assignee, tsDay(t.submitted_at));
      if (t.status === 'done' && inWeek(tsDay(t.verified_at))) { tasksDone++; bump(t.assignee, 1); }
    });
    Object.keys(worked).forEach(function (k) { bump(k.split('|')[0], 1); });
    var overdue = openTasks.filter(function (t) { return t.due_date && t.due_date < t0; }).length;
    var active = Object.keys(perPerson).filter(function (id) { return S.byId[id]; })
      .sort(function (a, b) { return perPerson[b] - perPerson[a]; }).slice(0, 3);
    var people = S.people.filter(function (p) { return p.active && !p.is_private && !p.is_admin && p.id !== S.me.id && canSeeCheckins(p); });
    var notYet = people.map(function (p) {
      var d = last[p.id];
      return { p: p, gap: d ? daysBetween(d, t0) : null };
    }).filter(function (x) { return x.gap === null || x.gap >= 5; })
      .sort(function (a, b) { return (b.gap === null ? 999 : b.gap) - (a.gap === null ? 999 : a.gap); });
    var h = '<div class="card stack week" style="gap:12px"><div class="row between"><h2 style="font-size:18px">This week</h2><span class="muted small" style="font-weight:600">' + esc(fmtDay(from) + ' to ' + fmtDay(t0)) + '</span></div>' +
      '<div class="grid2" style="grid-template-columns:repeat(4,minmax(0,1fr))">' +
      '<div class="stat" style="background:var(--lime)"><b>' + evCount + '</b><span style="color:var(--ink)">Events</span></div>' +
      '<div class="stat"><b>' + Object.keys(worked).length + '</b><span>Worked days</span></div>' +
      '<div class="stat"><b>' + tasksDone + '</b><span>Tasks done</span></div>' +
      '<div class="stat" style="' + (overdue ? 'background:var(--badbg)' : '') + '"><b>' + overdue + '</b><span>Overdue</span></div></div>';
    if (active.length) h += '<div class="small"><b>Most active:</b> ' + active.map(function (id) { return '<a href="#/person/' + id + '">' + esc(first(nameOf(id))) + '</a>'; }).join(', ') + '</div>';
    if (notYet.length) {
      h += '<div><div class="small" style="font-weight:700;margin-bottom:6px">Not yet started</div><div class="ny-list">' + notYet.slice(0, 8).map(function (x) {
        return '<a class="ny-row" href="#/person/' + x.p.id + '">' + avatar(x.p, '') + '<span style="flex:1;min-width:0"><b>' + esc(first(x.p.name)) + '</b> <span class="muted small">' +
          esc(x.gap === null ? 'no activity yet' : 'no activity in ' + x.gap + ' days') + '</span></span></a>';
      }).join('') + (notYet.length > 8 ? '<div class="muted small">and ' + (notYet.length - 8) + ' more</div>' : '') + '</div></div>';
    }
    return h + '</div>';
  }

  // ---------- pending from the team (admins) ----------
  function pendingFromTeam(openTasks) {
    var t0 = today(), f = S.pfFilter || 'all';
    S.taskCache = S.taskCache || {};
    var list = openTasks.filter(function (t) {
      S.taskCache[t.id] = t;
      if (!S.byId[t.assignee]) return false;
      if (f === 'overdue') return t.due_date && t.due_date < t0;
      if (f === 'mine') return t.created_by === S.me.id;
      return true;
    }).sort(function (a, b) {
      var ao = a.due_date && a.due_date < t0 ? 0 : 1, bo = b.due_date && b.due_date < t0 ? 0 : 1;
      if (ao !== bo) return ao - bo;
      var ad = a.due_date || '9999', bd = b.due_date || '9999';
      return ad < bd ? -1 : ad > bd ? 1 : (a.created_at < b.created_at ? -1 : 1);
    });
    var shown = S.pfAll ? list : list.slice(0, 8);
    var h = '<div class="sec-h"><h2>Pending from the team <span class="muted" style="font-size:15px">(' + openTasks.length + ')</span></h2></div>' +
      '<div class="seg" role="group" aria-label="Filter pending">' + [['all', 'All'], ['overdue', 'Overdue'], ['mine', 'Assigned by me']].map(function (x) {
        return '<button class="' + (f === x[0] ? 'on' : '') + '" data-action="pf-filter" data-f="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="card flush list">' + (shown.length ? shown.map(function (t) {
        var p = S.byId[t.assignee];
        var chip = t.due_date && t.due_date < t0 ? '<span class="chip bad">Overdue ' + daysBetween(t.due_date, t0) + 'd</span>' :
          t.due_date ? '<span class="chip">Due ' + esc(fmtDay(t.due_date)) + '</span>' :
          '<span class="chip ' + (STATUS[t.status] || {}).cls + '">' + esc((STATUS[t.status] || { label: t.status }).label) + '</span>';
        return '<div class="person">' + avatar(p, '') + '<a href="#/person/' + p.id + '" style="min-width:0;flex:1;text-decoration:none;color:inherit">' +
          '<div class="nm" style="font-size:14.5px">' + esc(first(p.name)) + ' · ' + esc(t.title) + '</div>' +
          '<div style="margin-top:4px" class="row wrap">' + chip + '<span class="muted tiny">from ' + esc(t.created_by === S.me.id ? 'you' : first(nameOf(t.created_by))) + '</span></div></a>' +
          '<button class="btn sm" data-action="remind" data-id="' + t.id + '">Remind</button></div>';
      }).join('') : '<div class="empty">Nothing pending here. Nice.</div>') + '</div>' +
      (list.length > 8 ? '<button class="linkbtn" data-action="pf-all">' + (S.pfAll ? 'Show less' : 'Show all ' + list.length) + '</button>' : '');
    return h;
  }
  function remindTask(id) {
    var t = (S.taskCache || {})[id]; if (!t) return;
    var p = S.byId[t.assignee], t0 = today();
    var msg = 'Hi ' + first(p.name) + ', a quick reminder about "' + t.title + '"';
    if (t.due_date && t.due_date < t0) msg += '. It is ' + daysBetween(t.due_date, t0) + ' days overdue';
    else if (t.due_date) msg += ', due ' + fmtDay(t.due_date);
    msg += '. Please update it on the EduMoon Team portal: ' + location.origin + location.pathname;
    var w = window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    if (!w) {
      try { navigator.clipboard.writeText(msg); toast('Reminder copied. Paste it in WhatsApp.'); } catch (e) { toast('Could not open WhatsApp'); }
    }
  }

  // ---------- share cards ----------
  function loadImg(src) {
    return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; });
  }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrap(c, text, maxW, maxLines) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += '...'; }
    return lines;
  }
  function fitFont(c, text, weight, size, minSize, maxW) {
    var f = size; c.font = weight + ' ' + f + 'px "Space Grotesk", sans-serif';
    while (c.measureText(text).width > maxW && f > minSize) { f -= 2; c.font = weight + ' ' + f + 'px "Space Grotesk", sans-serif'; }
    return f;
  }
  var INK = '#16132B', VIOLET = '#6C47FF', LIME = '#C4F23A', PINK = '#FF7AC6', CREAM = '#FFF8EC', PEACH = '#FFB86B';
  async function drawCard(cv, d, square) {
    var W = 1080, H = square ? 1080 : 1920;
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    try { await document.fonts.load('700 60px "Space Grotesk"'); await document.fonts.load('500 30px "Space Grotesk"'); } catch (e) { /* fallback font */ }
    var photo = d.p && d.p.photo ? await loadImg('assets/photos/' + d.p.photo + '?v=1') : null;
    var logo = await loadImg('assets/logo.png');
    c.fillStyle = VIOLET; c.fillRect(0, 0, W, H);
    c.lineWidth = 6; c.strokeStyle = INK;
    c.fillStyle = PINK; c.beginPath(); c.arc(W - 60, square ? 40 : 120, 230, 0, Math.PI * 2); c.fill(); c.stroke();
    c.save(); c.translate(150, H - 60); c.rotate(0.3); c.fillStyle = LIME; rrect(c, -140, -140, 280, 280, 60); c.fill(); c.stroke(); c.restore();
    // header
    var hy = square ? 70 : 120;
    if (logo) { c.save(); rrect(c, 70, hy - 40, 84, 84, 22); c.clip(); c.drawImage(logo, 70, hy - 40, 84, 84); c.restore(); rrect(c, 70, hy - 40, 84, 84, 22); c.stroke(); }
    c.fillStyle = '#fff'; c.font = '700 54px "Space Grotesk", sans-serif'; c.textBaseline = 'middle'; c.fillText('EduMoon', 176, hy + 2);
    // card
    var cx = 70, cy = square ? 160 : 240, cw = W - 140, ch = square ? 840 : 1580;
    c.fillStyle = INK; rrect(c, cx + 16, cy + 16, cw, ch, 48); c.fill();
    c.fillStyle = CREAM; rrect(c, cx, cy, cw, ch, 48); c.fill(); c.lineWidth = 6; c.stroke();
    var pr = square ? 105 : 170, px = square ? cx + 70 + pr : W / 2, py = square ? cy + 70 + pr : cy + 70 + pr;
    c.save(); c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.closePath(); c.clip();
    if (photo) {
      var sz = Math.min(photo.width, photo.height);
      c.drawImage(photo, (photo.width - sz) / 2, (photo.height - sz) / 2, sz, sz, px - pr, py - pr, pr * 2, pr * 2);
    } else { c.fillStyle = LIME; c.fillRect(px - pr, py - pr, pr * 2, pr * 2); c.fillStyle = INK; c.font = '700 ' + Math.round(pr * 0.8) + 'px "Space Grotesk", sans-serif'; c.textAlign = 'center'; c.fillText(initials(d.p ? d.p.name : '?'), px, py + 4); c.textAlign = 'left'; }
    c.restore(); c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.lineWidth = 8; c.stroke();
    // text block
    var tx, ty, tw, center = !square;
    if (square) { tx = px + pr + 50; ty = cy + 110; tw = cx + cw - 60 - tx; } else { tx = W / 2; ty = py + pr + 110; tw = cw - 120; }
    c.textAlign = center ? 'center' : 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = INK; fitFont(c, d.p ? d.p.name : '', 700, square ? 56 : 84, 36, tw); c.fillText(d.p ? d.p.name : '', tx, ty);
    ty += square ? 52 : 75; c.fillStyle = '#4A4566'; c.font = '600 ' + (square ? 30 : 42) + 'px "Space Grotesk", sans-serif';
    c.fillText(d.idLine, tx, ty);
    ty += square ? 44 : 62; c.font = '500 ' + (square ? 28 : 38) + 'px "Space Grotesk", sans-serif';
    wrap(c, d.college || '', tw, 2).forEach(function (l) { c.fillText(l, tx, ty); ty += square ? 38 : 52; });
    if (square) { tx = cx + 70; tw = cw - 140; ty = py + pr + 90; c.textAlign = 'left'; }
    else ty += 80;
    // pill
    c.font = '700 ' + (square ? 30 : 44) + 'px "Space Grotesk", sans-serif';
    var pw = c.measureText(d.pill).width + 64, ph = square ? 60 : 86;
    var pxl = center ? tx - pw / 2 : tx;
    c.fillStyle = LIME; rrect(c, pxl, ty - ph + 14, pw, ph, ph / 2); c.fill(); c.lineWidth = 5; c.stroke();
    c.fillStyle = INK; c.textAlign = 'center'; c.fillText(d.pill, pxl + pw / 2, ty - ph / 2 + (square ? 26 : 30)); c.textAlign = center ? 'center' : 'left';
    ty += square ? 70 : 120;
    c.fillStyle = '#4A4566'; c.font = '600 ' + (square ? 32 : 46) + 'px "Space Grotesk", sans-serif'; c.fillText(d.kicker, tx, ty);
    ty += square ? 64 : 100; c.fillStyle = INK; if (square) c.font = '700 58px "Space Grotesk", sans-serif'; else fitFont(c, d.title, 700, 96, 64, tw);
    wrap(c, d.title, tw, 2).forEach(function (l) { c.fillText(l, tx, ty); ty += square ? 66 : 108; });
    if (d.withLine) { c.font = '600 ' + (square ? 30 : 38) + 'px "Space Grotesk", sans-serif'; c.fillStyle = '#4A4566'; c.fillText(d.withLine, tx, ty - (square ? 12 : 20)); ty += square ? 40 : 50; }
    ty += 20;
    if (!square) ty = cy + ch - 270;
    if (d.big) { c.fillStyle = VIOLET; c.font = '700 ' + (square ? 64 : 130) + 'px "Space Grotesk", sans-serif'; c.fillText(d.big, tx, ty); ty += square ? 46 : 70; c.fillStyle = INK; c.font = '600 ' + (square ? 30 : 40) + 'px "Space Grotesk", sans-serif'; c.fillText(d.bigLabel, tx, ty); }
    // footer
    var fy = cy + ch - (square ? 50 : 80);
    c.font = '600 ' + (square ? 28 : 34) + 'px "Space Grotesk", sans-serif'; c.fillStyle = '#4A4566';
    c.fillText(d.foot, center ? W / 2 : cx + 70, fy);
    c.textAlign = 'left';
  }
  function eventCardData(e) {
    var ids = creditedIds(e);
    var subject = ids.indexOf(S.me.id) >= 0 ? S.me.id : e.person;
    var p = S.byId[subject];
    var others = ids.filter(function (x) { return x !== subject; }).map(function (x) { return first(nameOf(x)); });
    return {
      p: p, idLine: 'Student Lead' + (p && p.em_id ? ' · ' + p.em_id : ''), college: p && p.chapter,
      pill: 'SUCCESSFULLY HOSTED', kicker: ruleLabel(e.type), title: e.title,
      withLine: others.length ? 'with ' + others.join(', ') : '',
      big: e.attendees != null ? e.attendees + '+' : '', bigLabel: 'students joined',
      foot: fmtLongDay(e.day) + ' · +' + evPoints(e) + ' points · theedumoon.com'
    };
  }
  function rankCardData(r, i, month) {
    return {
      p: r.p, idLine: 'Student Lead' + (r.p.em_id ? ' · ' + r.p.em_id : ''), college: r.p.chapter,
      pill: '#' + (i + 1) + ' STUDENT LEAD', kicker: 'EduMoon Student Leads', title: 'Ranked #' + (i + 1) + ' in ' + monthLabel(month).split(' ')[0],
      withLine: '', big: String(r.s.points), bigLabel: 'points · ' + r.s.events + (r.s.events === 1 ? ' event' : ' events') + ' · ' + r.s.reached + ' students reached',
      foot: monthLabel(month) + ' · theedumoon.com'
    };
  }
  async function openShare(d, fileBase) {
    S.share = { d: d, square: false, name: fileBase };
    $modal.innerHTML = '<div class="modal-bg" data-action="modal-close-bg"><div class="modal stack" role="dialog" aria-modal="true" aria-labelledby="sh-h">' +
      '<div class="row between"><h2 id="sh-h" style="font-size:20px">Share your card</h2><button type="button" class="btn sm" data-action="modal-close">Close</button></div>' +
      '<div class="seg" role="group" aria-label="Size"><button class="on" data-action="share-size" data-s="story" aria-pressed="true">Story</button><button data-action="share-size" data-s="square" aria-pressed="false">Square</button></div>' +
      '<canvas id="share-cv" role="img" aria-label="Share card preview" style="width:100%;height:auto;border-radius:16px;border:var(--b)"></canvas>' +
      '<div class="grid2"><button class="btn primary big" data-action="share-go">Share</button><button class="btn big" data-action="share-dl">Download</button></div>' +
      '<p class="muted tiny" style="margin:0">Post it on your WhatsApp status or Instagram story and tag EduMoon.</p></div></div>';
    await drawCard(document.getElementById('share-cv'), d, false);
  }
  function shareBlob() {
    return new Promise(function (ok) { document.getElementById('share-cv').toBlob(ok, 'image/png'); });
  }
  async function shareGo() {
    var blob = await shareBlob();
    var file = new File([blob], S.share.name + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: 'Proud to be an EduMoon Student Lead' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    shareDownload(blob);
  }
  function shareDownload(blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = S.share.name + '.png';
    document.body.appendChild(a); a.click(); a.remove(); toast('Saved. Post it from your gallery.');
  }

  // ---------- team calendar (admins and the Lead Head) ----------
  async function viewTeamCal(my) {
    var month = S.tcMonth || today().slice(0, 7);
    var from = month + '-01', to = monthEnd(month);
    var res = await Promise.all([
      q(sb.from('checkins').select('*').gte('day', from).lte('day', to).limit(5000)),
      q(sb.from('events').select('*').gte('day', from).lte('day', to).neq('status', 'sent_back').limit(5000))
    ]);
    if (my !== seq) return;
    var byDay = {};
    function add(d, x) { (byDay[d] = byDay[d] || []).push(x); }
    res[0].forEach(function (c) {
      var p = S.byId[c.person];
      if (!p || !canSeeCheckins(p) || c.status === 'sent_back') return;
      var t = c.status === 'approved' ? 'work' : c.status === 'excused' ? 'off' : 'wait';
      S.ciCache = S.ciCache || {}; S.ciCache[c.id] = c;
      add(c.day, { t: t, p: p, label: (KINDS[c.kind] || { label: c.kind }).label + (c.detail ? ': ' + c.detail : ''), ci: c });
    });
    res[1].forEach(function (e) {
      add(e.day, { t: e.status === 'approved' ? 'event' : 'wait', p: S.byId[e.person], label: e.title + ' · ' + ruleLabel(e.type) + (e.attendees != null ? ' · ' + e.attendees + ' joined' : ''), ev: e,
        partners: (e.collab_with || []).map(function (id) { return first(nameOf(id)); }) });
    });
    var order = { event: 0, work: 1, wait: 2, off: 3 };
    Object.keys(byDay).forEach(function (d) { byDay[d].sort(function (a, b) { return order[a.t] - order[b.t]; }); });
    var sel = S.tcDay && S.tcDay.slice(0, 7) === month ? S.tcDay : (month === today().slice(0, 7) ? today() : from);
    var totals = { event: 0, work: 0, wait: 0, off: 0 };
    Object.keys(byDay).forEach(function (d) { byDay[d].forEach(function (x) { totals[x.t]++; }); });

    var startDow = (new Date(from + 'T00:00:00').getDay() + 6) % 7, cells = '';
    for (var i = 0; i < startDow; i++) cells += '<div class="tc-cell empty"></div>';
    for (var d = from; d <= to; d = addDays(d, 1)) {
      var list = byDay[d] || [];
      var dots = list.slice(0, 8).map(function (x) { return '<i class="tc-dot ' + x.t + '"></i>'; }).join('') + (list.length > 8 ? '<em>+' + (list.length - 8) + '</em>' : '');
      cells += '<button class="tc-cell' + (d === sel ? ' sel' : '') + (d === today() ? ' now' : '') + (S.offDays[d] ? ' off' : '') + '" data-action="tc-day" data-day="' + d + '" aria-label="' + esc(fmtDay(d) + ', ' + list.length + ' items') + '">' +
        '<span class="tc-n">' + Number(d.slice(8)) + '</span><span class="tc-dots">' + dots + '</span></button>';
    }
    var items = byDay[sel] || [];
    var tags = { event: '<span class="chip" style="background:var(--lime)">Event</span>', work: '<span class="chip navy">Worked</span>', wait: '<span class="chip warn">Waiting</span>', off: '<span class="chip">Excused</span>' };
    var canNext = month < today().slice(0, 7);
    var h = '<div class="stack"><div><h1 style="font-size:28px;font-weight:700">Team calendar</h1><div class="muted">Everyone\'s work and events in one place</div></div>' +
      '<div class="card stack"><div class="row between"><button class="btn sm" data-action="tc-month" data-m="' + shiftMonth(month, -1) + '" aria-label="Previous month">' + ICON.left + '</button>' +
      '<div style="text-align:center"><h2 style="font-size:18px">' + esc(monthLabel(month)) + '</h2><div class="muted small">' + totals.event + ' events · ' + totals.work + ' worked days · ' + totals.wait + ' waiting</div></div>' +
      '<button class="btn sm" data-action="tc-month" data-m="' + shiftMonth(month, 1) + '" aria-label="Next month"' + (canNext ? '' : ' disabled') + '>' + ICON.chev + '</button></div>' +
      '<div class="cal-head"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>' +
      '<div class="tc-grid">' + cells + '</div>' +
      '<div class="legend"><span><i class="tc-dot event"></i>Event</span><span><i class="tc-dot work"></i>Worked</span><span><i class="tc-dot wait"></i>Waiting approval</span><span><i class="tc-dot off"></i>Excused</span></div></div>' +
      '<div class="sec-h"><h2>' + esc(fmtLongDay(sel)) + '</h2><span class="muted small" style="font-weight:600">' + items.length + '</span></div>' +
      (S.offDays[sel] ? '<div class="card" style="background:var(--soft);box-shadow:none">Team off day: ' + esc(S.offDays[sel]) + '</div>' : '') +
      '<div class="card flush list">' + (items.length ? items.map(function (x) {
        var who = x.p ? first(x.p.name) + (x.partners && x.partners.length ? ' and ' + x.partners.join(', ') : '') : 'Someone';
        return '<div class="person">' + avatar(x.p, '') + '<div style="min-width:0;flex:1"><div class="nm" style="font-size:14.5px">' + esc(who) + '</div>' +
          '<div class="muted small">' + esc(x.label) + '</div>' +
          (x.ci && canEditCi(x.p) ? '<button class="linkbtn" data-action="ci-edit" data-id="' + x.ci.id + '">Edit check-in</button>' : '') + '</div>' + tags[x.t] + '</div>';
      }).join('') : '<div class="empty">Nothing logged on this day.</div>') + '</div></div>';
    $view.innerHTML = h;
  }

  // ---------- export for the Chapters site ----------
  async function openExport() {
    var rows = await q(sb.from('events').select('*').eq('status', 'approved').order('day').limit(5000));
    var lines = [];
    rows.forEach(function (e) {
      creditedIds(e).forEach(function (pid) {
        var p = S.byId[pid];
        if (!p || !p.em_id) return;
        var o = '  { lead: ' + JSON.stringify(p.em_id) + ', date: ' + JSON.stringify(e.day) + ', type: ' + JSON.stringify(e.type);
        if (e.club) o += ', club: ' + JSON.stringify(e.club);
        o += ', title: ' + JSON.stringify(e.title) + ' },';
        lines.push(o);
      });
    });
    var pts = S.ruleList.map(function (r) { return r.type + ': ' + r.points; }).join(', ');
    var text = '// Exported from the EduMoon Team Portal on ' + fmtLongDay(today()) + '\n' +
      'window.POINTS = { ' + pts + ' };\n' +
      'window.LEADERBOARD = { month: "' + today().slice(0, 7) + '", updated: "' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + '" };\n' +
      'window.ACTIVITY = [\n' + lines.join('\n') + '\n];\n';
    $modal.innerHTML = '<div class="modal-bg" data-action="modal-close-bg"><div class="modal stack" role="dialog" aria-modal="true" aria-labelledby="ex-h">' +
      '<div class="row between"><h2 id="ex-h" style="font-size:20px">Export for Chapters</h2><button type="button" class="btn sm" data-action="modal-close">Close</button></div>' +
      '<ol class="small" style="margin:0;padding-left:20px;line-height:1.7"><li>Copy the text below.</li><li>In the chapters repo, open <b>assets/data.js</b> and click the pencil to edit.</li>' +
      '<li>Replace the three blocks that start with <b>window.POINTS</b>, <b>window.LEADERBOARD</b> and <b>window.ACTIVITY</b> with this text.</li><li>Commit. The Chapters leaderboard updates in a minute.</li></ol>' +
      '<p class="muted tiny" style="margin:0">' + rows.length + ' approved events, ' + lines.length + ' lines. Only Student Leads with an EduMoon ID are included.</p>' +
      '<label class="sr" for="ex-text">Export text</label><textarea class="input" id="ex-text" readonly style="min-height:220px;font-family:ui-monospace,Menlo,monospace;font-size:12px">' + esc(text) + '</textarea>' +
      '<div class="grid2"><button class="btn primary" data-action="export-copy">Copy</button><button class="btn" data-action="export-download">Download</button></div></div></div>';
    S.exportText = text;
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
    if (a === 'more') { openMore(); return; }
    if (a === 'ci-edit') { openCheckinEdit(id); return; }
    if (a === 'alerts-seen') { markSeen(); rerender(); return; }
    if (a === 'pf-filter') { S.pfFilter = el.getAttribute('data-f'); route(); return; }
    if (a === 'pf-all') { S.pfAll = !S.pfAll; route(); return; }
    if (a === 'remind') { remindTask(id); return; }
    if (a === 'share-ev') { var se = (S.evAll || {})[id]; if (se) await openShare(eventCardData(se), 'edumoon-' + se.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()); return; }
    if (a === 'share-rank') { var rk = S.top3 && S.top3.list[+el.getAttribute('data-i')]; if (rk) await openShare(rankCardData(rk, +el.getAttribute('data-i'), S.top3.month), 'edumoon-top-' + S.top3.month); return; }
    if (a === 'share-size') {
      var sq = el.getAttribute('data-s') === 'square'; S.share.square = sq;
      [].forEach.call(el.parentNode.children, function (b) { var on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      await drawCard(document.getElementById('share-cv'), S.share.d, sq); return;
    }
    if (a === 'share-go') { await shareGo(); return; }
    if (a === 'share-dl') { shareDownload(await shareBlob()); return; }
    if (a === 'home-done') {
      var selfVerify = canVerify(S.me);
      if (await act(function () { return q(sb.from('tasks').update({ status: selfVerify ? 'done' : 'submitted' }).eq('id', id)); }, el)) {
        toast(selfVerify ? 'Marked done' : 'Sent for approval'); rerender();
      }
      return;
    }
    if (a === 'tc-day') { S.tcDay = el.getAttribute('data-day'); route(); return; }
    if (a === 'tc-month') { S.tcMonth = el.getAttribute('data-m'); S.tcDay = null; route(); return; }
    if (a === 'log-event') { openEventForm(null); return; }
    if (a === 'ev-edit') { openEventForm(id); return; }
    if (a === 'ev-filter') { S.evFilter = el.getAttribute('data-f'); route(); return; }
    if (a === 'lb-period') { S.lbPeriod = el.getAttribute('data-p'); route(); return; }
    if (a === 'plan-edit') { openPlanForm(id || null); return; }
    if (a === 'recruit-edit') { openRecruitForm(id || null); return; }
    if (a === 'export') { await act(openExport, el); el.disabled = false; return; }
    if (a === 'export-copy') {
      var ta = document.getElementById('ex-text');
      try { await navigator.clipboard.writeText(S.exportText); } catch (er) { ta.select(); document.execCommand('copy'); }
      toast('Copied'); return;
    }
    if (a === 'export-download') {
      var blob = new Blob([S.exportText], { type: 'text/plain' });
      var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'chapters-activity-' + today() + '.txt';
      document.body.appendChild(link); link.click(); link.remove(); return;
    }
    if (a === 'ev-approve') {
      if (await act(function () { return q(sb.from('events').update({ status: 'approved' }).eq('id', id)); }, el)) { toast('Approved, points added'); rerender(); }
      return;
    }
    if (a === 'ev-back') { var eb = box('ev-back-' + id); eb.hidden = !eb.hidden; if (!eb.hidden) document.getElementById('eb-' + id).focus(); return; }
    if (a === 'ev-back-confirm') {
      var efb = document.getElementById('eb-' + id).value.trim();
      if (!efb) { document.getElementById('eb-' + id).focus(); return; }
      if (await act(function () { return q(sb.from('events').update({ status: 'sent_back', feedback: efb }).eq('id', id)); }, el)) { toast('Sent back'); rerender(); }
      return;
    }
    if (a === 'ev-delete' || a === 'plan-del' || a === 'idea-del' || a === 'recruit-del') {
      if (el.getAttribute('data-sure') !== '1') { el.setAttribute('data-sure', '1'); el.textContent = 'Tap again to delete'; return; }
      var tbl = { 'ev-delete': 'events', 'plan-del': 'plans', 'idea-del': 'ideas', 'recruit-del': 'recruits' }[a];
      if (await act(function () { return q(sb.from(tbl).delete().eq('id', id)); }, el)) { closeModal(); toast('Deleted'); rerender(); }
      return;
    }
    if (a === 'idea-vote') {
      var on = el.getAttribute('aria-pressed') === 'true';
      var ok2 = await act(function () {
        return on ? q(sb.from('idea_votes').delete().eq('idea_id', id).eq('person', S.me.id))
          : q(sb.from('idea_votes').insert({ idea_id: id, person: S.me.id }));
      }, el);
      if (ok2) {
        var n = +el.querySelector('b').textContent + (on ? -1 : 1);
        el.querySelector('b').textContent = n; el.setAttribute('aria-pressed', String(!on)); el.classList.toggle('on', !on); el.disabled = false;
      }
      return;
    }
    if (a === 'idea-replies') {
      var ib = box('idea-' + id); if (!ib) return;
      ib.hidden = !ib.hidden;
      if (!ib.hidden) await act(function () { return loadIdeaReplies(id); });
      return;
    }
    if (a === 'idea-reply-post') {
      var ri = document.getElementById('ir-' + id), rb = ri.value.trim();
      if (!rb) { ri.focus(); return; }
      if (await act(function () { return q(sb.from('idea_replies').insert({ idea_id: id, author: S.me.id, body: rb })); }, el)) await loadIdeaReplies(id);
      return;
    }
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
          if (it.type === 'ev') await q(sb.from('events').update({ status: 'approved' }).eq('id', it.row.id));
          else if (it.type === 'ci') await q(sb.from('checkins').update({ status: 'approved' }).eq('id', it.row.id));
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
    var ca = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');
    if (ca === 'idea-status') {
      if (await act(function () { return q(sb.from('ideas').update({ status: el.value }).eq('id', id)); })) toast('Updated');
      return;
    }
    if (ca === 'recruit-status') {
      if (await act(function () { return q(sb.from('recruits').update({ status: el.value }).eq('id', id)); })) { toast('Updated'); rerender(); }
      return;
    }
    if (ca !== 'task-status') return;
    var ok = await act(function () { return q(sb.from('tasks').update({ status: el.value }).eq('id', id)); });
    if (ok) { toast('Status updated'); rerender(); }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && $modal.innerHTML) closeModal();
  });

  boot();
})();
