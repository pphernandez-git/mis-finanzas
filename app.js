/* ===== Mis Finanzas - lógica de la app ===== */

const STORAGE_KEY_V1 = 'finanzasAppState_v1';
const STORAGE_KEY = 'finanzasAppState_v2';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultState() {
  return {
    accounts: [
      { id: uid(), name: 'Cuenta Vista', type: 'vista' },
      { id: uid(), name: 'Cuenta Corriente', type: 'corriente' },
      { id: uid(), name: 'Tarjeta de Crédito', type: 'tarjeta' },
      { id: uid(), name: 'Ahorro', type: 'ahorro' }
    ],
    categories: [
      { id: uid(), name: 'Salud' },
      { id: uid(), name: 'Personal' },
      { id: uid(), name: 'Auto' },
      { id: uid(), name: 'Hogar' },
      { id: uid(), name: 'Alimentación' },
      { id: uid(), name: 'Otros' }
    ],
    transactions: [],
    monthlyData: {}
  };
}

function monthKey(accountId, year, month) {
  return accountId + '_' + year + '_' + month;
}

function migrateFromV1(v1) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const state = {
    accounts: v1.accounts.map(a => ({ id: a.id, name: a.name, type: a.type })),
    categories: v1.categories,
    transactions: (v1.transactions || []).map(t => ({
      ...t,
      type: t.type === 'gasto' ? 'pago' : t.type
    })),
    monthlyData: {}
  };
  v1.accounts.forEach(a => {
    if (typeof a.initialBalance === 'number' && a.initialBalance !== 0) {
      state.monthlyData[monthKey(a.id, y, m)] = { saldoInicial: a.initialBalance, pagarHasta: null };
    }
  });
  return state;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);

    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const migrated = migrateFromV1(JSON.parse(rawV1));
      saveState(migrated);
      return migrated;
    }

    const st = defaultState();
    saveState(st);
    return st;
  } catch (e) {
    console.error('Error leyendo estado, se reinicia', e);
    const st = defaultState();
    saveState(st);
    return st;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ---------- ventana de meses: mes actual + 2 anteriores ---------- */

const REAL_TODAY = new Date();
const MONTH_WINDOW = [2, 1, 0].map(offset => {
  const d = new Date(REAL_TODAY.getFullYear(), REAL_TODAY.getMonth() - offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
});
let monthIndex = 2; // apunta a MONTH_WINDOW; 2 = mes actual

function getCurrentYM() {
  return MONTH_WINDOW[monthIndex];
}

/* ---------- helpers ---------- */

function formatCLP(n) {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded).toString();
  const withDots = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + '$' + withDots;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

function isInMonth(dateStr, year, month) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getFullYear() === year && d.getMonth() === month;
}

function getMonthlyEntry(accountId, year, month) {
  return state.monthlyData[monthKey(accountId, year, month)] || { saldoInicial: 0, pagarHasta: null };
}

function setMonthlyEntry(accountId, year, month, patch) {
  const key = monthKey(accountId, year, month);
  const current = state.monthlyData[key] || { saldoInicial: 0, pagarHasta: null };
  state.monthlyData[key] = { ...current, ...patch };
  saveState(state);
}

function accountBalanceForMonth(accountId, year, month) {
  const entry = getMonthlyEntry(accountId, year, month);
  let balance = Number(entry.saldoInicial) || 0;
  for (const t of state.transactions) {
    if (t.accountId !== accountId) continue;
    if (!isInMonth(t.date, year, month)) continue;
    balance += t.type === 'ingreso' ? Number(t.amount) : -Number(t.amount);
  }
  return balance;
}

function totalPagadoMes(year, month) {
  return state.transactions
    .filter(t => t.type === 'pago' && isInMonth(t.date, year, month))
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

function ahorroTotal(year, month) {
  return state.accounts
    .filter(a => a.type === 'ahorro')
    .reduce((sum, a) => sum + accountBalanceForMonth(a.id, year, month), 0);
}

function categoryBreakdown(year, month) {
  const pagos = state.transactions.filter(t => t.type === 'pago' && isInMonth(t.date, year, month));
  const total = pagos.reduce((s, t) => s + Number(t.amount), 0);
  const map = {};
  for (const t of pagos) {
    const catId = t.categoryId || 'sin-categoria';
    map[catId] = (map[catId] || 0) + Number(t.amount);
  }
  const rows = Object.entries(map).map(([catId, amount]) => {
    const cat = state.categories.find(c => c.id === catId);
    return {
      name: cat ? cat.name : 'Sin categoría',
      amount,
      pct: total > 0 ? (amount / total) * 100 : 0
    };
  });
  rows.sort((a, b) => b.amount - a.amount);
  return { rows, total };
}

function dueDateStatus(pagarHasta) {
  if (!pagarHasta) return null;
  const due = new Date(pagarHasta + 'T00:00:00');
  const today = new Date(REAL_TODAY.getFullYear(), REAL_TODAY.getMonth(), REAL_TODAY.getDate());
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return 'danger';
  if (diffDays <= 5) return 'warn';
  return 'ok';
}

/* ---------- navegación de vistas ---------- */

function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + viewName).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewName);
  });
  renderAll();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('prevMonth').addEventListener('click', () => {
  if (monthIndex > 0) {
    monthIndex -= 1;
    renderAll();
  }
});

