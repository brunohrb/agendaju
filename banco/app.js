/* ═══════════════════════════════════════════
   BancoJu - Banco digital simples
   Persistência em localStorage
═══════════════════════════════════════════ */
(() => {
  'use strict';

  const STORAGE_KEY = 'bancoju_data_v1';
  const SESSION_KEY = 'bancoju_session';

  // ───────── Estado ─────────
  const state = {
    accounts: [],   // { id, number, name, cpf, pass, balance, tx: [] }
    currentId: null,
    hideBalance: false,
  };

  // ───────── Utils ─────────
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const fmtBRL = (n) => n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const fmtDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const onlyDigits = (s) => (s || '').replace(/\D/g, '');

  const maskCPF = (v) => {
    v = onlyDigits(v).slice(0, 11);
    if (v.length > 9) return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
    if (v.length > 6) return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`;
    if (v.length > 3) return `${v.slice(0,3)}.${v.slice(3)}`;
    return v;
  };

  const isValidCPF = (v) => onlyDigits(v).length === 11;

  const genAccountNumber = () => {
    // gera número sequencial tipo 00001-X
    const n = state.accounts.length + 1;
    const base = String(n).padStart(5, '0');
    const digit = (n * 7) % 10;
    return `${base}-${digit}`;
  };

  // ───────── Persistência ─────────
  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        state.accounts = d.accounts || [];
      }
    } catch (e) {
      console.error('Erro ao carregar dados', e);
    }
    state.currentId = localStorage.getItem(SESSION_KEY);
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      accounts: state.accounts,
    }));
  };

  const setSession = (id) => {
    state.currentId = id;
    if (id) localStorage.setItem(SESSION_KEY, id);
    else    localStorage.removeItem(SESSION_KEY);
  };

  const currentAccount = () =>
    state.accounts.find((a) => a.id === state.currentId);

  // ───────── Toast ─────────
  let toastTimer;
  const toast = (msg, type = '') => {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
  };

  // ───────── Auth ─────────
  const doSignup = (e) => {
    e.preventDefault();
    const name = $('#su-name').value.trim();
    const cpf  = $('#su-cpf').value.trim();
    const pass = $('#su-pass').value.trim();
    const errEl = $('#su-err');
    errEl.textContent = '';

    if (!name || name.length < 3) {
      errEl.textContent = 'Informe seu nome completo';
      return;
    }
    if (!isValidCPF(cpf)) {
      errEl.textContent = 'CPF inválido';
      return;
    }
    if (pass.length !== 4 || !/^\d{4}$/.test(pass)) {
      errEl.textContent = 'A senha deve ter 4 dígitos';
      return;
    }
    if (state.accounts.some((a) => onlyDigits(a.cpf) === onlyDigits(cpf))) {
      errEl.textContent = 'Já existe conta com este CPF';
      return;
    }

    const acc = {
      id: `acc_${Date.now()}`,
      number: genAccountNumber(),
      name,
      cpf,
      pass,
      balance: 0,
      tx: [],
    };
    state.accounts.push(acc);
    save();
    setSession(acc.id);
    toast(`Conta ${acc.number} criada! 🎉`, 'ok');
    renderApp();
  };

  const doLogin = (e) => {
    e.preventDefault();
    const num  = $('#login-account').value.trim();
    const pass = $('#login-pass').value.trim();
    const errEl = $('#login-err');
    errEl.textContent = '';

    const acc = state.accounts.find((a) => a.number === num);
    if (!acc) {
      errEl.textContent = 'Conta não encontrada';
      return;
    }
    if (acc.pass !== pass) {
      errEl.textContent = 'Senha incorreta';
      return;
    }
    setSession(acc.id);
    toast(`Bem-vindo(a), ${acc.name.split(' ')[0]}! 👋`, 'ok');
    renderApp();
  };

  const doLogout = () => {
    setSession(null);
    renderAuth();
    toast('Sessão encerrada');
  };

  // ───────── Transações ─────────
  const addTx = (acc, type, amount, desc) => {
    acc.tx.unshift({
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,     // 'in' | 'out'
      amount,
      desc,
      date: new Date().toISOString(),
    });
    // mantém apenas as últimas 100
    if (acc.tx.length > 100) acc.tx.length = 100;
  };

  const deposit = (amount) => {
    const acc = currentAccount();
    if (!acc) return;
    if (amount <= 0) { toast('Valor inválido', 'err'); return; }
    acc.balance += amount;
    addTx(acc, 'in', amount, 'Depósito');
    save();
    renderApp();
    toast(`${fmtBRL(amount)} depositado`, 'ok');
  };

  const withdraw = (amount) => {
    const acc = currentAccount();
    if (!acc) return;
    if (amount <= 0) { toast('Valor inválido', 'err'); return; }
    if (amount > acc.balance) { toast('Saldo insuficiente', 'err'); return; }
    acc.balance -= amount;
    addTx(acc, 'out', amount, 'Saque');
    save();
    renderApp();
    toast(`${fmtBRL(amount)} sacado`, 'ok');
  };

  const transfer = (destNumber, amount) => {
    const acc = currentAccount();
    if (!acc) return;
    if (amount <= 0) { toast('Valor inválido', 'err'); return; }
    if (amount > acc.balance) { toast('Saldo insuficiente', 'err'); return; }
    const dest = state.accounts.find((a) => a.number === destNumber);
    if (!dest) { toast('Conta destino não encontrada', 'err'); return; }
    if (dest.id === acc.id) { toast('Não pode transferir para si mesmo', 'err'); return; }

    acc.balance  -= amount;
    dest.balance += amount;
    addTx(acc,  'out', amount, `Transferência para ${dest.name}`);
    addTx(dest, 'in',  amount, `Transferência de ${acc.name}`);
    save();
    renderApp();
    toast(`${fmtBRL(amount)} transferido para ${dest.name}`, 'ok');
  };

  // ───────── Modais ─────────
  const openModal = (html) => {
    $('#modal-body').innerHTML = html;
    $('#modal-bg').classList.remove('hidden');
  };
  const closeModal = () => $('#modal-bg').classList.add('hidden');

  const parseAmount = (str) => {
    const n = parseFloat(String(str).replace(',', '.'));
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  };

  const modalDeposit = () => {
    openModal(`
      <h3>💰 Depositar</h3>
      <p class="sub">Quanto você deseja depositar?</p>
      <label>Valor (R$)</label>
      <input type="text" id="m-amount" inputmode="decimal" placeholder="0,00" autofocus>
      <button class="btn-primary" id="m-confirm" style="width:100%;margin-top:18px">Confirmar</button>
    `);
    $('#m-confirm').onclick = () => {
      const v = parseAmount($('#m-amount').value);
      if (v <= 0) { toast('Informe um valor válido', 'err'); return; }
      closeModal();
      deposit(v);
    };
  };

  const modalWithdraw = () => {
    openModal(`
      <h3>🏧 Sacar</h3>
      <p class="sub">Quanto você deseja sacar?</p>
      <label>Valor (R$)</label>
      <input type="text" id="m-amount" inputmode="decimal" placeholder="0,00" autofocus>
      <button class="btn-primary" id="m-confirm" style="width:100%;margin-top:18px">Confirmar</button>
    `);
    $('#m-confirm').onclick = () => {
      const v = parseAmount($('#m-amount').value);
      if (v <= 0) { toast('Informe um valor válido', 'err'); return; }
      closeModal();
      withdraw(v);
    };
  };

  const modalTransfer = () => {
    const others = state.accounts.filter((a) => a.id !== state.currentId);
    const options = others.map((a) =>
      `<option value="${a.number}">${a.number} — ${a.name}</option>`
    ).join('');

    openModal(`
      <h3>💸 Transferir</h3>
      <p class="sub">Envie dinheiro para outra conta BancoJu</p>
      <label>Conta destino</label>
      ${others.length
        ? `<select id="m-dest"><option value="">Selecione...</option>${options}</select>`
        : `<input type="text" id="m-dest" placeholder="Ex: 00002-4">`
      }
      <label>Valor (R$)</label>
      <input type="text" id="m-amount" inputmode="decimal" placeholder="0,00">
      <button class="btn-primary" id="m-confirm" style="width:100%;margin-top:18px">Transferir</button>
    `);
    $('#m-confirm').onclick = () => {
      const dest = ($('#m-dest').value || '').trim();
      const v = parseAmount($('#m-amount').value);
      if (!dest) { toast('Escolha a conta destino', 'err'); return; }
      if (v <= 0) { toast('Informe um valor válido', 'err'); return; }
      closeModal();
      transfer(dest, v);
    };
  };

  const modalStatement = () => {
    const acc = currentAccount();
    const txs = acc.tx || [];
    const body = txs.length
      ? `<ul class="tx-list statement">${txs.map(renderTxItem).join('')}</ul>`
      : `<p class="empty">Nenhuma movimentação ainda</p>`;

    openModal(`
      <h3>📄 Extrato completo</h3>
      <p class="sub">Todas as movimentações da sua conta</p>
      ${body}
    `);
  };

  // ───────── Render ─────────
  const renderTxItem = (tx) => {
    const sign = tx.type === 'in' ? '+' : '-';
    const icon = tx.type === 'in' ? '⬇' : '⬆';
    return `
      <li class="tx">
        <div class="tx-icon ${tx.type}">${icon}</div>
        <div class="tx-body">
          <strong>${tx.desc}</strong>
          <small>${fmtDate(tx.date)}</small>
        </div>
        <div class="tx-val ${tx.type}">${sign} ${fmtBRL(tx.amount)}</div>
      </li>
    `;
  };

  const renderApp = () => {
    const acc = currentAccount();
    if (!acc) { renderAuth(); return; }

    $('#auth-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');

    $('#user-name').textContent = acc.name;
    $('#avatar').textContent = (acc.name[0] || 'J').toUpperCase();
    $('#acc-number').textContent = acc.number;
    $('#balance').textContent = state.hideBalance ? 'R$ ••••' : fmtBRL(acc.balance);

    const list = $('#tx-list');
    const empty = $('#empty-hist');
    const recent = (acc.tx || []).slice(0, 5);
    if (recent.length) {
      list.innerHTML = recent.map(renderTxItem).join('');
      empty.classList.add('hidden');
    } else {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    }
  };

  const renderAuth = () => {
    $('#app').classList.add('hidden');
    $('#auth-screen').classList.remove('hidden');
    $('#login-err').textContent = '';
    $('#su-err').textContent = '';
  };

  // ───────── Eventos ─────────
  const bind = () => {
    // Tabs auth
    $$('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        $$('.tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        const tab = t.dataset.tab;
        $('#form-login').classList.toggle('hidden', tab !== 'login');
        $('#form-signup').classList.toggle('hidden', tab !== 'signup');
      });
    });

    $('#form-login').addEventListener('submit', doLogin);
    $('#form-signup').addEventListener('submit', doSignup);

    // Máscara CPF
    $('#su-cpf').addEventListener('input', (e) => {
      e.target.value = maskCPF(e.target.value);
    });
    // Só dígitos na senha
    ['#login-pass', '#su-pass'].forEach((sel) => {
      $(sel).addEventListener('input', (e) => {
        e.target.value = onlyDigits(e.target.value).slice(0, 4);
      });
    });

    // Ações do app
    $('#btn-logout').addEventListener('click', doLogout);
    $('#eye-btn').addEventListener('click', () => {
      state.hideBalance = !state.hideBalance;
      renderApp();
    });

    $$('.act').forEach((b) => {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'deposit')   modalDeposit();
        if (act === 'withdraw')  modalWithdraw();
        if (act === 'transfer')  modalTransfer();
        if (act === 'statement') modalStatement();
      });
    });

    $('#btn-clear-hist').addEventListener('click', () => {
      const acc = currentAccount();
      if (!acc || !acc.tx.length) return;
      if (!confirm('Limpar todo o histórico desta conta?')) return;
      acc.tx = [];
      save();
      renderApp();
      toast('Histórico limpo');
    });

    // Modal
    $('#modal-x').addEventListener('click', closeModal);
    $('#modal-bg').addEventListener('click', (e) => {
      if (e.target.id === 'modal-bg') closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  };

  // ───────── Boot ─────────
  load();
  bind();
  if (currentAccount()) renderApp();
  else renderAuth();
})();
