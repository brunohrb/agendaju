/* ═══════════════════════════════════════════════
   AGENDA JU — app.js
   Vanilla JS · Supabase backend
═══════════════════════════════════════════════ */
'use strict';

// ── SUPABASE INIT ──────────────────────────────
// Tabelas no schema public com prefixo aju_ para não conflitar
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CONSTANTS ──────────────────────────────────
const NOTE_COLORS  = ['#fce7f3','#ede9fe','#dbeafe','#dcfce7','#fef9c3','#ffedd5','#f3f4f6'];
const EVENT_COLORS = ['#f9a8d4','#c4b5fd','#93c5fd','#6ee7b7','#fcd34d','#fdba74'];
const PTBR = {
  months: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
  days:   ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
  monthsShort: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
};
const PAGE_TITLES = {
  dashboard: 'Início', agenda: 'Agenda', lembretes: 'Lembretes',
  notas: 'Notas', mercado: 'Lista de Mercado', habitos: 'Hábitos',
  financas: 'Finanças', cofre: 'Cofre', config: 'Configurações'
};

// ── STATE ──────────────────────────────────────
const State = {
  user: null,
  page: 'dashboard',
  cal: { year: new Date().getFullYear(), month: new Date().getMonth(), selected: new Date() },
  data: { reminders:[], notes:[], events:[], habits:[], habitLogs:[], finances:[], shopping:[], vault:[] },
  notifTimers: [],
  finFilter: 'expense'
};

// ── UTILS ──────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = (d, opts) => new Intl.DateTimeFormat('pt-BR', opts).format(new Date(d));
const today = () => new Date().toISOString().slice(0,10);
const todayFull = () => fmt(new Date(), { weekday:'long', year:'numeric', month:'long', day:'numeric' });
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const currency = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);

async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const t = today();
  const tom = new Date(); tom.setDate(tom.getDate()+1);
  if (dateStr === t) return 'Hoje';
  if (dateStr === tom.toISOString().slice(0,10)) return 'Amanhã';
  return fmt(d,{day:'2-digit',month:'2-digit',year:'numeric'});
}
function isOverdue(dateStr) {
  if (!dateStr) return false;
  return dateStr < today();
}
function badgePriority(p) {
  const m = { high:'Alta 🔴', medium:'Média 🟡', low:'Baixa 🟢' };
  const cls = { high:'badge-high', medium:'badge-medium', low:'badge-low' };
  return `<span class="badge ${cls[p]||''}">${m[p]||p}</span>`;
}