document.getElementById('nextMonth').addEventListener('click', () => {
  if (monthIndex < MONTH_WINDOW.length - 1) {
    monthIndex += 1;
    renderAll();
  }
});

/* ---------- render ---------- */

function renderMonthLabel() {
  const { year, month } = getCurrentYM();
  const label = `${MESES[month]} ${year}`;
  document.getElementById('monthLabel').textContent = label;
  document.getElementById('saldoMesLabel').textContent = label;
  document.getElementById('prevMonth').disabled = monthIndex === 0;
  document.getElementById('nextMonth').disabled = monthIndex === MONTH_WINDOW.length - 1;
}

function renderResumen() {
  const { year, month } = getCurrentYM();
  const accountsRow = document.getElementById('accountsRow');
  accountsRow.innerHTML = '';
  state.accounts.forEach(acc => {
    const bal = accountBalanceForMonth(acc.id, year, month);
    const chip = document.createElement('div');
    chip.className = 'account-chip';
    let dueHtml = '';
    if (acc.type === 'tarjeta') {
      const entry = getMonthlyEntry(acc.id, year, month);
      if (entry.pagarHasta) {
        const status = dueDateStatus(entry.pagarHasta);
        dueHtml = `<span class="acc-due ${status}">Pagar hasta ${formatDateShort(entry.pagarHasta)}</span>`;
      }
    }
    chip.innerHTML = `
      <div class="acc-info">
        <div class="acc-name">${acc.name}</div>
        ${dueHtml}
      </div>
      <div class="acc-balance">${formatCLP(bal)}</div>
    `;
    accountsRow.appendChild(chip);
  });

  document.getElementById('totalPagadoMes').textContent = formatCLP(totalPagadoMes(year, month));
  document.getElementById('ahorroTotal').textContent = formatCLP(ahorroTotal(year, month));

  const { rows } = categoryBreakdown(year, month);
  const container = document.getElementById('categoryBreakdown');
  container.innerHTML = '';
  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-state">Sin pagos este mes</div>';
  } else {
    rows.forEach(r => {
      const row = document.createElement('div');
      row.className = 'category-row';
      row.innerHTML = `
        <div class="cat-top">
          <span class="cat-name">${r.name}</span>
          <span class="cat-amount">${formatCLP(r.amount)} · ${r.pct.toFixed(0)}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%"></div></div>
      `;
      container.appendChild(row);
    });
  }
}

function renderMovimientos() {
  const { year, month } = getCurrentYM();
  const list = document.getElementById('movList');
  list.innerHTML = '';
  const monthTx = state.transactions
    .filter(t => isInMonth(t.date, year, month))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (monthTx.length === 0) {
    list.innerHTML = '<div class="empty-state">Sin movimientos este mes</div>';
    return;
  }

  monthTx.forEach(t => {
    const acc = state.accounts.find(a => a.id === t.accountId);
    const cat = state.categories.find(c => c.id === t.categoryId);
    const item = document.createElement('div');
    item.className = 'mov-item';
    item.dataset.id = t.id;
    item.innerHTML = `
      <div class="mov-left">
        <span class="mov-cat">${cat ? cat.name : (t.type === 'ingreso' ? 'Ingreso' : 'Sin categoría')}</span>
        <span class="mov-meta">${t.date} · ${acc ? acc.name : ''}${t.note ? ' · ' + t.note : ''}</span>
      </div>
      <div class="mov-amount ${t.type}">${t.type === 'pago' ? '-' : '+'}${formatCLP(t.amount)}</div>
    `;
    item.addEventListener('click', () => openMovModal(t));
    list.appendChild(item);
  });
}

