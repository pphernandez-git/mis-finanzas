/* ===== Mis Finanzas - lógica de la app ===== */

const STORAGE_KEY = 'finanzasAppState_v1';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultState() {
  return {
    accounts: [
      { id: uid(), name: 'Cuenta Vista', type: 'vista', initialBalance: 0 },
      { id: uid(), name: 'Cuenta Corriente', type: 'corriente', initialBalance: 0 },
      { id: uid(), name: 'Tarjeta de Crédito', type: 'tarjeta', initialBalance: 0 },
      { id: uid(), name: 'Ahorro', type: 'ahorro', initialBalance: 0 }
    ],
    categories: [
      { id: uid(), name: 'Salud' },
      { id: uid(), name: 'Personal' },
      { id: uid(), name: 'Auto' },
      { id: uid(), name: 'Hogar' },
      { id: uid(), name: 'Alimentación' },
      { id: uid(), name: 'Otros' }
    ],
    transactions: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const st = defaultState();
      saveState(st);
      return st;
    }
    return JSON.parse(raw);
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
let currentDate = new Date();
let currentYear = currentDate.getFullYear();
let currentMonth = currentDate.getMonth(); // 0-indexed

/* ---------- helpers ---------- */

function formatCLP(n) {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded).toString();
  const withDots = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + '$' + withDots;
}

function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0);
}

function isInMonth(dateStr, year, month) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getFullYear() === year && d.getMonth() === month;
}

function isBeforeOrInMonth(dateStr, year, month) {
  const d = new Date(dateStr + 'T00:00:00');
  const end = lastDayOfMonth(year, month);
  return d <= end;
}

function accountBalanceAsOf(accountId, year, month) {
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) return 0;
  let balance = Number(acc.initialBalance) || 0;
  for (const t of state.transactions) {
    if (t.accountId !== accountId) continue;
    if (!isBeforeOrInMonth(t.date, year, month)) continue;
    balance += t.type === 'ingreso' ? Number(t.amount) : -Number(t.amount);
  }
  return balance;
}

function totalGastadoMes(year, month) {
  return state.transactions
    .filter(t => t.type === 'gasto' && isInMonth(t.date, year, month))
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

function ahorroTotal(year, month) {
  return state.accounts
    .filter(a => a.type === 'ahorro')
    .reduce((sum, a) => sum + accountBalanceAsOf(a.id, year, month), 0);
}

function categoryBreakdown(year, month) {
  const gastos = state.transactions.filter(t => t.type === 'gasto' && isInMonth(t.date, year, month));
  const total = gastos.reduce((s, t) => s + Number(t.amount), 0);
  const map = {};
  for (const t of gastos) {
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
  currentMonth -= 1;
  if (currentMonth < 0) { currentMonth = 11; currentYear -= 1; }
  renderAll();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  currentMonth += 1;
  if (currentMonth > 11) { currentMonth = 0; currentYear += 1; }
  renderAll();
});

/* ---------- render ---------- */

function renderMonthLabel() {
  document.getElementById('monthLabel').textContent = `${MESES[currentMonth]} ${currentYear}`;
}

function renderResumen() {
  const accountsRow = document.getElementById('accountsRow');
  accountsRow.innerHTML = '';
  state.accounts.forEach(acc => {
    const bal = accountBalanceAsOf(acc.id, currentYear, currentMonth);
    const chip = document.createElement('div');
    chip.className = 'account-chip';
    chip.innerHTML = `<div class="acc-name">${acc.name}</div><div class="acc-balance">${formatCLP(bal)}</div>`;
    accountsRow.appendChild(chip);
  });

  document.getElementById('totalGastadoMes').textContent = formatCLP(totalGastadoMes(currentYear, currentMonth));
  document.getElementById('ahorroTotal').textContent = formatCLP(ahorroTotal(currentYear, currentMonth));

  const { rows } = categoryBreakdown(currentYear, currentMonth);
  const container = document.getElementById('categoryBreakdown');
  container.innerHTML = '';
  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-state">Sin gastos este mes</div>';
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
  const list = document.getElementById('movList');
  list.innerHTML = '';
  const monthTx = state.transactions
    .filter(t => isInMonth(t.date, currentYear, currentMonth))
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
      <div class="mov-amount ${t.type}">${t.type === 'gasto' ? '-' : '+'}${formatCLP(t.amount)}</div>
    `;
    item.addEventListener('click', () => openMovModal(t));
    list.appendChild(item);
  });
}

function renderCuentas() {
  const list = document.getElementById('accountsList');
  list.innerHTML = '';
  state.accounts.forEach(acc => {
    const bal = accountBalanceAsOf(acc.id, currentYear, currentMonth);
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
  renderCuentas();
  renderCategorias();
  populateSelects();
}

function populateSelects() {
  const accSel = document.getElementById('movAccount');
  const catSel = document.getElementById('movCategory');
  accSel.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  catSel.innerHTML = '<option value="">Sin categoría</option>' +
    state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
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
let movType = 'gasto';

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
    movType = 'gasto';
    document.getElementById('movId').value = '';
    document.getElementById('movDate').value = new Date().toISOString().slice(0, 10);
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
    document.getElementById('accInitial').value = acc.initialBalance;
  } else {
    document.getElementById('accId').value = '';
    document.getElementById('accName').value = '';
    document.getElementById('accType').value = 'vista';
    document.getElementById('accInitial').value = '';
  }
  openModal('accountModal');
}

accountForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('accId').value;
  const acc = {
    id: id || uid(),
    name: document.getElementById('accName').value.trim(),
    type: document.getElementById('accType').value,
    initialBalance: Number(document.getElementById('accInitial').value)
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