// ── TOAST ──────────────────────────────────────
function toast(msg, type='success') {
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]||'✅'}</span><span>${msg}</span>`;
  $('toasts').prepend(el);
  setTimeout(() => el.style.opacity='0', 2800);
  setTimeout(() => el.remove(), 3200);
}

// ── MODAL ──────────────────────────────────────
function showModal(html) {
  $('modal-body').innerHTML = html;
  $('modal-bg').classList.remove('hidden');
  setTimeout(() => $('modal-bg').querySelector('input, select, textarea')?.focus(), 100);
}
function closeModal() { $('modal-bg').classList.add('hidden'); }
function closeModalBg(e) { if (e.target === $('modal-bg')) closeModal(); }

// ══════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════
async function hashPass(p) { return sha256('agendaju::' + p); }

async function loginUser(username, password) {
  const hash = await hashPass(password);
  const { data, error } = await db.from('aju_users').select('*')
    .eq('username', username.toLowerCase().trim())
    .eq('password_hash', hash)
    .single();
  if (error || !data) throw new Error('Usuário ou senha incorretos');
  return data;
}

function saveSession(user) {
  const s = { userId: user.id, username: user.username, exp: Date.now() + 7*86400000 };
  localStorage.setItem('aju_session', JSON.stringify(s));
}
function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem('aju_session') || 'null');
    if (!s || Date.now() > s.exp) { localStorage.removeItem('aju_session'); return null; }
    return s;
  } catch { return null; }
}
function clearSession() { localStorage.removeItem('aju_session'); }

// ══════════════════════════════════════════════
// APP OBJECT (methods chamados no HTML)
// ══════════════════════════════════════════════
const App = {

  // ── init ──
  async init() {
    const session = getSession();
    if (session) {
      State.user = session;
      this.showApp();
    }
    document.getElementById('login-form').addEventListener('submit', e => { e.preventDefault(); App.doLogin(); });
  },

  toggleEye() {
    const inp = $('f-pass');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  },

  async doLogin() {
    const u = $('f-user').value.trim();
    const p = $('f-pass').value;
    const btn = $('login-btn');
    const err = $('login-err');
    err.style.display = 'none';
    btn.textContent = 'Entrando…'; btn.disabled = true;
    try {
      const user = await loginUser(u, p);
      saveSession(user);
      State.user = getSession();
      this.showApp();
    } catch(e) {
      err.textContent = e.message; err.style.display = 'block';
    }
    btn.textContent = 'Entrar'; btn.disabled = false;
  },

  showApp() {
    $('login-screen').style.display = 'none';
    $('app').classList.remove('hidden');
    $('today-label').textContent = capFirst(todayFull());
    $('user-av').textContent = (State.user.username||'J')[0].toUpperCase();
    this.go('dashboard');
    requestNotifPermission();
    rescheduleNotifs();
  },

  logout() {
    clearSession();
    State.user = null;
    $('app').classList.add('hidden');
    $('login-screen').style.display = '';
    $('f-user').value = ''; $('f-pass').value = '';
    toast('Até logo! 🌸','info');
  },

  // ── navigation ──
  go(page) {
    closeSidebar_();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pg = $(`pg-${page}`);
    if (pg) { pg.classList.add('active'); pg.classList.remove('hidden'); }
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
    $('page-title').textContent = PAGE_TITLES[page] || page;
    State.page = page;
    const renders = {
      dashboard: renderDashboard, agenda: renderAgenda, lembretes: renderLembretes,
      notas: renderNotas, mercado: renderMercado, habitos: renderHabitos,
      financas: renderFinancas, cofre: renderCofre, config: renderConfig
    };
    renders[page]?.();
  },

  openSidebar()  { $('sidebar').classList.add('open'); $('nav-overlay').classList.remove('hidden'); },
  closeSidebar() { closeSidebar_(); },
  closeModal()   { closeModal(); },
  closeModalBg   (e) { closeModalBg(e); },
};
function closeSidebar_() { $('sidebar').classList.remove('open'); $('nav-overlay').classList.add('hidden'); }

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════
async function renderDashboard() {
  const uid = State.user.userId;
  const t = today();
  const h = new Date().getHours();
  const greet = h<12 ? 'Bom dia' : h<18 ? 'Boa tarde' : 'Boa noite';
  const name = capFirst(State.user.username);

  const [rRes, evRes, nRes] = await Promise.all([
    db.from('aju_reminders').select('*').eq('user_id',uid).eq('completed',false).order('due_date'),
    db.from('aju_events').select('*').eq('user_id',uid).eq('dismissed',false).gte('start_date',t).order('start_date').limit(3),
    db.from('aju_notes').select('*').eq('user_id',uid).order('updated_at',{ascending:false}).limit(4)
  ]);

  const reminders  = rRes.data || [];
  const todayR     = reminders.filter(r => r.due_date === t).length;
  const nextEvents = evRes.data || [];
  const notes      = nRes.data || [];
  const upcoming   = reminders.slice(0,4);

  $('c-dashboard').innerHTML = `
    <div class="hero-card">
      <h2>${greet}, ${name}! 🌸</h2>
      <p>${capFirst(todayFull())}</p>
      ${todayR ? `<div class="hero-badge">🔔 ${todayR} lembrete${todayR>1?'s':''} para hoje</div>` : ''}
    </div>

    <div class="grid-3" style="margin-bottom:16px">
      <div class="stat-card" onclick="App.go('lembretes')">
        <div class="stat-icon">🔔</div>
        <div class="stat-val">${todayR}</div>
        <div class="stat-label">Lembretes hoje</div>
      </div>
      <div class="stat-card" onclick="App.go('agenda')">
        <div class="stat-icon">📅</div>
        <div class="stat-val">${nextEvents.length}</div>
        <div class="stat-label">Próximos eventos</div>
      </div>
      <div class="stat-card" onclick="App.go('notas')">
        <div class="stat-icon">📝</div>
        <div class="stat-val">${notes.length}</div>
        <div class="stat-label">Notas</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">⏰ Próximos lembretes</div>
        ${upcoming.length === 0
          ? '<div class="empty"><p>Nenhum lembrete pendente 🎉</p></div>'
          : upcoming.map(r => `
            <div class="list-item ${isOverdue(r.due_date)?'overdue':''}">
              <div style="width:8px;height:8px;border-radius:50%;background:${isOverdue(r.due_date)?'#ef4444':r.due_date===t?'var(--pink)':'var(--gray-300)'};margin-top:5px;flex-shrink:0"></div>
              <div class="item-body">
                <div class="item-title truncate">${r.title}</div>
                <div class="item-sub">${isOverdue(r.due_date)?'⚠️ ':''}${fmtDate(r.due_date)}${r.due_time?' às '+r.due_time:''}</div>
              </div>
            </div>`).join('')}
        <div style="margin-top:8px;text-align:right">
          <button class="btn-ghost btn-sm" onclick="App.go('lembretes')">Ver todos →</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📝 Notas recentes</div>
        ${notes.length === 0
          ? '<div class="empty"><p>Nenhuma nota ainda 📋</p></div>'
          : notes.map(n => `
            <div style="background:${n.color||'#fce7f3'};border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer" onclick="App.go('notas')">
              <div style="font-size:12px;font-weight:600;color:var(--gray-800)">${n.title}</div>
              ${n.content?`<div style="font-size:11px;color:var(--gray-500);margin-top:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${n.content}</div>`:''}
            </div>`).join('')}
      </div>
    </div>

    <div class="grid-3" style="margin-top:12px">
      <button class="stat-card" onclick="App.go('mercado')"  style="border:none;text-align:left;cursor:pointer">🛒 <strong style="font-size:13px">Mercado</strong></button>
      <button class="stat-card" onclick="App.go('habitos')"  style="border:none;text-align:left;cursor:pointer">🌱 <strong style="font-size:13px">Hábitos</strong></button>
      <button class="stat-card" onclick="App.go('financas')" style="border:none;text-align:left;cursor:pointer">💰 <strong style="font-size:13px">Finanças</strong></button>
    </div>`;
}

// ══════════════════════════════════════════════
// AGENDA (Calendário + Eventos)
// ══════════════════════════════════════════════
async function renderAgenda() {
  const uid = State.user.userId;
  const { data: events } = await db.from('aju_events').select('*').eq('user_id',uid).order('start_date').order('start_time');
  State.data.events = events || [];
  drawAgenda();
}

function upcomingGrouped(upcoming) {
  const byDate = {};
  for (const occ of upcoming) {
    if (!byDate[occ._occurrence]) byDate[occ._occurrence] = [];
    byDate[occ._occurrence].push(occ);
  }
  const REPEAT_LABEL = { daily:'Diário', weekly:'Semanal', monthly:'Mensal' };
  return Object.entries(byDate).map(([dateStr, occs]) => {
    const d = new Date(dateStr + 'T12:00:00');
    const dayName = capFirst(new Intl.DateTimeFormat('pt-BR',{weekday:'long'}).format(d));
    const dateLabel = new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
    const items = occs.map(occ => `
      <div class="list-item">
        <div style="width:10px;height:10px;border-radius:50%;background:${occ.color||'var(--pink)'};margin-top:5px;flex-shrink:0"></div>
        <div class="item-body">
          <div class="item-title">${occ.title}</div>
          <div class="item-sub">
            ${occ.start_time ? '🕐 '+occ.start_time : ''}
            ${occ.location   ? '📍 '+occ.location   : ''}
            ${occ.repeat     ? '🔁 '+REPEAT_LABEL[occ.repeat] : ''}
          </div>
        </div>
        <button onclick="openEditEvent('${occ.id}')" class="edit-btn" title="Editar">✏️</button>
        <button onclick="dismissEvent('${occ.id}','${occ._occurrence}')" style="background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;border:none;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0">✓ Feito</button>
      </div>`).join('');
    return `<div class="date-group-header"><span class="date-group-day">${dayName}</span><span class="date-group-date">${dateLabel}</span></div>${items}`;
  }).join('');
}

function drawAgenda() {
  const { year, month, selected } = State.cal;
  const events = State.data.events;
  const selStr = selected.toISOString().slice(0,10);
  const dayEvents = getEventsForDay(events, selStr);
  const upcoming  = expandEvents(events, today(), 10);

  $('c-agenda').innerHTML = `
    <div class="grid-2">
      <div class="card">
        ${buildCalendar(year, month, events, selStr)}
      </div>
      <div class="card">
        <div class="card-title">
          📌 ${capFirst(new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long'}).format(selected))}
          <button class="btn-pink btn-sm" style="margin-left:auto" onclick="openNewEvent('${selStr}')">+ Evento</button>
        </div>
        ${dayEvents.length === 0
          ? '<div class="empty"><div class="empty-icon">📅</div><p>Nenhum evento</p></div>'
          : dayEvents.map(ev => `
            <div style="border-left:4px solid ${ev.color||'var(--pink)'};padding:8px 12px;border-radius:0 10px 10px 0;background:var(--gray-50);margin-bottom:8px;position:relative">
              <strong style="font-size:13px">${ev.title}</strong>
              ${ev.repeat?`<span style="font-size:10px;color:var(--purple);margin-left:6px">🔁 ${{daily:'Diário',weekly:'Semanal',monthly:'Mensal'}[ev.repeat]}</span>`:''}
              ${ev.description ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px">${ev.description}</div>` : ''}
              ${ev.start_time ? `<div style="font-size:11px;color:var(--gray-400);margin-top:3px">🕐 ${ev.start_time}${ev.end_time?' – '+ev.end_time:''}</div>` : ''}
              ${ev.location   ? `<div style="font-size:11px;color:var(--gray-400)">📍 ${ev.location}</div>` : ''}
              <button onclick="delEvent('${ev.id}')" style="position:absolute;top:6px;right:6px;background:none;border:none;cursor:pointer;opacity:.4;font-size:13px">🗑</button>
            </div>`).join('')}
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">📆 Próximos eventos</div>
      ${upcoming.length === 0
        ? '<div class="empty"><p>Nenhum evento cadastrado</p></div>'
        : upcomingGrouped(upcoming)}
    </div>`;
}

function buildCalendar(year, month, events, selStr) {
  const eventDays = getEventDaysForMonth(events, year, month);
  const first = new Date(year, month, 1);
  const last  = new Date(year, month+1, 0);
  const startDow = first.getDay();
  const t = today();
  let html = `
    <div class="cal-wrap">
      <div class="cal-header">
        <button class="cal-nav" onclick="prevMonth()">‹</button>
        <span class="cal-title">${PTBR.months[month]} ${year}</span>
        <button class="cal-nav" onclick="nextMonth()">›</button>
      </div>
      <div class="cal-grid">
        ${PTBR.days.map(d=>`<div class="cal-dow">${d}</div>`).join('')}`;

  for (let i = 0; i < startDow; i++) html += '<div class="cal-day other-month"></div>';
  for (let d = 1; d <= last.getDate(); d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = 'cal-day';
    if (ds === t)      cls += ' today';
    if (ds === selStr) cls += ' selected';
    if (eventDays.has(ds)) cls += ' has-event';
    html += `<div class="${cls}" onclick="selectDay('${ds}')">${d}</div>`;
  }
  html += `</div></div>`;
  return html;
}
function prevMonth() {
  State.cal.month--;
  if (State.cal.month < 0) { State.cal.month = 11; State.cal.year--; }
  renderAgenda();
}
function nextMonth() {
  State.cal.month++;
  if (State.cal.month > 11) { State.cal.month = 0; State.cal.year++; }
  renderAgenda();
}
function selectDay(dateStr) {
  State.cal.selected = new Date(dateStr + 'T12:00:00');
  drawAgenda();
}

// ── Retorna a próxima data de ocorrência após dateStr ──
function getNextOccurrence(dateStr, repeat) {
  const d = new Date(dateStr + 'T12:00:00');
  if (repeat === 'daily')   d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly')  d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Retorna Set de dias do mês que têm evento (incluindo recorrentes) ──
function getEventDaysForMonth(events, year, month) {
  const days = new Set();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pad = n => String(n).padStart(2, '0');
  const monthStr = `${year}-${pad(month + 1)}`;

  for (const ev of events) {
    if (ev.dismissed) continue;
    const evDate = new Date(ev.start_date + 'T12:00:00');

    if (!ev.repeat) {
      if (ev.start_date.startsWith(monthStr)) days.add(ev.start_date);
    } else if (ev.repeat === 'daily') {
      const firstDay = new Date(year, month, 1);
      if (evDate <= new Date(year, month, daysInMonth)) {
        for (let d = 1; d <= daysInMonth; d++) {
          const ds = `${monthStr}-${pad(d)}`;
          if (ds >= ev.start_date) days.add(ds);
        }
      }
    } else if (ev.repeat === 'weekly') {
      const dow = evDate.getDay();
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const ds = `${monthStr}-${pad(d)}`;
        if (date.getDay() === dow && ds >= ev.start_date) days.add(ds);
      }
    } else if (ev.repeat === 'monthly') {
      const dom = evDate.getDate();
      if (dom <= daysInMonth) {
        const ds = `${monthStr}-${pad(dom)}`;
        if (ds >= ev.start_date) days.add(ds);
      }
    }
  }
  return days;
}

// ── Retorna eventos que ocorrem em um dia específico (incluindo recorrentes) ──
function getEventsForDay(events, dateStr) {
  return events.filter(ev => {
    if (ev.dismissed) return false;
    if (ev.start_date === dateStr) return true;
    if (!ev.repeat) return false;
    const evDate = new Date(ev.start_date + 'T12:00:00');
    const selDate = new Date(dateStr + 'T12:00:00');
    if (evDate > selDate) return false;
    if (ev.repeat === 'daily')   return true;
    if (ev.repeat === 'weekly')  return evDate.getDay() === selDate.getDay();
    if (ev.repeat === 'monthly') return evDate.getDate() === selDate.getDate();
    return false;
  });
}

// ── Expande eventos recorrentes em ocorrências individuais e retorna as próximas N ──
function expandEvents(events, fromDate, count) {
  const results = [];
  const maxDate = new Date(fromDate + 'T12:00:00');
  maxDate.setFullYear(maxDate.getFullYear() + 2);

  for (const ev of events) {
    if (ev.dismissed) continue;

    if (!ev.repeat) {
      if (ev.start_date >= fromDate) {
        results.push({ ...ev, _occurrence: ev.start_date });
      }
    } else {
      // Gera ocorrências a partir do start_date (que avança a cada dismiss)
      let cur = new Date(ev.start_date + 'T12:00:00');
      let safety = 0;
      while (cur <= maxDate && safety < 52) {
        safety++;
        const curStr = cur.toISOString().slice(0, 10);
        if (curStr >= fromDate) {
          results.push({ ...ev, _occurrence: curStr });
          if (results.filter(r => r.id === ev.id).length >= 6) break; // max 6 por evento
        }
        if (ev.repeat === 'daily')        cur.setDate(cur.getDate() + 1);
        else if (ev.repeat === 'weekly')  cur.setDate(cur.getDate() + 7);
        else if (ev.repeat === 'monthly') cur.setMonth(cur.getMonth() + 1);
        else break;
      }
    }
  }

  results.sort((a, b) =>
    a._occurrence.localeCompare(b._occurrence) ||
    (a.start_time || '').localeCompare(b.start_time || '')
  );
  return results.slice(0, count);
}
function openNewEvent(dateStr) {
  showModal(`
    <h3>📅 Novo evento</h3>
    <form onsubmit="saveEvent(event)">
      <div class="form-row"><label>Título *</label><input name="title" required placeholder="Ex: Consulta médica"></div>
      <div class="form-row"><label>Descrição</label><textarea name="description" rows="2" placeholder="Detalhes..."></textarea></div>
      <div class="form-cols">
        <div class="form-row"><label>Data *</label><input name="start_date" type="date" value="${dateStr}" required></div>
        <div class="form-row"><label>Local</label><input name="location" placeholder="Endereço"></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>Início</label><input name="start_time" type="time"></div>
        <div class="form-row"><label>Fim</label><input name="end_time" type="time"></div>
      </div>
      <div class="form-row">
        <label>Repetir</label>
        <div class="radio-group" id="repeat-opts">
          <button type="button" class="radio-btn sel" data-val="" onclick="selRadio(this,'repeat-opts')">🚫 Não</button>
          <button type="button" class="radio-btn" data-val="daily"   onclick="selRadio(this,'repeat-opts')">☀️ Diário</button>
          <button type="button" class="radio-btn" data-val="weekly"  onclick="selRadio(this,'repeat-opts')">📅 Semanal</button>
          <button type="button" class="radio-btn" data-val="monthly" onclick="selRadio(this,'repeat-opts')">📆 Mensal</button>
        </div>
      </div>
      <div class="form-row" style="display:flex;flex-direction:column;gap:8px">
        <label>Notificações</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:400">
          <input type="checkbox" name="notify_event" checked style="width:auto;accent-color:var(--pink)"> 🔔 Notificar no dispositivo (computador / celular)
        </label>
      </div>
      <div class="form-row">
        <label>Cor</label>
        <div class="color-opts" id="ev-colors">
          ${EVENT_COLORS.map((c,i)=>`<div class="color-opt${i===0?' sel':''}" style="background:${c}" onclick="selColor(this,'ev-colors')" data-color="${c}"></div>`).join('')}
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Criar evento</button>
      </div>
    </form>`);
}
async function saveEvent(e) {
  e.preventDefault();
  const f = e.target;
  const color = document.querySelector('#ev-colors .sel')?.dataset.color || EVENT_COLORS[0];
  const repeat = document.querySelector('#repeat-opts .sel')?.dataset.val || null;
  const notify_event = f.notify_event.checked;
  const { data, error } = await db.from('aju_events').insert({
    user_id: State.user.userId,
    title: f.title.value, description: f.description.value,
    start_date: f.start_date.value, start_time: f.start_time.value||null,
    end_time: f.end_time.value||null, location: f.location.value,
    color, repeat: repeat||null, notify_event, dismissed: false
  }).select().single();
  if (error) { toast('Erro ao criar evento','error'); return; }
  toast('Evento criado! 📅');
  if (notify_event && data?.start_time) scheduleEventNotif(data);
  closeModal();
  renderAgenda();
}
async function dismissEvent(id, occurrenceDate) {
  const ev = State.data.events.find(e => e.id === id);
  if (!ev) return;
  if (ev.repeat) {
    // Recorrente: avança start_date para a próxima ocorrência após a concluída
    const next = getNextOccurrence(occurrenceDate || ev.start_date, ev.repeat);
    await db.from('aju_events').update({ start_date: next }).eq('id', id);
    toast('Ocorrência concluída! 🔁');
  } else {
    await db.from('aju_events').update({ dismissed: true }).eq('id', id);
    toast('Evento concluído! ✅');
  }
  renderAgenda();
}
async function delEvent(id) {
  if (!confirm('Remover evento?')) return;
  await db.from('aju_events').delete().eq('id',id);
  toast('Evento removido');
  renderAgenda();
}
function openEditEvent(id) {
  const ev = State.data.events.find(e => e.id === id);
  if (!ev) return;
  showModal(`
    <h3>✏️ Editar evento</h3>
    <form onsubmit="updateEvent(event,'${id}')">
      <div class="form-row"><label>Título *</label><input name="title" required value="${(ev.title||'').replace(/"/g,'&quot;')}"></div>
      <div class="form-row"><label>Descrição</label><textarea name="description" rows="2">${ev.description||''}</textarea></div>
      <div class="form-cols">
        <div class="form-row"><label>Data *</label><input name="start_date" type="date" value="${ev.start_date}" required></div>
        <div class="form-row"><label>Local</label><input name="location" value="${(ev.location||'').replace(/"/g,'&quot;')}"></div>
      </div>
      <div class="form-cols">
        <div class="form-row"><label>Início</label><input name="start_time" type="time" value="${ev.start_time||''}"></div>
        <div class="form-row"><label>Fim</label><input name="end_time" type="time" value="${ev.end_time||''}"></div>
      </div>
      <div class="form-row">
        <label>Repetir</label>
        <div class="radio-group" id="repeat-opts">
          <button type="button" class="radio-btn${!ev.repeat?' sel':''}" data-val="" onclick="selRadio(this,'repeat-opts')">🚫 Não</button>
          <button type="button" class="radio-btn${ev.repeat==='daily'?' sel':''}" data-val="daily" onclick="selRadio(this,'repeat-opts')">☀️ Diário</button>
          <button type="button" class="radio-btn${ev.repeat==='weekly'?' sel':''}" data-val="weekly" onclick="selRadio(this,'repeat-opts')">📅 Semanal</button>
          <button type="button" class="radio-btn${ev.repeat==='monthly'?' sel':''}" data-val="monthly" onclick="selRadio(this,'repeat-opts')">📆 Mensal</button>
        </div>
      </div>
      <div class="form-row" style="display:flex;flex-direction:column;gap:8px">
        <label>Notificações</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:400">
          <input type="checkbox" name="notify_event" ${ev.notify_event?'checked':''} style="width:auto;accent-color:var(--pink)"> 🔔 Notificar no dispositivo
        </label>
      </div>
      <div class="form-row">
        <label>Cor</label>
        <div class="color-opts" id="ev-colors">
          ${EVENT_COLORS.map(c=>`<div class="color-opt${c===ev.color?' sel':''}" style="background:${c}" onclick="selColor(this,'ev-colors')" data-color="${c}"></div>`).join('')}
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Salvar</button>
      </div>
    </form>`);
}
async function updateEvent(e, id) {
  e.preventDefault();
  const f = e.target;
  const color = document.querySelector('#ev-colors .sel')?.dataset.color || EVENT_COLORS[0];
  const repeat = document.querySelector('#repeat-opts .sel')?.dataset.val || null;
  const notify_event = f.notify_event.checked;
  const { error } = await db.from('aju_events').update({
    title: f.title.value, description: f.description.value,
    start_date: f.start_date.value, start_time: f.start_time.value||null,
    end_time: f.end_time.value||null, location: f.location.value,
    color, repeat: repeat||null, notify_event
  }).eq('id', id);
  if (error) { toast('Erro ao atualizar evento','error'); return; }
  toast('Evento atualizado! ✅');
  closeModal();
  renderAgenda();
}

// ══════════════════════════════════════════════
// LEMBRETES
// ══════════════════════════════════════════════
async function renderLembretes() {
  const uid = State.user.userId;
  const filter = State._rFilter || 'pending';
  const { data } = await db.from('aju_reminders').select('*').eq('user_id',uid).order('due_date').order('due_time');
  State.data.reminders = data || [];
  drawLembretes(filter);
}
function drawLembretes(filter) {
  State._rFilter = filter;
  const t = today();
  let list = State.data.reminders;
  if (filter === 'today')   list = list.filter(r => r.due_date === t);
  if (filter === 'pending') list = list.filter(r => !r.completed);
  $('c-lembretes').innerHTML = `
    <div class="page-actions">
      <div class="filter-tabs">
        <div class="filter-tab${filter==='pending'?' active':''}" onclick="drawLembretes('pending')">Pendentes</div>
        <div class="filter-tab${filter==='today'?' active':''}"   onclick="drawLembretes('today')">Hoje</div>
        <div class="filter-tab${filter==='all'?' active':''}"     onclick="drawLembretes('all')">Todos</div>
      </div>
      <button class="btn-pink btn-sm" onclick="openNewReminder()">+ Novo</button>
    </div>
    ${list.length === 0
      ? `<div class="empty"><div class="empty-icon">🔔</div><p>Nenhum lembrete aqui</p><button class="btn-pink btn-sm" onclick="openNewReminder()">Criar lembrete</button></div>`
      : list.map(r => `
        <div class="list-item ${r.completed?'done':isOverdue(r.due_date)?'overdue':''}">
          <button class="check-btn ${r.completed?'checked':''}" onclick="toggleReminder('${r.id}',${r.completed})">${r.completed?'✓':''}</button>
          <div class="item-body">
            <div class="item-title ${r.completed?'line-thru':''}">${r.title}</div>
            ${r.description?`<div style="font-size:11px;color:var(--gray-500);margin-top:2px">${r.description}</div>`:''}
            <div class="item-sub">
              ${badgePriority(r.priority)}
              <span>${isOverdue(r.due_date)&&!r.completed?'⚠️ ':''}${fmtDate(r.due_date)}</span>
              ${r.due_time?`<span>🕐 ${r.due_time}</span>`:''}
              ${r.notify_browser?`<span>🔔</span>`:''}
            </div>
          </div>
          <button class="del-btn" onclick="delReminder('${r.id}')">🗑</button>
        </div>`).join('')}`;
}
function openNewReminder() {
  showModal(`
    <h3>🔔 Novo lembrete</h3>
    <form onsubmit="saveReminder(event)">
      <div class="form-row"><label>Título *</label><input name="title" required placeholder="Ex: Consulta médica"></div>
      <div class="form-row"><label>Descrição</label><textarea name="description" rows="2" placeholder="Detalhes..."></textarea></div>
      <div class="form-cols">
        <div class="form-row"><label>Data *</label><input name="due_date" type="date" value="${today()}" required></div>
        <div class="form-row"><label>Hora</label><input name="due_time" type="time"></div>
      </div>
      <div class="form-row">
        <label>Prioridade</label>
        <div class="radio-group" id="prio-opts">
          <button type="button" class="radio-btn" data-val="low"    onclick="selRadio(this,'prio-opts')">🟢 Baixa</button>
          <button type="button" class="radio-btn sel" data-val="medium" onclick="selRadio(this,'prio-opts')">🟡 Média</button>
          <button type="button" class="radio-btn" data-val="high"   onclick="selRadio(this,'prio-opts')">🔴 Alta</button>
        </div>
      </div>
      <div class="form-row">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" name="notify" checked style="width:auto;accent-color:var(--pink)"> Notificar no navegador
        </label>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Criar lembrete</button>
      </div>
    </form>`);
}
async function saveReminder(e) {
  e.preventDefault();
  const f = e.target;
  const priority = document.querySelector('#prio-opts .sel')?.dataset.val || 'medium';
  const { data, error } = await db.from('aju_reminders').insert({
    user_id: State.user.userId,
    title: f.title.value, description: f.description.value,
    due_date: f.due_date.value, due_time: f.due_time.value||null,
    priority, notify_browser: f.notify.checked, completed: false
  }).select().single();
  if (error) { toast('Erro ao criar lembrete','error'); return; }
  toast('Lembrete criado! 🔔');
  if (data.notify_browser && data.due_time) scheduleNotif(data);
  closeModal();
  renderLembretes();
}
async function toggleReminder(id, done) {
  await db.from('aju_reminders').update({ completed: !done }).eq('id',id);
  renderLembretes();
}
async function delReminder(id) {
  await db.from('aju_reminders').delete().eq('id',id);
  toast('Removido'); renderLembretes();
}

// ══════════════════════════════════════════════
// NOTAS
// ══════════════════════════════════════════════
async function renderNotas() {
  const { data } = await db.from('aju_notes').select('*').eq('user_id',State.user.userId)
    .order('pinned',{ascending:false}).order('updated_at',{ascending:false});
  State.data.notes = data || [];
  drawNotas();
}
function drawNotas() {
  const q = (State._noteQ||'').toLowerCase();
  const list = State.data.notes.filter(n =>
    n.title.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q));
  $('c-notas').innerHTML = `
    <div class="page-actions">
      <input type="text" placeholder="🔍 Buscar notas…" value="${State._noteQ||''}"
        oninput="State._noteQ=this.value;drawNotas()"
        style="padding:8px 14px;border:1.5px solid var(--pink-m);border-radius:20px;font-size:13px;outline:none;background:#fff;min-width:180px">
      <button class="btn-pink btn-sm" onclick="openNewNote()">+ Nova nota</button>
    </div>
    ${list.length === 0
      ? `<div class="empty"><div class="empty-icon">📝</div><p>${q?'Nada encontrado':'Nenhuma nota ainda'}</p>${!q?`<button class="btn-pink btn-sm" onclick="openNewNote()">Criar nota</button>`:''}</div>`
      : `<div class="notes-grid">${list.map(n=>`
          <div class="note-card" style="background:${n.color||'#fce7f3'}" onclick="openEditNote('${n.id}')">
            ${n.pinned?'<div class="note-pin">📌</div>':''}
            <h4>${n.title}</h4>
            ${n.content?`<p>${n.content}</p>`:''}
            <div class="note-date">${fmt(n.updated_at,{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
            <div class="note-actions">
              <button class="note-act-btn" onclick="event.stopPropagation();togglePin('${n.id}',${n.pinned})">${n.pinned?'📍':'📌'}</button>
              <button class="note-act-btn" onclick="event.stopPropagation();delNote('${n.id}')">🗑</button>
            </div>
          </div>`).join('')}</div>`}`;
}
function openNewNote() {
  showModal(`
    <h3>📝 Nova nota</h3>
    <form onsubmit="saveNote(event)">
      <div class="form-row"><label>Título *</label><input name="title" required placeholder="Título da nota"></div>
      <div class="form-row"><label>Conteúdo</label><textarea name="content" rows="6" placeholder="Escreva aqui…"></textarea></div>
      <div class="form-row">
        <label>Cor</label>
        <div class="color-opts" id="note-colors">
          ${NOTE_COLORS.map((c,i)=>`<div class="color-opt${i===0?' sel':''}" style="background:${c}" onclick="selColor(this,'note-colors')" data-color="${c}"></div>`).join('')}
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Salvar nota</button>
      </div>
    </form>`);
}
function openEditNote(id) {
  const n = State.data.notes.find(x=>x.id===id);
  if (!n) return;
  showModal(`
    <h3>📝 Editar nota</h3>
    <form onsubmit="updateNote(event,'${id}')">
      <div class="form-row"><label>Título *</label><input name="title" value="${n.title.replace(/"/g,'&quot;')}" required></div>
      <div class="form-row"><label>Conteúdo</label><textarea name="content" rows="6">${n.content||''}</textarea></div>
      <div class="form-row">
        <label>Cor</label>
        <div class="color-opts" id="note-colors">
          ${NOTE_COLORS.map(c=>`<div class="color-opt${c===n.color?' sel':''}" style="background:${c}" onclick="selColor(this,'note-colors')" data-color="${c}"></div>`).join('')}
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-danger" onclick="delNote('${id}')">🗑 Excluir</button>
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Salvar</button>
      </div>
    </form>`);
}
async function saveNote(e) {
  e.preventDefault();
  const f = e.target;
  const color = document.querySelector('#note-colors .sel')?.dataset.color || NOTE_COLORS[0];
  await db.from('aju_notes').insert({ user_id:State.user.userId, title:f.title.value, content:f.content.value, color, pinned:false });
  toast('Nota criada! 📝'); closeModal(); renderNotas();
}
async function updateNote(e, id) {
  e.preventDefault();
  const f = e.target;
  const color = document.querySelector('#note-colors .sel')?.dataset.color || NOTE_COLORS[0];
  await db.from('aju_notes').update({ title:f.title.value, content:f.content.value, color, updated_at:new Date().toISOString() }).eq('id',id);
  toast('Nota atualizada!'); closeModal(); renderNotas();
}
async function delNote(id) {
  if(!confirm('Excluir nota?')) return;
  await db.from('aju_notes').delete().eq('id',id);
  toast('Nota removida'); closeModal(); renderNotas();
}
async function togglePin(id, pinned) {
  await db.from('aju_notes').update({ pinned:!pinned }).eq('id',id);
  renderNotas();
}

// ══════════════════════════════════════════════
// LISTA DE MERCADO
// ══════════════════════════════════════════════
const MERCADO_CATS = ['Frutas e Verduras','Carnes','Laticínios','Padaria','Limpeza','Higiene','Bebidas','Congelados','Outros'];
async function renderMercado() {
  const { data } = await db.from('aju_shopping').select('*').eq('user_id',State.user.userId).order('checked').order('created_at');
  State.data.shopping = data || [];
  drawMercado();
}
function drawMercado() {
  const list = State.data.shopping;
  const pending = list.filter(i=>!i.checked).length;
  const checked = list.filter(i=>i.checked).length;
  const groups = {};
  list.filter(i=>!i.checked).forEach(i => {
    if (!groups[i.category]) groups[i.category] = [];
    groups[i.category].push(i);
  });
  const checkedItems = list.filter(i=>i.checked);
  $('c-mercado').innerHTML = `
    <div class="page-actions" style="margin-bottom:12px">
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge badge-gray">${pending} pendentes</span>
        ${checked>0?`<span class="badge" style="background:#dcfce7;color:#16a34a">${checked} no carrinho</span>`:''}
      </div>
      <div style="display:flex;gap:8px">
        ${checked>0?`<button class="btn-outline btn-sm" onclick="clearChecked()">🗑 Limpar marcados</button>`:''}
        <button class="btn-pink btn-sm" onclick="openNewItem()">+ Item</button>
      </div>
    </div>
    ${pending===0&&checked===0
      ? `<div class="empty"><div class="empty-icon">🛒</div><p>Lista vazia</p><button class="btn-pink btn-sm" onclick="openNewItem()">Adicionar item</button></div>`
      : ''}
    ${Object.entries(groups).map(([cat,items])=>`
      <div class="card" style="margin-bottom:10px">
        <div class="card-title" style="margin-bottom:8px">🏷 ${cat}</div>
        ${items.map(i=>`
          <div class="list-item" style="padding:8px 0;border-bottom:1px solid var(--gray-100)">
            <button class="check-btn" onclick="toggleItem('${i.id}',${i.checked})">${i.checked?'✓':''}</button>
            <div class="item-body">
              <div class="item-title">${i.name}</div>
              ${i.quantity?`<div class="item-sub">${i.quantity}</div>`:''}
            </div>
            <button class="del-btn" onclick="delItem('${i.id}')">🗑</button>
          </div>`).join('')}
      </div>`).join('')}
    ${checkedItems.length>0?`
      <div class="card" style="margin-bottom:10px;opacity:.6">
        <div class="card-title" style="margin-bottom:8px">✅ No carrinho</div>
        ${checkedItems.map(i=>`
          <div class="list-item done" style="padding:8px 0;border-bottom:1px solid var(--gray-100)">
            <button class="check-btn checked" onclick="toggleItem('${i.id}',${i.checked})">✓</button>
            <div class="item-body">
              <div class="item-title line-thru">${i.name}</div>
              ${i.quantity?`<div class="item-sub line-thru">${i.quantity}</div>`:''}
            </div>
            <button class="del-btn" onclick="delItem('${i.id}')">🗑</button>
          </div>`).join('')}
      </div>`:''}`;
}
function openNewItem() {
  showModal(`
    <h3>🛒 Adicionar item</h3>
    <form onsubmit="saveItem(event)">
      <div class="form-row"><label>Item *</label><input name="name" required placeholder="Ex: Leite, Arroz, Frango…"></div>
      <div class="form-row"><label>Quantidade</label><input name="quantity" placeholder="Ex: 2 unidades, 1kg…"></div>
      <div class="form-row"><label>Categoria</label>
        <select name="category">${MERCADO_CATS.map(c=>`<option>${c}</option>`).join('')}</select>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Adicionar</button>
      </div>
    </form>`);
}
async function saveItem(e) {
  e.preventDefault();
  const f = e.target;
  await db.from('aju_shopping').insert({ user_id:State.user.userId, name:f.name.value, quantity:f.quantity.value, category:f.category.value, checked:false });
  toast('Item adicionado! 🛒'); closeModal(); renderMercado();
}
async function toggleItem(id, checked) {
  await db.from('aju_shopping').update({ checked:!checked }).eq('id',id);
  renderMercado();
}
async function delItem(id) {
  await db.from('aju_shopping').delete().eq('id',id);
  renderMercado();
}
async function clearChecked() {
  if (!confirm('Remover todos os itens marcados?')) return;
  await db.from('aju_shopping').delete().eq('user_id',State.user.userId).eq('checked',true);
  toast('Lista limpa! 🧹'); renderMercado();
}

// ══════════════════════════════════════════════
// COFRE (senha + notas privadas criptografadas)
// ══════════════════════════════════════════════
// Os dados são criptografados no browser com AES-GCM antes de salvar no Supabase.
// Sem a senha correta, ninguém consegue ler o conteúdo, mesmo com acesso ao banco.
let _cofreKey = null; // CryptoKey derivada da senha, válida durante a sessão

async function deriveCofreKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt: enc.encode('agendaju-cofre-salt'), iterations:100000, hash:'SHA-256' },
    keyMaterial, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
  );
}
async function encryptData(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(plaintext));
  const buf = new Uint8Array([...iv, ...new Uint8Array(ct)]);
  return btoa(String.fromCharCode(...buf));
}
async function decryptData(key, ciphertext) {
  try {
    const buf = Uint8Array.from(atob(ciphertext), c=>c.charCodeAt(0));
    const iv  = buf.slice(0,12);
    const ct  = buf.slice(12);
    const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

async function renderCofre() {
  if (!_cofreKey) {
    $('c-cofre').innerHTML = `
      <div class="card" style="max-width:380px;margin:0 auto;text-align:center;padding:32px 24px">
        <div style="font-size:42px;margin-bottom:12px">🔒</div>
        <h3 style="color:var(--pink-d);margin-bottom:6px">Cofre Seguro</h3>
        <p style="font-size:13px;color:var(--gray-400);margin-bottom:20px">Seus dados são criptografados localmente.<br>Digite sua senha para abrir o cofre.</p>
        <div class="form-row">
          <input type="password" id="cofre-pass" placeholder="Sua senha de acesso" style="text-align:center">
        </div>
        <p id="cofre-err" style="color:var(--red);font-size:12px;display:none;margin-top:6px"></p>
        <button class="btn-pink btn-full" style="margin-top:12px" onclick="abrirCofre()">Abrir cofre 🔓</button>
      </div>`;
    setTimeout(() => $('cofre-pass')?.focus(), 100);
    return;
  }
  const { data } = await db.from('aju_vault').select('*').eq('user_id',State.user.userId).order('type').order('created_at',{ascending:false});
  State.data.vault = data || [];
  await drawCofre();
}

async function drawCofre() {
  const items = State.data.vault;
  const passwords = items.filter(i=>i.type==='password');
  const notes     = items.filter(i=>i.type==='note');
  $('c-cofre').innerHTML = `
    <div class="page-actions" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:18px">🔓</span>
        <span style="font-size:13px;color:var(--gray-400)">Cofre aberto</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-outline btn-sm" onclick="fecharCofre()">🔒 Fechar</button>
        <button class="btn-pink btn-sm" onclick="openNewVaultItem()">+ Adicionar</button>
      </div>
    </div>

    <div style="background:#fef9c3;border-radius:12px;padding:10px 14px;font-size:12px;color:#92400e;margin-bottom:14px">
      🔐 <strong>Seguro:</strong> os dados são criptografados antes de enviar ao servidor. Ninguém além de você consegue ler.
    </div>

    ${passwords.length>0?`
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">🗝 Senhas salvas (${passwords.length})</div>
      ${passwords.map(i=>`
        <div class="list-item" style="cursor:pointer" onclick="viewVaultItem('${i.id}')">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--purple-l);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🗝</div>
          <div class="item-body"><div class="item-title">${i.title}</div><div class="item-sub">Clique para ver</div></div>
          <button class="del-btn" onclick="event.stopPropagation();delVaultItem('${i.id}')">🗑</button>
        </div>`).join('')}
    </div>`:''}

    ${notes.length>0?`
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">📋 Notas privadas (${notes.length})</div>
      ${notes.map(i=>`
        <div class="list-item" style="cursor:pointer" onclick="viewVaultItem('${i.id}')">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--pink-l);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📋</div>
          <div class="item-body"><div class="item-title">${i.title}</div><div class="item-sub">Clique para ver</div></div>
          <button class="del-btn" onclick="event.stopPropagation();delVaultItem('${i.id}')">🗑</button>
        </div>`).join('')}
    </div>`:''}

    ${items.length===0?`<div class="empty"><div class="empty-icon">🔒</div><p>Nenhum item no cofre ainda</p><button class="btn-pink btn-sm" onclick="openNewVaultItem()">Adicionar</button></div>`:''}`;
}

async function abrirCofre() {
  const pass = $('cofre-pass').value;
  if (!pass) return;
  const err = $('cofre-err');
  try {
    const key = await deriveCofreKey(pass);
    // Verificar com a senha de login do usuário
    const hash = await hashPass(pass);
    const { data:user } = await db.from('aju_users').select('password_hash').eq('id',State.user.userId).single();
    if (user?.password_hash !== hash) {
      err.textContent = 'Senha incorreta'; err.style.display = 'block'; return;
    }
    _cofreKey = key;
    renderCofre();
  } catch(e) { err.textContent = 'Erro ao abrir cofre'; err.style.display = 'block'; }
}
function fecharCofre() { _cofreKey = null; renderCofre(); }

function openNewVaultItem() {
  showModal(`
    <h3>🔒 Novo item no cofre</h3>
    <form onsubmit="saveVaultItem(event)">
      <div class="form-row"><label>Tipo</label>
        <div class="radio-group" id="vault-type">
          <button type="button" class="radio-btn sel" data-val="password" onclick="selRadio(this,'vault-type')">🗝 Senha</button>
          <button type="button" class="radio-btn" data-val="note" onclick="selRadio(this,'vault-type')">📋 Nota</button>
        </div>
      </div>
      <div class="form-row"><label>Título *</label><input name="vtitle" required placeholder="Ex: Netflix, Banco, CPF…"></div>
      <div class="form-row"><label>Conteúdo *</label><textarea name="vcontent" rows="4" required placeholder="Usuário/senha, número, texto secreto…"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Salvar com criptografia</button>
      </div>
    </form>`);
}
async function saveVaultItem(e) {
  e.preventDefault();
  if (!_cofreKey) return;
  const f = e.target;
  const type = document.querySelector('#vault-type .sel')?.dataset.val || 'password';
  const enc  = await encryptData(_cofreKey, f.vcontent.value);
  const { error } = await db.from('aju_vault').insert({ user_id:State.user.userId, type, title:f.vtitle.value, data_enc:enc });
  if (error) { toast('Erro ao salvar','error'); return; }
  toast('Salvo com criptografia! 🔐'); closeModal();
  const { data } = await db.from('aju_vault').select('*').eq('user_id',State.user.userId).order('type').order('created_at',{ascending:false});
  State.data.vault = data || [];
  await drawCofre();
}
async function viewVaultItem(id) {
  if (!_cofreKey) return;
  const item = State.data.vault.find(i=>i.id===id);
  if (!item) return;
  const plaintext = await decryptData(_cofreKey, item.data_enc);
  if (plaintext === null) { toast('Erro ao descriptografar','error'); return; }
  showModal(`
    <h3>${item.type==='password'?'🗝':'📋'} ${item.title}</h3>
    <div style="background:var(--gray-50);border-radius:12px;padding:16px;font-family:monospace;font-size:14px;white-space:pre-wrap;word-break:break-all;margin-bottom:16px;max-height:300px;overflow-y:auto">${plaintext}</div>
    <div class="form-actions">
      <button class="btn-outline" onclick="App.closeModal()">Fechar</button>
      <button class="btn-pink" onclick="copyToClipboard(\`${plaintext.replace(/`/g,'\\`')}\`)">📋 Copiar</button>
    </div>`);
}
async function delVaultItem(id) {
  if (!confirm('Excluir este item do cofre?')) return;
  await db.from('aju_vault').delete().eq('id',id);
  toast('Removido do cofre');
  const { data } = await db.from('aju_vault').select('*').eq('user_id',State.user.userId).order('type').order('created_at',{ascending:false});
  State.data.vault = data || [];
  await drawCofre();
}
function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).then(()=>toast('Copiado! 📋')).catch(()=>toast('Não foi possível copiar','error'));
}

