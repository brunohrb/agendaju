/* ═══════════════════════════════════════════════
   AGENDA JU — app.js
   Vanilla JS · Supabase backend
═══════════════════════════════════════════════ */
'use strict';

// ── SUPABASE INIT ──────────────────────────────
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'agendaju' }
});

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
  notas: 'Notas', tarefas: 'Tarefas', habitos: 'Hábitos',
  financas: 'Finanças', config: 'Configurações'
};

// ── STATE ──────────────────────────────────────
const State = {
  user: null,
  page: 'dashboard',
  cal: { year: new Date().getFullYear(), month: new Date().getMonth(), selected: new Date() },
  data: { reminders:[], notes:[], tasks:[], events:[], habits:[], habitLogs:[], finances:[] },
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
  const { data, error } = await db.from('users').select('*')
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
      notas: renderNotas, tarefas: renderTarefas, habitos: renderHabitos,
      financas: renderFinancas, config: renderConfig
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

  const [rRes, tkRes, nRes] = await Promise.all([
    db.from('reminders').select('*').eq('user_id',uid).eq('completed',false).order('due_date'),
    db.from('tasks').select('id').eq('user_id',uid).eq('completed',false),
    db.from('notes').select('*').eq('user_id',uid).order('updated_at',{ascending:false}).limit(4)
  ]);

  const reminders  = rRes.data || [];
  const todayR     = reminders.filter(r => r.due_date === t).length;
  const pendTasks  = tkRes.data?.length || 0;
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
      <div class="stat-card" onclick="App.go('tarefas')">
        <div class="stat-icon">✅</div>
        <div class="stat-val">${pendTasks}</div>
        <div class="stat-label">Tarefas pendentes</div>
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
      <button class="stat-card" onclick="App.go('agenda')"   style="border:none;text-align:left;cursor:pointer">📅 <strong style="font-size:13px">Agenda</strong></button>
      <button class="stat-card" onclick="App.go('habitos')"  style="border:none;text-align:left;cursor:pointer">🌱 <strong style="font-size:13px">Hábitos</strong></button>
      <button class="stat-card" onclick="App.go('financas')" style="border:none;text-align:left;cursor:pointer">💰 <strong style="font-size:13px">Finanças</strong></button>
    </div>`;
}

// ══════════════════════════════════════════════
// AGENDA (Calendário + Eventos)
// ══════════════════════════════════════════════
async function renderAgenda() {
  const uid = State.user.userId;
  const { data: events } = await db.from('events').select('*').eq('user_id',uid).order('start_date');
  State.data.events = events || [];
  drawAgenda();
}

function drawAgenda() {
  const { year, month, selected } = State.cal;
  const events = State.data.events;
  const selStr = selected.toISOString().slice(0,10);
  const dayEvents = events.filter(e => e.start_date === selStr);

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
            <div style="border-left:4px solid ${ev.color||'var(--pink)'};padding:8px 12px;border-radius:0 10px 10px 0;background:var(--gray-50);margin-bottom:8px;position:relative" class="group">
              <strong style="font-size:13px">${ev.title}</strong>
              ${ev.description ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px">${ev.description}</div>` : ''}
              ${ev.start_time ? `<div style="font-size:11px;color:var(--gray-400);margin-top:3px">🕐 ${ev.start_time}${ev.end_time?' – '+ev.end_time:''}</div>` : ''}
              ${ev.location   ? `<div style="font-size:11px;color:var(--gray-400)">📍 ${ev.location}</div>` : ''}
              <button onclick="delEvent('${ev.id}')" style="position:absolute;top:6px;right:6px;background:none;border:none;cursor:pointer;opacity:.4;font-size:13px">🗑</button>
            </div>`).join('')}
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">📆 Próximos eventos</div>
      ${events.filter(e => e.start_date >= today()).slice(0,6).length === 0
        ? '<div class="empty"><p>Nenhum evento cadastrado</p></div>'
        : events.filter(e=>e.start_date>=today()).slice(0,6).map(ev=>`
          <div class="list-item" onclick="State.cal.selected=new Date(ev.start_date+'T12:00:00');drawAgenda()">
            <div style="width:10px;height:10px;border-radius:50%;background:${ev.color};margin-top:4px;flex-shrink:0"></div>
            <div class="item-body">
              <div class="item-title">${ev.title}</div>
              <div class="item-sub">${fmtDate(ev.start_date)}${ev.start_time?' às '+ev.start_time:''} ${ev.location?'· 📍'+ev.location:''}</div>
            </div>
          </div>`).join('')}
    </div>`;
}

function buildCalendar(year, month, events, selStr) {
  const eventDays = new Set(events.map(e => e.start_date));
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
  const { error } = await db.from('events').insert({
    user_id: State.user.userId,
    title: f.title.value, description: f.description.value,
    start_date: f.start_date.value, start_time: f.start_time.value||null,
    end_time: f.end_time.value||null, location: f.location.value, color
  });
  if (error) { toast('Erro ao criar evento','error'); return; }
  toast('Evento criado! 📅');
  closeModal();
  renderAgenda();
}
async function delEvent(id) {
  if (!confirm('Remover evento?')) return;
  await db.from('events').delete().eq('id',id);
  toast('Evento removido');
  renderAgenda();
}

