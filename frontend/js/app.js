const API = 'http://localhost:3000/api';
let activeWallet = null;
let allWallets = [];
let lastTxRef = null;

// ── UTILS ───────────────────────────────────────────────
function fmt(addr) { return addr ? addr.slice(0, 10) + '...' + addr.slice(-6) : '—'; }
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });
}
function fmtAmt(n, dir) {
  const sign = dir === 'out' ? '-' : '+';
  return `${sign}${parseFloat(n).toFixed(4)}`;
}

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'API error');
  return data;
}

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 3000);
}

function showUnlockScreen() {
  document.getElementById('unlock-screen').style.display = 'flex';
}
function showCreateWalletScreen() {
  document.getElementById('create-wallet-screen').style.display = 'flex';
}

// ── MODAL ───────────────────────────────────────────────
function openModal(id) {
  document.getElementById('modal-overlay').classList.add('active');
  document.getElementById(id).classList.add('active');
}
function closeAllModals() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.error-msg').forEach(e => e.textContent = '');

  document.getElementById('create-password').value = '';
  document.getElementById('confirm-password').value = '';

  document.getElementById('mnemonic-grid').innerHTML = '';
  document.getElementById('mnemonic-meta').textContent = '';
}

// ── TABS ────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

    const tabName = tab.dataset.tab;
    if (tabName === 'history') loadHistory();
    if (tabName === 'tokens') loadTokens();
  });
});

// ── WALLET CREATION ──────────────────────────────────────
let _selectedWordCount = 12;

async function createWallet() {
  const pw = document.getElementById('create-password').value;
  const cpw = document.getElementById('confirm-password').value;
  if (!pw || pw.length < 4) {
    document.getElementById('create-error').textContent = 'Password must be at least 4 characters';
    return;
  }
  if (pw !== cpw) {
    document.getElementById('create-error').textContent = 'Passwords do not match';
    return;
  }
  const btn = document.getElementById('create-btn-text');
  btn.textContent = 'Creating...';
  btn.disabled = true;
  document.getElementById('create-error').textContent = '';

  try {
    const data = await api('/wallet/create', {
      method: 'POST',
      body: JSON.stringify({ password: pw })
    });
    closeAllModals();
    // await refreshAll();
    // selectWallet(data.address);

    // Show mnemonic display modal
    showMnemonicDisplay(data.mnemonic, data.address);
    await saveWallet({
      address: data.address,
      encryptedMnemonic: data.vault.encryptedMnemonic,
      iv: data.vault.iv,
      salt: data.vault.salt,
      authTag: data.vault.authTag
    });
    activeWallet = { address: data.address };
    showWallet(data.address);
    toast(`Wallet created!`, 'success');
  } catch (e) {
    document.getElementById('create-error').textContent = e.message;
  } finally {
    btn.textContent = 'Generate Wallet';
  }
}