// ══════════════════════════════════════════════
// HÁBITOS
// ══════════════════════════════════════════════
const HABIT_ICONS = ['💧','🏃','😴','📚','🧘','🥗','💊','🌿','✍️','🎯','🚴','🧹'];
async function renderHabitos() {
  const uid = State.user.userId;
  const t = today();
  const [hRes, lRes] = await Promise.all([
    db.from('aju_habits').select('*').eq('user_id',uid).order('created_at'),
    db.from('aju_habit_logs').select('habit_id').gte('completed_at',t+'T00:00:00').lte('completed_at',t+'T23:59:59')
  ]);
  State.data.habits    = hRes.data || [];
  State.data.habitLogs = new Set((lRes.data||[]).map(l=>l.habit_id));
  drawHabitos();
}
function drawHabitos() {
  const habits = State.data.habits;
  const done   = State.data.habitLogs;
  const doneN  = habits.filter(h=>done.has(h.id)).length;
  const pct    = habits.length ? Math.round(doneN/habits.length*100) : 0;
  $('c-habitos').innerHTML = `
    <div class="card" style="margin-bottom:14px;background:linear-gradient(135deg,var(--purple),var(--pink));color:#fff">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:12px;opacity:.8">Hoje</div>
          <div style="font-size:26px;font-weight:700;margin-top:4px">${doneN}/${habits.length} concluídos</div>
        </div>
        <div style="font-size:32px">🌱</div>
      </div>
      <div style="background:rgba(255,255,255,.25);border-radius:20px;height:8px;margin-top:14px">
        <div style="background:#fff;height:100%;border-radius:20px;width:${pct}%;transition:width .5s ease"></div>
      </div>
    </div>
    <div style="text-align:right;margin-bottom:12px">
      <button class="btn-pink btn-sm" onclick="openNewHabito()">+ Novo hábito</button>
    </div>
    ${habits.length===0
      ? `<div class="empty"><div class="empty-icon">🌱</div><p>Nenhum hábito cadastrado</p><button class="btn-pink btn-sm" onclick="openNewHabito()">Criar hábito</button></div>`
      : habits.map(h=>{
          const isDone = done.has(h.id);
          return `<div class="habit-card ${isDone?'done':''}">
            <div class="habit-emoji">${h.icon}</div>
            <div class="habit-info">
              <div class="habit-name">${h.name}</div>
              <div class="habit-meta">
                ${h.frequency==='daily'?'Diário':'Semanal'}
                ${h.streak>0?`· <span class="habit-streak">🔥 ${h.streak} dias</span>`:''}
              </div>
            </div>
            <button class="del-btn" style="opacity:.3;font-size:14px;margin-right:6px" onclick="delHabito('${h.id}')">🗑</button>
            <button class="habit-toggle ${isDone?'done':''}" onclick="toggleHabito('${h.id}',${isDone})">${isDone?'✓':''}</button>
          </div>`;}).join('')}`;
}
function openNewHabito() {
  showModal(`
    <h3>🌱 Novo hábito</h3>
    <form onsubmit="saveHabito(event)">
      <div class="form-row"><label>Nome *</label><input name="name" required placeholder="Ex: Beber 2L de água"></div>
      <div class="form-row">
        <label>Ícone</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap" id="hicon-opts">
          ${HABIT_ICONS.map((ic,i)=>`<button type="button" class="note-act-btn ${i===0?'sel':''}" style="width:38px;height:38px;font-size:20px;border:2px solid ${i===0?'var(--pink)':'var(--gray-200)'};border-radius:10px" data-icon="${ic}" onclick="selIcon(this)">${ic}</button>`).join('')}
        </div>
      </div>
      <div class="form-row"><label>Frequência</label>
        <div class="radio-group" id="freq-opts">
          <button type="button" class="radio-btn sel" data-val="daily"  onclick="selRadio(this,'freq-opts')">☀️ Diário</button>
          <button type="button" class="radio-btn"     data-val="weekly" onclick="selRadio(this,'freq-opts')">📅 Semanal</button>
        </div>
      </div>
      <div class="form-row">
        <label>Cor</label>
        <div class="color-opts" id="habit-colors">
          ${NOTE_COLORS.map((c,i)=>`<div class="color-opt${i===0?' sel':''}" style="background:${c}" onclick="selColor(this,'habit-colors')" data-color="${c}"></div>`).join('')}
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Criar hábito</button>
      </div>
    </form>`);
}
async function saveHabito(e) {
  e.preventDefault();
  const f = e.target;
  const icon  = document.querySelector('#hicon-opts .sel')?.dataset.icon  || '💧';
  const freq  = document.querySelector('#freq-opts .sel')?.dataset.val    || 'daily';
  const color = document.querySelector('#habit-colors .sel')?.dataset.color || NOTE_COLORS[0];
  await db.from('aju_habits').insert({ user_id:State.user.userId, name:f.name.value, icon, frequency:freq, color, streak:0 });
  toast('Hábito criado! 🌱'); closeModal(); renderHabitos();
}
async function toggleHabito(id, isDone) {
  const t = today();
  if (isDone) {
    await db.from('aju_habit_logs').delete().eq('habit_id',id).gte('completed_at',t+'T00:00:00');
    const h = State.data.habits.find(x=>x.id===id);
    await db.from('aju_habits').update({ streak:Math.max(0,(h?.streak||1)-1) }).eq('id',id);
  } else {
    await db.from('aju_habit_logs').insert({ habit_id:id, completed_at:new Date().toISOString() });
    const h = State.data.habits.find(x=>x.id===id);
    const ns = (h?.streak||0)+1;
    await db.from('aju_habits').update({ streak:ns, last_completed:t }).eq('id',id);
    if (ns>=7) toast(`🔥 ${ns} dias seguidos! Incrível, Ju!`,'info');
    else toast(`${h?.icon||'🌱'} ${h?.name} concluído!`);
  }
  renderHabitos();
}
async function delHabito(id) {
  if(!confirm('Remover hábito?')) return;
  await db.from('aju_habits').delete().eq('id',id);
  toast('Hábito removido'); renderHabitos();
}