function renderSaldoInicial() {
  const { year, month } = getCurrentYM();
  const list = document.getElementById('saldoInicialList');
  list.innerHTML = '';
  state.accounts.forEach(acc => {
    const entry = getMonthlyEntry(acc.id, year, month);
    const item = document.createElement('div');
    item.className = 'saldo-item';
    const dueField = acc.type === 'tarjeta'
      ? `<label>Pagar hasta</label><input type="date" data-field="pagarHasta" data-acc="${acc.id}" value="${entry.pagarHasta || ''}">`
      : '';
    item.innerHTML = `
      <div class="saldo-name">${acc.name}</div>
      <label>Saldo inicial (CLP)</label>
      <input type="number" inputmode="decimal" step="1" data-field="saldoInicial" data-acc="${acc.id}" value="${entry.saldoInicial || 0}">
      ${dueField}
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('input[data-field="saldoInicial"]').forEach(input => {
    input.addEventListener('change', () => {
      const { year, month } = getCurrentYM();
      setMonthlyEntry(input.dataset.acc, year, month, { saldoInicial: Number(input.value) || 0 });
      renderAll();
    });
  });
  list.querySelectorAll('input[data-field="pagarHasta"]').forEach(input => {
    input.addEventListener('change', () => {
      const { year, month } = getCurrentYM();
      setMonthlyEntry(input.dataset.acc, year, month, { pagarHasta: input.value || null });
      renderAll();
    });
  });
}

function renderCuentas() {
  const { year, month } = getCurrentYM();
  const list = document.getElementById('accountsList');
  list.innerHTML = '';
  state.accounts.forEach(acc => {
    const bal = accountBalanceForMonth(acc.id, year, month);
    const item = document.createElement('div');
    item.className = 'account-item';
    item.innerHTML = `
      <div class="mov-left">
        <span class="mov-cat">${acc.name}</span>
        <span class="mov-meta">Saldo actual</span>
      </div>
      <div class="mov-amount">${formatCLP(bal)}</div>
    `;
    item.addEventListener('click', () => openAccountModal(acc));
    list.appendChild(item);
  });
}

function renderCategorias() {
  const list = document.getElementById('categoriesList');
  list.innerHTML = '';
  if (state.categories.length === 0) {
    list.innerHTML = '<div class="empty-state">Sin categorías</div>';
    return;
  }
  state.categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `<span class="mov-cat">${cat.name}</span>`;
    item.addEventListener('click', () => openCategoryModal(cat));
    list.appendChild(item);
  });
}

function renderAll() {
  renderMonthLabel();
  renderResumen();
  renderMovimientos();
  renderSaldoInicial();
  renderCuentas();
  renderCategorias();
  populateSelects();
}

function populateSelects() {
  const accSel = document.getElementById('movAccount');
  const catSel = document.getElementById('movCategory');
  const prevAcc = accSel.value;
  const prevCat = catSel.value;
  accSel.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  catSel.innerHTML = '<option value="">Sin categoría</option>' +
    state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (prevAcc) accSel.value = prevAcc;
  if (prevCat) catSel.value = prevCat;
}

/* ---------- modales genéricos ---------- */

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

/* ---------- movimientos ---------- */

const movModal = document.getElementById('movModal');
const movForm = document.getElementById('movForm');
let movType = 'pago';

document.getElementById('movTypeSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  movType = btn.dataset.type;
  document.querySelectorAll('#movTypeSeg .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
});

document.getElementById('addMovBtn').addEventListener('click', () => openMovModal(null));

function openMovModal(tx) {
  document.getElementById('movModalTitle').textContent = tx ? 'Editar movimiento' : 'Nuevo movimiento';
  document.getElementById('deleteMovBtn').classList.toggle('hidden', !tx);
  populateSelects();

  if (tx) {
    movType = tx.type;
    document.getElementById('movId').value = tx.id;
    document.getElementById('movDate').value = tx.date;
    document.getElementById('movAccount').value = tx.accountId;
    document.getElementById('movCategory').value = tx.categoryId || '';
    document.getElementById('movAmount').value = tx.amount;
    document.getElementById('movNote').value = tx.note || '';
  } else {
    movType = 'pago';
    document.getElementById('movId').value = '';
    const { year, month } = getCurrentYM();
    const todayReal = new Date();
    const defaultDate = (todayReal.getFullYear() === year && todayReal.getMonth() === month)
      ? todayReal.toISOString().slice(0, 10)
      : new Date(year, month, 1).toISOString().slice(0, 10);
    document.getElementById('movDate').value = defaultDate;
    document.getElementById('movAmount').value = '';
    document.getElementById('movNote').value = '';
  }
  document.querySelectorAll('#movTypeSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.type === movType));
  openModal('movModal');
}

movForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('movId').value;
  const tx = {
    id: id || uid(),
    type: movType,
    date: document.getElementById('movDate').value,
    accountId: document.getElementById('movAccount').value,
    categoryId: document.getElementById('movCategory').value || null,
    amount: Number(document.getElementById('movAmount').value),
    note: document.getElementById('movNote').value.trim()
  };
  if (id) {
    const idx = state.transactions.findIndex(t => t.id === id);
    state.transactions[idx] = tx;
  } else {
    state.transactions.push(tx);
  }
  saveState(state);
  closeModal('movModal');
  renderAll();
});

document.getElementById('deleteMovBtn').addEventListener('click', () => {
  const id = document.getElementById('movId').value;
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState(state);
  closeModal('movModal');
  renderAll();
});

/* ---------- cuentas ---------- */

const accountForm = document.getElementById('accountForm');

document.getElementById('addAccountBtn').addEventListener('click', () => openAccountModal(null));

function openAccountModal(acc) {
  document.getElementById('accountModalTitle').textContent = acc ? 'Editar cuenta' : 'Nueva cuenta';
  document.getElementById('deleteAccountBtn').classList.toggle('hidden', !acc);
  if (acc) {
    document.getElementById('accId').value = acc.id;
    document.getElementById('accName').value = acc.name;
    document.getElementById('accType').value = acc.type;
  } else {
    document.getElementById('accId').value = '';
    document.getElementById('accName').value = '';
    document.getElementById('accType').value = 'vista';
  }
  openModal('accountModal');
}

accountForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('accId').value;
  const acc = {
    id: id || uid(),
    name: document.getElementById('accName').value.trim(),
    type: document.getElementById('accType').value
  };
  if (id) {
    const idx = state.accounts.findIndex(a => a.id === id);
    state.accounts[idx] = acc;
  } else {
    state.accounts.push(acc);
  }
  saveState(state);
  closeModal('accountModal');
  renderAll();
});

document.getElementById('deleteAccountBtn').addEventListener('click', () => {
  const id = document.getElementById('accId').value;
  const hasTx = state.transactions.some(t => t.accountId === id);
  if (hasTx && !confirm('Esta cuenta tiene movimientos asociados. ¿Eliminar de todas formas? Los movimientos quedarán sin cuenta.')) {
    return;
  }
  state.accounts = state.accounts.filter(a => a.id !== id);
  Object.keys(state.monthlyData).forEach(key => {
    if (key.startsWith(id + '_')) delete state.monthlyData[key];
  });
  saveState(state);
  closeModal('accountModal');
  renderAll();
});

/* ---------- categorías ---------- */

const categoryForm = document.getElementById('categoryForm');

document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal(null));

function openCategoryModal(cat) {
  document.getElementById('categoryModalTitle').textContent = cat ? 'Editar categoría' : 'Nueva categoría';
  document.getElementById('deleteCategoryBtn').classList.toggle('hidden', !cat);
  document.getElementById('catId').value = cat ? cat.id : '';
  document.getElementById('catName').value = cat ? cat.name : '';
  openModal('categoryModal');
}

categoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('catId').value;
  const cat = { id: id || uid(), name: document.getElementById('catName').value.trim() };
  if (id) {
    const idx = state.categories.findIndex(c => c.id === id);
    state.categories[idx] = cat;
  } else {
    state.categories.push(cat);
  }
  saveState(state);
  closeModal('categoryModal');
  renderAll();
});

document.getElementById('deleteCategoryBtn').addEventListener('click', () => {
  const id = document.getElementById('catId').value;
  state.categories = state.categories.filter(c => c.id !== id);
  state.transactions.forEach(t => { if (t.categoryId === id) t.categoryId = null; });
  saveState(state);
  closeModal('categoryModal');
  renderAll();
});

/* ---------- init ---------- */

renderAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW error', err));
  });
}