// ══════════════════════════════════════════════
// LEMBRETES
// ══════════════════════════════════════════════
async function renderLembretes() {
  const uid = State.user.userId;
  const filter = State._rFilter || 'pending';
  const { data } = await db.from('reminders').select('*').eq('user_id',uid).order('due_date').order('due_time');
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
  const { data, error } = await db.from('reminders').insert({
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
  await db.from('reminders').update({ completed: !done }).eq('id',id);
  renderLembretes();
}
async function delReminder(id) {
  await db.from('reminders').delete().eq('id',id);
  toast('Removido'); renderLembretes();
}

// ══════════════════════════════════════════════
// NOTAS
// ══════════════════════════════════════════════
async function renderNotas() {
  const { data } = await db.from('notes').select('*').eq('user_id',State.user.userId)
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
  await db.from('notes').insert({ user_id:State.user.userId, title:f.title.value, content:f.content.value, color, pinned:false });
  toast('Nota criada! 📝'); closeModal(); renderNotas();
}
async function updateNote(e, id) {
  e.preventDefault();
  const f = e.target;
  const color = document.querySelector('#note-colors .sel')?.dataset.color || NOTE_COLORS[0];
  await db.from('notes').update({ title:f.title.value, content:f.content.value, color, updated_at:new Date().toISOString() }).eq('id',id);
  toast('Nota atualizada!'); closeModal(); renderNotas();
}
async function delNote(id) {
  if(!confirm('Excluir nota?')) return;
  await db.from('notes').delete().eq('id',id);
  toast('Nota removida'); closeModal(); renderNotas();
}
async function togglePin(id, pinned) {
  await db.from('notes').update({ pinned:!pinned }).eq('id',id);
  renderNotas();
}

// ══════════════════════════════════════════════
// TAREFAS
// ══════════════════════════════════════════════
const TASK_CATS = ['Pessoal','Trabalho','Saúde','Casa','Estudos','Compras','Outros'];
async function renderTarefas() {
  const { data } = await db.from('tasks').select('*').eq('user_id',State.user.userId).order('created_at',{ascending:false});
  State.data.tasks = data || [];
  drawTarefas(State._tkFilter||'pending', State._tkCat||'all');
}
function drawTarefas(filter, cat) {
  State._tkFilter = filter; State._tkCat = cat;
  let list = State.data.tasks;
  if (filter==='pending') list = list.filter(t=>!t.completed);
  if (filter==='done')    list = list.filter(t=>t.completed);
  if (cat!=='all')        list = list.filter(t=>t.category===cat);
  const pend = State.data.tasks.filter(t=>!t.completed).length;
  const done = State.data.tasks.filter(t=>t.completed).length;
  $('c-tarefas').innerHTML = `
    <div class="grid-3" style="margin-bottom:14px">
      <div class="fin-card" style="background:var(--pink-l)"><div class="fin-label">Total</div><div class="fin-val" style="color:var(--pink-d)">${State.data.tasks.length}</div></div>
      <div class="fin-card" style="background:#fef3c7"><div class="fin-label">Pendentes</div><div class="fin-val" style="color:#d97706">${pend}</div></div>
      <div class="fin-card" style="background:#dcfce7"><div class="fin-label">Concluídas</div><div class="fin-val" style="color:#16a34a">${done}</div></div>
    </div>
    <div class="page-actions">
      <div class="filter-tabs">
        <div class="filter-tab${filter==='pending'?' active':''}" onclick="drawTarefas('pending','${cat}')">Pendentes</div>
        <div class="filter-tab${filter==='all'?' active':''}"     onclick="drawTarefas('all','${cat}')">Todas</div>
        <div class="filter-tab${filter==='done'?' active':''}"    onclick="drawTarefas('done','${cat}')">Feitas</div>
      </div>
      <button class="btn-pink btn-sm" onclick="openNewTarefa()">+ Nova</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      ${['all',...TASK_CATS].map(c=>`<span class="badge ${cat===c?'badge-pink':'badge-gray'}" style="cursor:pointer;padding:4px 10px" onclick="drawTarefas('${filter}','${c}')">${c==='all'?'Todas':c}</span>`).join('')}
    </div>
    ${list.length===0
      ? `<div class="empty"><div class="empty-icon">✅</div><p>Nenhuma tarefa aqui</p></div>`
      : list.map(t=>`
        <div class="list-item ${t.completed?'done':''}">
          <button class="check-btn check-btn-sq ${t.completed?'checked':''}" onclick="toggleTask('${t.id}',${t.completed})">${t.completed?'✓':''}</button>
          <div class="item-body">
            <div class="item-title ${t.completed?'line-thru':''}">${t.title}</div>
            ${t.description?`<div style="font-size:11px;color:var(--gray-500)">${t.description}</div>`:''}
            <div class="item-sub">
              ${badgePriority(t.priority)}
              <span class="badge badge-gray">${t.category}</span>
              ${t.due_date?`<span>📅 ${fmtDate(t.due_date)}</span>`:''}
            </div>
          </div>
          <button class="del-btn" onclick="delTask('${t.id}')">🗑</button>
        </div>`).join('')}`;
}
function openNewTarefa() {
  showModal(`
    <h3>✅ Nova tarefa</h3>
    <form onsubmit="saveTask(event)">
      <div class="form-row"><label>Título *</label><input name="title" required placeholder="Ex: Ir à academia"></div>
      <div class="form-row"><label>Descrição</label><textarea name="description" rows="2"></textarea></div>
      <div class="form-cols">
        <div class="form-row"><label>Prazo</label><input name="due_date" type="date"></div>
        <div class="form-row"><label>Categoria</label><select name="category">${TASK_CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
      </div>
      <div class="form-row"><label>Prioridade</label>
        <div class="radio-group" id="task-prio">
          <button type="button" class="radio-btn" data-val="low" onclick="selRadio(this,'task-prio')">🟢 Baixa</button>
          <button type="button" class="radio-btn sel" data-val="medium" onclick="selRadio(this,'task-prio')">🟡 Média</button>
          <button type="button" class="radio-btn" data-val="high" onclick="selRadio(this,'task-prio')">🔴 Alta</button>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn-pink">Criar tarefa</button>
      </div>
    </form>`);
}
async function saveTask(e) {
  e.preventDefault();
  const f = e.target;
  const priority = document.querySelector('#task-prio .sel')?.dataset.val || 'medium';
  await db.from('tasks').insert({ user_id:State.user.userId, title:f.title.value, description:f.description.value, due_date:f.due_date.value||null, category:f.category.value, priority, completed:false });
  toast('Tarefa criada! ✅'); closeModal(); renderTarefas();
}
async function toggleTask(id, done) {
  await db.from('tasks').update({ completed:!done }).eq('id',id);
  renderTarefas();
}
async function delTask(id) {
  await db.from('tasks').delete().eq('id',id);
  toast('Removida'); renderTarefas();
}

// ══════════════════════════════════════════════
// HÁBITOS
// ══════════════════════════════════════════════
const HABIT_ICONS = ['💧','🏃','😴','📚','🧘','🥗','💊','🌿','✍️','🎯','🚴','🧹'];
async function renderHabitos() {
  const uid = State.user.userId;
  const t = today();
  const [hRes, lRes] = await Promise.all([
    db.from('habits').select('*').eq('user_id',uid).order('created_at'),
    db.from('habit_logs').select('habit_id').gte('completed_at',t+'T00:00:00').lte('completed_at',t+'T23:59:59')
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
  await db.from('habits').insert({ user_id:State.user.userId, name:f.name.value, icon, frequency:freq, color, streak:0 });
  toast('Hábito criado! 🌱'); closeModal(); renderHabitos();
}
async function toggleHabito(id, isDone) {
  const t = today();
  if (isDone) {
    await db.from('habit_logs').delete().eq('habit_id',id).gte('completed_at',t+'T00:00:00');
    const h = State.data.habits.find(x=>x.id===id);
    await db.from('habits').update({ streak:Math.max(0,(h?.streak||1)-1) }).eq('id',id);
  } else {
    await db.from('habit_logs').insert({ habit_id:id, completed_at:new Date().toISOString() });
    const h = State.data.habits.find(x=>x.id===id);
    const ns = (h?.streak||0)+1;
    await db.from('habits').update({ streak:ns, last_completed:t }).eq('id',id);
    if (ns>=7) toast(`🔥 ${ns} dias seguidos! Incrível, Ju!`,'info');
    else toast(`${h?.icon||'🌱'} ${h?.name} concluído!`);
  }
  renderHabitos();
}
async function delHabito(id) {
  if(!confirm('Remover hábito?')) return;
  await db.from('habits').delete().eq('id',id);
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
  const { data } = await db.from('finances').select('*').eq('user_id',uid)
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
  await db.from('finances').insert({ user_id:State.user.userId, title:f.title.value, amount:parseFloat(f.amount.value), type, category:f.category.value, date:f.date.value });
  toast(type==='income'?'Receita adicionada! 💚':'Despesa registrada! 📊');
  closeModal(); renderFinancas();
}
async function delFinanca(id) {
  await db.from('finances').delete().eq('id',id);
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
  const { data:user } = await db.from('users').select('password_hash').eq('id',State.user.userId).single();
  if (user?.password_hash !== curHash) { err.textContent='Senha atual incorreta'; err.style.display='block'; return; }
  const newHash = await hashPass(f.nw.value);
  await db.from('users').update({ password_hash:newHash }).eq('id',State.user.userId);
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
async function rescheduleNotifs() {
  if (Notification.permission !== 'granted') return;
  const { data } = await db.from('reminders').select('*')
    .eq('user_id',State.user.userId).eq('completed',false).eq('notify_browser',true);
  (data||[]).forEach(scheduleNotif);
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