// ══════════════════════════════════════════════
// FINANÇAS
// ══════════════════════════════════════════════
const EXP_CATS = ['Alimentação','Saúde','Beleza','Transporte','Casa','Lazer','Roupas','Farmácia','Outros'];
const INC_CATS = ['Salário','Freelance','Presente','Investimento','Outros'];
async function renderFinancas() {
  const uid = State.user.userId;
  const now  = new Date();
  const mStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const mEnd   = new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().slice(0,10);
  const { data } = await db.from('aju_finances').select('*').eq('user_id',uid)
    .gte('date',mStart).lte('date',mEnd).order('date',{ascending:false});
  State.data.finances = data || [];
  drawFinancas(State.finFilter);
}
function drawFinancas(filter) {
  State.finFilter = filter;
  const list  = State.data.finances;
  const inc   = list.filter(e=>e.type==='income').reduce((s,e)=>s+Number(e.amount),0);
  const exp   = list.filter(e=>e.type==='expense').reduce((s,e)=>s+Number(e.amount),0);
  const bal   = inc - exp;
  const shown = filter==='all'?list:list.filter(e=>e.type===filter);
  const month = capFirst(fmt(new Date(),{month:'long',year:'numeric'}));
  $('c-financas').innerHTML = `
    <div class="finance-summary">
      <div class="fin-card balance"><div class="fin-label">💳 Saldo</div><div class="fin-val">${currency(bal)}</div></div>
      <div class="fin-card income"> <div class="fin-label">⬆ Receitas</div><div class="fin-val">${currency(inc)}</div></div>
      <div class="fin-card expense"><div class="fin-label">⬇ Despesas</div><div class="fin-val">${currency(exp)}</div></div>
    </div>
    <div class="page-actions">
      <div>
        <div style="font-size:12px;color:var(--gray-400);font-weight:500">${month}</div>
        <div class="filter-tabs" style="margin-top:6px">
          <div class="filter-tab${filter==='expense'?' active':''}" onclick="drawFinancas('expense')">Despesas</div>
          <div class="filter-tab${filter==='income'?' active':''}"  onclick="drawFinancas('income')">Receitas</div>
          <div class="filter-tab${filter==='all'?' active':''}"     onclick="drawFinancas('all')">Tudo</div>
        </div>
      </div>
      <button class="btn-pink btn-sm" onclick="openNewFinanca()">+ Adicionar</button>
    </div>
    ${shown.length===0
      ? `<div class="empty"><div class="empty-icon">💰</div><p>Nenhum lançamento</p></div>`
      : shown.map(e=>`
        <div class="list-item">
          <div style="width:36px;height:36px;border-radius:10px;background:${e.type==='income'?'#dcfce7':'#fee2e2'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
            ${e.type==='income'?'⬆':'⬇'}
          </div>
          <div class="item-body">
            <div class="item-title">${e.title}</div>
            <div class="item-sub"><span class="badge badge-gray">${e.category}</span><span>📅 ${fmtDate(e.date)}</span></div>
          </div>
          <div style="font-weight:700;font-size:14px;color:${e.type==='income'?'#16a34a':'var(--red)'};flex-shrink:0">
            ${e.type==='income'?'+':'-'}${currency(e.amount)}
          </div>
          <button class="del-btn" onclick="delFinanca('${e.id}')">🗑</button>
        </div>`).join('')}`;
}
function openNewFinanca() {
  showModal(`
    <h3>💰 Novo lançamento</h3>
    <form onsubmit="saveFinanca(event)">
      <div class="form-row"><label>Tipo</label>
        <div class="radio-group" id="tipo-opts">
          <button type="button" class="radio-btn sel" data-val="expense" onclick="selRadio(this,'tipo-opts');updateFinCats()">⬇ Despesa</button>
          <button type="button" class="radio-btn"     data-val="income"  onclick="selRadio(this,'tipo-opts');updateFinCats()">⬆ Receita</button>
        </div>
      </div>
      <div class="form-row"><label>Descrição *</label><input name="title" required placeholder="Ex: Almoço, Farmácia…"></div>
      <div class="form-cols">
        <div class="form-row"><label>Valor (R$) *</label><input name="amount" type="number" step="0.01" min="0" required placeholder="0,00"></div>
        <div class="form-row"><label>Data *</label><input name="date" type="date" value="${today()}" required></div>
      </div>
      <div class="form-row"><label>Categoria</label><select name="category" id="fin-cat-sel">${EXP_CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Salvar</button>
      </div>
    </form>`);
}
function updateFinCats() {
  const tipo = document.querySelector('#tipo-opts .sel')?.dataset.val || 'expense';
  const cats = tipo==='expense' ? EXP_CATS : INC_CATS;
  $('fin-cat-sel').innerHTML = cats.map(c=>`<option>${c}</option>`).join('');
}
async function saveFinanca(e) {
  e.preventDefault();
  const f    = e.target;
  const type = document.querySelector('#tipo-opts .sel')?.dataset.val || 'expense';
  await db.from('aju_finances').insert({ user_id:State.user.userId, title:f.title.value, amount:parseFloat(f.amount.value), type, category:f.category.value, date:f.date.value });
  toast(type==='income'?'Receita adicionada! 💚':'Despesa registrada! 📊');
  closeModal(); renderFinancas();
}
async function delFinanca(id) {
  await db.from('aju_finances').delete().eq('id',id);
  toast('Removido'); renderFinancas();
}