async function unlockWallet() {
  const pw = document.getElementById('password').value;
  if (!pw) {
    toast('Password required', 'error');
    return;
  }
  try {
    const walletData = await getWallet();
    if (!walletData) {
      toast('No wallet found', 'error');
      return;
    }

    const data = await api('/wallet/unlock', { 
      method: 'POST', 
      body: JSON.stringify({ 
        password: pw,
        vault: walletData
      }) 
    });
    activeWallet = ethers.Wallet.fromPhrase(data.mnemonic);
    showWallet(activeWallet);
    toast('Wallet unlocked!', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

function showWallet(wallet) {
  document.getElementById('no-wallet-screen').style.display = 'none';
  document.getElementById('wallet-screen').style.display = 'block';

  document.getElementById('hdr-address').textContent = wallet.address;
  document.getElementById('hdr-pubkey').textContent = wallet.publicKey
    ? wallet.publicKey.slice(0, 40) + '...' : '';

  refreshBalance();
  loadTokens();
  // renderSidebar();
  // renderQuickWallets();
  // loadHistory();
  // loadPending();
}

function showMnemonicDisplay(mnemonic, address) {
  const words = mnemonic.trim().split(/\s+/);
  const grid = document.getElementById('mnemonic-grid');
  grid.innerHTML = words.map((w, i) => `
    <div class="mnemonic-word">
      <span class="word-num">${i + 1}.</span>
      <span class="word-text">${w}</span>
    </div>
  `).join('');

  document.getElementById('mnemonic-meta').innerHTML =
    `BIP-39 · ${words.length} words · Derivation: m/44'/60'/0'/0/0<br>
    Address: ${address}`;

  // Store for "Continue" button
  document.getElementById('mnemonic-display-modal')._targetAddress = address;
  openModal('mnemonic-display-modal');
}

function confirmMnemonicSaved() {
  const cb = document.getElementById('mnemonic-saved-cb');
  if (!cb.checked) { toast('Please confirm you saved your phrase', 'error'); return; }
  closeAllModals();
}

// ── IMPORT WALLET ─────────────────────────────────────────
function switchImportTab(tab, btn) {
  document.querySelectorAll('.import-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('import-tab-mnemonic').style.display = tab === 'mnemonic' ? 'block' : 'none';
  document.getElementById('import-tab-privkey').style.display = tab === 'privkey' ? 'block' : 'none';
}

function buildMnemonicInputGrid(count = 12) {
  const el = document.getElementById('mnemonic-input-grid');
  el.innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="mnemonic-input-cell">
      <span class="word-num">${i + 1}.</span>
      <input type="text" id="mw-${i}" placeholder="word" autocomplete="off" spellcheck="false"
             oninput="onMnemonicWordInput(${i})">
    </div>
  `).join('');
}

function onMnemonicWordInput(index) {
  // Auto-handle paste: if word contains spaces, distribute across cells
  const val = document.getElementById(`mw-${index}`).value.trim();
  const words = val.split(/\s+/);
  if (words.length > 1) {
    words.forEach((w, i) => {
      const inp = document.getElementById(`mw-${index + i}`);
      if (inp) inp.value = w;
    });
    document.getElementById(`mw-${index}`).value = words[0];
  }
}

async function importFromMnemonic() {
  const inputs = document.querySelectorAll('[id^="mw-"]');
  const words = Array.from(inputs).map(i => i.value.trim().toLowerCase()).filter(Boolean);
  const mnemonic = words.join(' ');
  const password = document.getElementById('import-mnemonic-password').value;
  const index = parseInt(document.getElementById('import-mnemonic-index').value) || 0;
  const errEl = document.getElementById('import-mnemonic-error');
  errEl.textContent = '';

  if (words.length !== 12 && words.length !== 24) {
    errEl.textContent = `Need 12 or 24 words, got ${words.length}`; return;
  }
  if (!password) { errEl.textContent = 'Password required'; return; }

  try {
    const data = await api('/wallet/import/mnemonic', {
      method: 'POST',
      body: JSON.stringify({ mnemonic, password, index })
    });
    closeAllModals();
    toast(`Wallet imported: ${fmt(data.address)}`, 'success');
    await refreshAll();
    selectWallet(data.address);
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function importWallet() {
  const pk = document.getElementById('import-privkey').value.trim();
  const pw = document.getElementById('import-password').value;
  if (!pk || pk.replace(/^0x/, '').length !== 64) {
    document.getElementById('import-error').textContent = 'Private key must be 64 hex chars';
    return;
  }
  try {
    const data = await api('/wallet/import', { method: 'POST', body: JSON.stringify({ privateKey: pk, password: pw }) });
    closeAllModals();
    toast(`Wallet imported: ${fmt(data.address)}`, 'success');
    await refreshAll();
    selectWallet(data.address);
  } catch (e) {
    document.getElementById('import-error').textContent = e.message;
  }
}

// ── REVEAL MNEMONIC ───────────────────────────────────────
async function revealMnemonic() {
  const pw = document.getElementById('backup-password').value;
  const address = activeWallet?.address;
  const errEl = document.getElementById('backup-error');
  errEl.textContent = '';

  try {
    const data = await api('/wallet/mnemonic', {
      method: 'POST',
      body: JSON.stringify({ address, password: pw })
    });
    const words = data.mnemonic.trim().split(/\s+/);
    const grid = document.getElementById('backup-mnemonic-grid');
    grid.innerHTML = words.map((w, i) => `
      <div class="mnemonic-word">
        <span class="word-num">${i + 1}.</span>
        <span class="word-text">${w}</span>
      </div>
    `).join('');
    document.getElementById('backup-meta').innerHTML =
      `BIP-39 · ${words.length} words · Path: m/44'/60'/0'/0/0`;
    document.getElementById('backup-mnemonic-result').style.display = 'block';
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function doExport() {
  const pw = document.getElementById('export-password').value;
  const address = activeWallet?.address;
  try {
    const data = await api('/wallet/export', { method: 'POST', body: JSON.stringify({ address, password: pw }) });
    const el = document.getElementById('export-result');
    el.style.display = 'block';
    el.textContent = data.privateKey;
    document.getElementById('export-error').textContent = '';
  } catch (e) {
    document.getElementById('export-error').textContent = e.message;
  }
}

function copyAddress() {
  if (!activeWallet) return;
  navigator.clipboard.writeText(activeWallet.address);
  toast('Address copied!', 'info');
}

// ── SELECT WALLET ────────────────────────────────────────
// function selectWallet(address) {
//   activeWallet = allWallets.find(w => w.address === address);
//   if (!activeWallet) return;

//   document.getElementById('no-wallet-screen').style.display = 'none';
//   document.getElementById('wallet-screen').style.display = 'block';

//   document.getElementById('hdr-address').textContent = activeWallet.address;
//   document.getElementById('hdr-pubkey').textContent = activeWallet.publicKey
//     ? activeWallet.publicKey.slice(0, 40) + '...' : '';

//   refreshBalance();
//   renderSidebar();
//   renderQuickWallets();
//   loadHistory();
//   loadPending();
// }

async function refreshBalance() {
  if (!activeWallet) return;
  try {
    const data = await api(`/wallet/${activeWallet.address}/eth-balance`);
    const marketData = await api('/tokens/market');
    const ethPriceUSD = marketData.ethereum.priceUSD;

    document.getElementById('hdr-balance').textContent = '$' + parseFloat(data.balance * ethPriceUSD).toFixed(2);
    // if (data.pendingOut > 0) {
    //   document.getElementById('hdr-pending').textContent = `−${data.pendingOut.toFixed(4)} CVT pending`;
    // } else if (data.pendingIn > 0) {
    //   document.getElementById('hdr-pending').textContent = `+${data.pendingIn.toFixed(4)} CVT incoming`;
    // } else {
    //   document.getElementById('hdr-pending').textContent = '';
    // }
    // activeWallet.balance = data.confirmed;
    // activeWallet.available = data.available;
  } catch (e) {

  }
}

// ── RENDER SIDEBAR ───────────────────────────────────────
function renderSidebar() {
  const el = document.getElementById('wallet-list-sidebar');
  el.innerHTML = allWallets.map(w => `
    <div class="sidebar-wallet-item ${activeWallet?.address === w.address ? 'active' : ''}"
         onclick="selectWallet('${w.address}')">
      <div class="sw-label">Wallet</div>
      <div class="sw-address">${fmt(w.address)}</div>
      <div class="sw-balance">${parseFloat(w.balance || 0).toFixed(4)} CVT</div>
    </div>
  `).join('');
}

function renderQuickWallets() {
  const others = allWallets.filter(w => w.address !== activeWallet?.address);
  const el = document.getElementById('quick-wallet-list');
  if (!others.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text3)">No other wallets. Create one first.</div>'; return; }
  el.innerHTML = others.map(w => `
    <div class="quick-wallet-btn" onclick="document.getElementById('send-to').value='${w.address}'">
      <span class="qw-addr">${fmt(w.address)}</span>
      <span class="qw-bal">${parseFloat(w.balance || 0).toFixed(4)} CVT</span>
    </div>
  `).join('');
}

// ── SEND TRANSACTION ─────────────────────────────────────
async function sendTransaction() {
  const to = document.getElementById('send-to').value.trim();
  const amount = parseFloat(document.getElementById('send-amount').value);
  const password = document.getElementById('send-password').value;
  const note = document.getElementById('send-note').value;
  const errEl = document.getElementById('send-error');
  errEl.textContent = '';

  if (!to) { errEl.textContent = 'Recipient address required'; return; }
  if (!amount || amount <= 0) { errEl.textContent = 'Invalid amount'; return; }
  if (!password) { errEl.textContent = 'Password required'; return; }

  try {
    const data = await api('/transaction/send', {
      method: 'POST',
      body: JSON.stringify({ from: activeWallet.address, to, amount, password, note })
    });
    lastTxRef = data.tx;
    toast(`Transaction broadcast! ID: ${data.txId.slice(0, 20)}...`, 'success');
    document.getElementById('send-to').value = '';
    document.getElementById('send-amount').value = '';
    document.getElementById('send-password').value = '';
    document.getElementById('send-note').value = '';
    await refreshAll();
    loadPending();
    updatePendingBadge();
  } catch (e) {
    errEl.textContent = e.message;
    toast(e.message, 'error');
  }
}

// ── LOAD HISTORY ─────────────────────────────────────────
async function loadHistory() {
  if (!activeWallet) return;
  const el = document.getElementById('history-list');
  try {
    const data = await api(`/transaction/history/${activeWallet.address}`);
    if (!data.transactions || !data.transactions.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px">No transactions yet.</div>';
      return;
    }
    el.innerHTML = data.transactions.map(tx => renderTxItem(tx, activeWallet.address, 'confirmed')).join('');
  } catch (e) { el.innerHTML = '<div style="color:var(--red)">Error loading history</div>'; }
}

// ── LOAD TOKENS ──────────────────────────────────────────
async function loadTokens() {
  if (!activeWallet) return;
  const el = document.getElementById('token-list');
  
  try {
    // Get balance from wallet
    const balanceData = await api(`/wallet/${activeWallet.address}/eth-balance`);
    const balance = parseFloat(balanceData.balance);

    // Get price from API
    const data = await api('/tokens/market');

    // Sample token data - in production, fetch from price API
    const tokens = [
      {
        name: 'Ethereum',
        symbol: 'ETH',
        icon: '⟠',
        price: balance * data.ethereum.priceUSD,
        change24h: data.ethereum.change24h,
        balance: balance,
        badge: 'Earn'
      },
      {
        name: 'Solana',
        symbol: 'SOL',
        icon: '◎',
        price: 0 * data.solana.priceUSD,
        change24h: data.solana.change24h,
        balance: 0,
        badge: ''
      },
      {
        name: 'Bitcoin',
        symbol: 'BTC',
        icon: '₿',
        price: 0 * data.bitcoin.priceUSD,
        change24h: data.bitcoin.change24h,
        balance: 0,
        badge: 'Native SegWit'
      }
    ];

    el.innerHTML = tokens.map(token => renderTokenItem(token)).join('');
  } catch (e) {
    el.innerHTML = '<div style="color:var(--red);padding:20px">Error loading tokens</div>';
  }
}

function renderTokenItem(token) {
  const changeClass = token.change24h >= 0 ? 'positive' : 'negative';
  const changeSign = token.change24h >= 0 ? '↑' : '↓';
  const badgeHtml = token.badge ? ` <span class="token-badge">${token.badge}</span>` : '';
  
  return `
    <div class="token-item">
      <div class="token-icon">${token.icon}</div>
      <div class="token-info">
        <div class="token-name">${token.name}${badgeHtml}</div>
        <div class="token-change ${changeClass}">${changeSign}${Math.abs(token.change24h).toFixed(2)}%</div>
      </div>
      <div class="token-stats">
        <div class="token-price">$${token.price.toFixed(2)}</div>
        <div class="token-balance">${token.balance.toFixed(4)} ${token.symbol}</div>
      </div>
    </div>
  `;
}



function renderTxItem(tx, myAddress, status) {
  const isOut = tx.from === myAddress;
  const dir = isOut ? 'out' : 'in';
  const icon = isOut ? '↑' : '↓';
  const txJson = JSON.stringify(tx).replace(/"/g, '&quot;');

  return `
    <div class="tx-item" onclick="showTxDetail(JSON.parse(this.dataset.tx))" data-tx="${txJson}">
      <div class="tx-icon ${dir}">${icon}</div>
      <div class="tx-info">
        <div class="tx-parties">${fmt(tx.from)} → ${fmt(tx.to)}</div>
        <div class="tx-time">${fmtTime(tx.timestamp)}</div>
        ${tx.note ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${tx.note}</div>` : ''}
      </div>
      <div class="tx-amount">
        <div class="tx-amount-val ${dir}">${fmtAmt(tx.amount, dir)} CVT</div>
        <div class="tx-status confirmed">CONFIRMED</div>
      </div>
    </div>
  `;
}

function showTxDetail(tx) {
  lastTxRef = tx;
  const sigStr = tx.signature ? `r: ${tx.signature.r}\ns: ${tx.signature.s}` : 'N/A';
  document.getElementById('tx-detail-content').innerHTML = `
    <div class="detail-row"><div class="detail-label">TX ID</div><div class="detail-val">${tx.txId}</div></div>
    <div class="detail-row"><div class="detail-label">From</div><div class="detail-val">${tx.from}</div></div>
    <div class="detail-row"><div class="detail-label">To</div><div class="detail-val">${tx.to}</div></div>
    <div class="detail-row"><div class="detail-label">Amount</div><div class="detail-val">${tx.amount} CVT</div></div>
    <div class="detail-row"><div class="detail-label">Note</div><div class="detail-val">${tx.note || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Timestamp</div><div class="detail-val">${fmtTime(tx.timestamp)}</div></div>
    <div class="detail-row"><div class="detail-label">Hash (SHA-256)</div><div class="detail-val">${tx.hash || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">ECDSA Signature</div><div class="detail-val">${sigStr}</div></div>
    <div class="detail-row"><div class="detail-label">Public Key</div><div class="detail-val">${tx.publicKey || '—'}</div></div>
    <div style="margin-top:8px">
      <button class="btn-primary" style="font-size:13px;padding:8px 16px" onclick="closeAllModals();openModal('export-wallet-modal')">Export Private Key</button>
    </div>
  `;
  openModal('tx-detail-modal');
}

// // ── REFRESH ──────────────────────────────────────────────
// async function refreshAll() {
//   try {
//     allWallets = await api('/wallets');
//     renderSidebar();
//     if (activeWallet) {
//       activeWallet = allWallets.find(w => w.address === activeWallet.address) || activeWallet;
//       renderQuickWallets();
//       refreshBalance();
//     }
//   } catch (e) {}
// }

// ── INIT ─────────────────────────────────────────────────
async function init() {
  // await refreshAll();
  // if (allWallets.length > 0) selectWallet(allWallets[0].address);
  try {
    const exists = await hasWallet();

    if (exists) {
      showUnlockScreen();
    } else {
      showCreateWalletScreen();
    }

  } catch (err) {
    console.error(err);
    showCreateWalletScreen();
  }
}

init();