// ══════════════════════════════════════════════
// CONFIGURAÇÕES
// ══════════════════════════════════════════════
function renderConfig() {
  const notifStatus = typeof Notification !== 'undefined'
    ? { granted:'✅ Ativadas', denied:'❌ Bloqueadas (ajuste no navegador)', default:'⏳ Não configuradas' }[Notification.permission]
    : 'Não disponível neste browser';
  $('c-config').innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="user-av" style="width:52px;height:52px;font-size:22px">${(State.user.username||'J')[0].toUpperCase()}</div>
        <div>
          <div style="font-weight:600;font-size:15px">${capFirst(State.user.username)}</div>
          <div style="font-size:12px;color:var(--gray-400)">Conta pessoal</div>
        </div>
      </div>
    </div>

    <div class="card config-section" style="margin-bottom:12px">
      <div class="card-title">🔐 Segurança</div>
      <div class="config-row" onclick="openChangePass()">
        <div class="config-row-info"><strong>Alterar senha</strong><small>Mude sua senha de acesso</small></div>
        <span class="config-arrow">›</span>
      </div>
    </div>

    <div class="card config-section" style="margin-bottom:12px">
      <div class="card-title">🔔 Notificações</div>
      <div class="config-row" style="cursor:default">
        <div class="config-row-info"><strong>Navegador</strong><small>${notifStatus}</small></div>
        ${Notification.permission!=='granted'&&Notification.permission!=='denied'
          ? `<button class="btn-pink btn-sm" onclick="requestNotifPermission()">Ativar</button>` : ''}
      </div>
      ${Notification.permission==='denied'?`<div style="background:#fef9c3;border-radius:10px;padding:10px 14px;font-size:12px;color:#92400e;margin-top:8px">⚠️ Para ativar, vá nas configurações do navegador e permita notificações para este site.</div>`:''}
      <div style="background:var(--purple-l);border-radius:10px;padding:12px 14px;margin-top:10px">
        <div style="font-size:12px;font-weight:600;color:var(--purple);margin-bottom:4px">📱 Instalar no iPhone</div>
        <div style="font-size:11px;color:#5b21b6">Abra no <strong>Safari</strong> · toque em Compartilhar · selecione <strong>"Adicionar à Tela de Início"</strong></div>
      </div>
    </div>

    <div class="card config-section" style="margin-bottom:12px">
      <div class="card-title">ℹ️ Sobre</div>
      <div style="font-size:12px;color:var(--gray-400);line-height:1.6">
        <strong>Agenda Ju v1.0</strong><br>
        Feito com amor 🌸<br>
        Backend: Supabase · Frontend: HTML + JS + CSS puro
      </div>
    </div>

    <button class="btn-danger btn-full" onclick="App.logout()" style="margin-top:4px">🚪 Sair da conta</button>`;
}
function openChangePass() {
  showModal(`
    <h3>🔐 Alterar senha</h3>
    <form onsubmit="doChangePass(event)">
      <div class="form-row"><label>Senha atual</label><input type="password" name="cur" required placeholder="Senha atual"></div>
      <div class="form-row"><label>Nova senha</label><input type="password" name="nw" required placeholder="Nova senha (mín. 4 caracteres)"></div>
      <div class="form-row"><label>Confirmar nova senha</label><input type="password" name="nw2" required placeholder="Repita a nova senha"></div>
      <p id="pass-err" style="color:var(--red);font-size:12px;display:none"></p>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Salvar</button>
      </div>
    </form>`);
}
async function doChangePass(e) {
  e.preventDefault();
  const f   = e.target;
  const err = $('pass-err');
  if (f.nw.value !== f.nw2.value) { err.textContent='Senhas não coincidem'; err.style.display='block'; return; }
  if (f.nw.value.length < 4)      { err.textContent='Mínimo 4 caracteres';  err.style.display='block'; return; }
  const curHash = await hashPass(f.cur.value);
  const { data:user } = await db.from('aju_users').select('password_hash').eq('id',State.user.userId).single();
  if (user?.password_hash !== curHash) { err.textContent='Senha atual incorreta'; err.style.display='block'; return; }
  const newHash = await hashPass(f.nw.value);
  await db.from('aju_users').update({ password_hash:newHash }).eq('id',State.user.userId);
  toast('Senha alterada com sucesso! 🔐');
  closeModal();
}

// ══════════════════════════════════════════════
// NOTIFICAÇÕES
// ══════════════════════════════════════════════
async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (State.page === 'config') renderConfig();
}
function sendNotif(title, body) {
  if (Notification.permission === 'granted') new Notification(title, { body, icon:'assets/icon.png' });
}
function scheduleNotif(reminder) {
  if (!reminder.due_date || !reminder.due_time) return;
  const dt = new Date(`${reminder.due_date}T${reminder.due_time}`);
  const ms = dt - Date.now();
  if (ms <= 0) return;
  const t = setTimeout(() => sendNotif(`🔔 ${reminder.title}`, reminder.description||'Hora do seu lembrete!'), ms);
  State.notifTimers.push(t);
}
function scheduleEventNotif(ev) {
  if (!ev.start_date || !ev.start_time) return;
  const dt = new Date(`${ev.start_date}T${ev.start_time}`);
  const ms = dt - Date.now();
  if (ms <= 0) return;
  const t = setTimeout(() => sendNotif(`📅 ${ev.title}`, ev.description||ev.location||'Evento começando agora!'), ms);
  State.notifTimers.push(t);
}
async function rescheduleNotifs() {
  if (Notification.permission !== 'granted') return;
  const [remRes, evRes] = await Promise.all([
    db.from('aju_reminders').select('*').eq('user_id',State.user.userId).eq('completed',false).eq('notify_browser',true),
    db.from('aju_events').select('*').eq('user_id',State.user.userId).eq('notify_event',true).eq('dismissed',false).gte('start_date',today())
  ]);
  (remRes.data||[]).forEach(scheduleNotif);
  (evRes.data||[]).forEach(scheduleEventNotif);
}

// ══════════════════════════════════════════════
// HELPERS UI
// ══════════════════════════════════════════════
function selColor(el, groupId) {
  document.querySelectorAll(`#${groupId} .color-opt`).forEach(e=>e.classList.remove('sel'));
  el.classList.add('sel');
}
function selRadio(el, groupId) {
  document.querySelectorAll(`#${groupId} .radio-btn`).forEach(e=>e.classList.remove('sel'));
  el.classList.add('sel');
}
function selIcon(el) {
  document.querySelectorAll('#hicon-opts button').forEach(e=>{
    e.classList.remove('sel'); e.style.borderColor='var(--gray-200)';
  });
  el.classList.add('sel'); el.style.borderColor='var(--pink)';
}

// ══════════════════════════════════════════════
// SERVICE WORKER (PWA)
// ══════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

// ══════════════════════════════════════════════
// START
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => App.init());
