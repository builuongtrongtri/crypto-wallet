const API = 'http://localhost:3000/api';
let activeWallet = null;
let allWallets = [];
let lastTxRef = null; // for tamper/fake-sig demos

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

// ── MODAL ───────────────────────────────────────────────
function openModal(id) {
  document.getElementById('modal-overlay').classList.add('active');
  document.getElementById(id).classList.add('active');
}
function closeAllModals() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.error-msg').forEach(e => e.textContent = '');
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
    if (tabName === 'pending') loadPending();
    if (tabName === 'blockchain') loadBlockchain();
    if (tabName === 'attack') loadAttackData();
  });
});

// ── WALLET CREATION ──────────────────────────────────────
let _selectedWordCount = 12;

function selectWordCount(n, btn) {
  _selectedWordCount = n;
  document.querySelectorAll('.wc-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function createWallet() {
  const pw = document.getElementById('create-password').value;
  if (!pw || pw.length < 4) {
    document.getElementById('create-error').textContent = 'Password must be at least 4 characters';
    return;
  }
  const btn = document.getElementById('create-btn-text');
  btn.textContent = 'Generating...';
  document.getElementById('create-error').textContent = '';

  try {
    const data = await api('/wallet/create', {
      method: 'POST',
      body: JSON.stringify({ password: pw, wordCount: _selectedWordCount })
    });
    closeAllModals();
    await refreshAll();
    selectWallet(data.address);
    // Show mnemonic display modal
    showMnemonicDisplay(data.mnemonic, data.address);
    toast(`Wallet created!`, 'success');
  } catch (e) {
    document.getElementById('create-error').textContent = e.message;
  } finally {
    btn.textContent = 'Generate Wallet';
  }
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
function selectWallet(address) {
  activeWallet = allWallets.find(w => w.address === address);
  if (!activeWallet) return;

  document.getElementById('no-wallet-screen').style.display = 'none';
  document.getElementById('wallet-screen').style.display = 'block';

  document.getElementById('hdr-address').textContent = activeWallet.address;
  document.getElementById('hdr-pubkey').textContent = activeWallet.publicKey
    ? activeWallet.publicKey.slice(0, 40) + '...' : '';

  refreshBalance();
  renderSidebar();
  renderQuickWallets();
  loadHistory();
  loadPending();
}

async function refreshBalance() {
  if (!activeWallet) return;
  try {
    const data = await api(`/wallet/${activeWallet.address}/balance`);
    document.getElementById('hdr-balance').textContent = parseFloat(data.confirmed).toFixed(4);
    if (data.pendingOut > 0) {
      document.getElementById('hdr-pending').textContent = `−${data.pendingOut.toFixed(4)} CVT pending`;
    } else if (data.pendingIn > 0) {
      document.getElementById('hdr-pending').textContent = `+${data.pendingIn.toFixed(4)} CVT incoming`;
    } else {
      document.getElementById('hdr-pending').textContent = '';
    }
    activeWallet.balance = data.confirmed;
    activeWallet.available = data.available;
  } catch (e) {}
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
    if (!data.confirmed.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px">No transactions yet.</div>';
      return;
    }
    el.innerHTML = data.confirmed.map(tx => renderTxItem(tx, activeWallet.address, 'confirmed')).join('');
  } catch (e) { el.innerHTML = '<div style="color:var(--red)">Error loading history</div>'; }
}

async function loadPending() {
  if (!activeWallet) return;
  const el = document.getElementById('pending-list');
  try {
    const data = await api('/transactions/pending');
    const count = data.length;
    document.getElementById('pending-badge').textContent = count;

    if (!count) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px">Mempool is empty. No pending transactions.</div>';
      document.getElementById('mining-countdown').textContent = '';
      return;
    }
    el.innerHTML = data.map(tx => renderTxItem(tx, activeWallet.address, 'pending')).join('');
    document.getElementById('mining-countdown').textContent = `⏱ Auto-confirm in ~10s · ${count} transaction(s) queued`;
  } catch (e) {}
}

async function loadBlockchain() {
  const el = document.getElementById('blockchain-list');
  try {
    const data = await api('/blockchain');
    document.getElementById('chain-validity').textContent = data.valid ? '✓ Chain Valid' : '✗ Chain Invalid';
    document.getElementById('chain-validity').className = 'validity-badge ' + (data.valid ? 'valid' : 'invalid');
    document.getElementById('block-counter').textContent = `Block #${data.length - 1}`;

    el.innerHTML = data.chain.slice().reverse().map(block => `
      <div class="block-item">
        <div class="block-header">
          <div class="block-index ${block.index === 0 ? 'block-genesis' : ''}">
            ${block.index === 0 ? '⬡ Genesis Block' : `Block #${block.index}`}
          </div>
          <span style="font-size:12px;color:var(--text3)">${block.timestamp ? fmtTime(block.timestamp) : 'Genesis'}</span>
        </div>
        <div class="block-hash">Hash: <span>${block.hash}</span></div>
        <div class="block-hash">Prev: <span>${block.previousHash.slice(0, 32)}...</span></div>
        <div class="block-txcount">${block.transactions.length} transaction(s)</div>
        ${block.transactions.length > 0 ? `
          <div class="block-txs">
            ${block.transactions.map(tx => `
              <div class="mini-tx" onclick="showTxDetail(${JSON.stringify(tx).replace(/"/g,'&quot;')})">
                ${fmt(tx.from)} → ${fmt(tx.to)} · ${tx.amount} CVT
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (e) {}
}

function renderTxItem(tx, myAddress, status) {
  const isOut = tx.from === myAddress;
  const dir = isOut ? 'out' : 'in';
  const icon = status === 'pending' ? '⏳' : isOut ? '↑' : '↓';
  const txJson = JSON.stringify(tx).replace(/"/g, '&quot;');

  return `
    <div class="tx-item" onclick="showTxDetail(JSON.parse(this.dataset.tx))" data-tx="${txJson}">
      <div class="tx-icon ${status === 'pending' ? 'pending' : dir}">${icon}</div>
      <div class="tx-info">
        <div class="tx-parties">${fmt(tx.from)} → ${fmt(tx.to)}</div>
        <div class="tx-time">${fmtTime(tx.timestamp)}</div>
        ${tx.note ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${tx.note}</div>` : ''}
      </div>
      <div class="tx-amount">
        <div class="tx-amount-val ${dir}">${fmtAmt(tx.amount, dir)} CVT</div>
        <div class="tx-status ${status}">${status}</div>
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
    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-val ${tx.status === 'confirmed' ? 'ok' : ''}">${(tx.status || '?').toUpperCase()}</div></div>
    <div style="margin-top:8px">
      <button class="btn-primary" style="font-size:13px;padding:8px 16px" onclick="closeAllModals();openModal('export-wallet-modal')">Export Private Key</button>
    </div>
  `;
  openModal('tx-detail-modal');
}

// ── MINING ───────────────────────────────────────────────
async function mineBlock() {
  try {
    const data = await api('/mine', { method: 'POST' });
    if (data.block) {
      toast(`Block #${data.block.index} confirmed! ${data.block.transactions.length} tx(s)`, 'success');
      await refreshAll();
      loadPending();
      loadBlockchain();
    } else {
      toast('No pending transactions to mine', 'info');
    }
  } catch (e) { toast(e.message, 'error'); }
}

// ── ATTACK DEMOS ──────────────────────────────────────────
async function loadAttackData() {
  try {
    const [blockchain, pending] = await Promise.all([
      api('/blockchain'),
      api('/transactions/pending')
    ]);

    // Collect all txs for tamper select
    const allTxs = [];
    blockchain.chain.forEach(b => b.transactions.forEach(tx => allTxs.push(tx)));
    pending.pending.forEach(tx => allTxs.push(tx));

    const tamperSel = document.getElementById('tamper-tx-select');
    const fakeSigSel = document.getElementById('fake-sig-tx');
    const opts = allTxs.map(tx => `<option value="${tx.txId}">${tx.txId.slice(0, 20)}... | ${tx.amount} CVT</option>`).join('');
    tamperSel.innerHTML = '<option value="">Select a tx...</option>' + opts;
    fakeSigSel.innerHTML = '<option value="">Select a tx...</option>' + opts;

    // Populate multisig wallet list
    const wallets = await api('/wallets');
    const msEl = document.getElementById('multisig-wallets');
    msEl.innerHTML = wallets.map((w, i) => `
      <div class="ms-signer-row">
        <input type="checkbox" id="ms-${i}" value="${w.address}">
        <label for="ms-${i}">${fmt(w.address)}</label>
        <input type="password" id="ms-pw-${i}" placeholder="password">
      </div>
    `).join('');

    // Store all txs for lookup
    window._allTxsCache = allTxs;
  } catch (e) {}
}

async function runTamperAttack() {
  const txId = document.getElementById('tamper-tx-select').value;
  const newAmount = parseFloat(document.getElementById('tamper-new-amount').value);
  const el = document.getElementById('tamper-result');

  if (!txId || isNaN(newAmount)) { el.className = 'attack-result info'; el.textContent = 'Select a transaction and enter a fake amount.'; return; }

  const tx = window._allTxsCache?.find(t => t.txId === txId);
  if (!tx) { el.textContent = 'Transaction not found.'; return; }

  try {
    const result = await api('/attack/tamper', {
      method: 'POST',
      body: JSON.stringify({ tx, newAmount })
    });
    el.className = 'attack-result fail';
    el.textContent = `🔨 TAMPER ATTACK\n━━━━━━━━━━━━━━━━━━━━\nOriginal amount: ${result.originalAmount} CVT\nForged amount:   ${result.tamperedAmount} CVT\n\nHash valid:      ${result.hashValid ? '✓' : '✗ FAIL'}\nSignature valid: ${result.sigValid ? '✓' : '✗ FAIL'}\nTamper detected: ${result.detected ? '✓ YES — Attack blocked!' : '✗ Missed'}\n\n→ SHA-256 hash mismatch exposes the forgery.`;
  } catch (e) { el.className = 'attack-result fail'; el.textContent = e.message; }
}

async function runDoubleSpend() {
  const to = document.getElementById('ds-to').value.trim();
  const amount = parseFloat(document.getElementById('ds-amount').value);
  const password = document.getElementById('ds-password').value;
  const el = document.getElementById('ds-result');
  el.className = 'attack-result info';
  el.textContent = 'Sending 2 transactions simultaneously...';

  if (!to || !amount || !password) { el.textContent = 'Fill all fields.'; return; }

  const tx1 = api('/transaction/send', { method: 'POST', body: JSON.stringify({ from: activeWallet.address, to, amount, password, note: 'DS-tx1' }) });
  const tx2 = api('/transaction/send', { method: 'POST', body: JSON.stringify({ from: activeWallet.address, to, amount, password, note: 'DS-tx2' }) });

  const [r1, r2] = await Promise.allSettled([tx1, tx2]);

  const s1 = r1.status === 'fulfilled' ? '✓ Accepted (pending)' : `✗ Rejected: ${r1.reason?.message}`;
  const s2 = r2.status === 'fulfilled' ? '✓ Accepted (pending)' : `✗ Rejected: ${r2.reason?.message}`;

  el.className = 'attack-result ' + (r1.status !== r2.status ? 'success' : 'fail');
  el.textContent = `⚡ DOUBLE SPEND ATTACK\n━━━━━━━━━━━━━━━━━━━━━\nTX 1 (${amount} CVT): ${s1}\nTX 2 (${amount} CVT): ${s2}\n\n→ Balance locking prevents double-spend.\n→ Only one TX is accepted if balance insufficient.`;

  await refreshAll();
  loadPending();
}

async function runFakeSigAttack() {
  const txId = document.getElementById('fake-sig-tx').value;
  const el = document.getElementById('fakesig-result');
  if (!txId) { el.className = 'attack-result info'; el.textContent = 'Select a transaction.'; return; }

  try {
    const tx = window._allTxsCache?.find(t => t.txId === txId);
    const result = await api('/attack/fake-signature', {
      method: 'POST',
      body: JSON.stringify({ tx })
    });
    el.className = 'attack-result fail';
    el.textContent = `🎭 FAKE SIGNATURE ATTACK\n━━━━━━━━━━━━━━━━━━━━━━━\n${result.message}\n\nOriginal PubKey: ${result.originalPublicKey}\nVerification:    ${result.verificationResult ? '✓ PASS' : '✗ FAIL'}\n\n→ ${result.explanation}`;
  } catch (e) { el.className = 'attack-result fail'; el.textContent = e.message; }
}

async function runMultiSig() {
  const to = document.getElementById('ms-to').value.trim();
  const amount = parseFloat(document.getElementById('ms-amount').value);
  const el = document.getElementById('multisig-result');

  const wallets = await api('/wallets');
  const signers = [];

  wallets.forEach((w, i) => {
    const cb = document.getElementById(`ms-${i}`);
    const pw = document.getElementById(`ms-pw-${i}`);
    if (cb && cb.checked && pw) {
      signers.push({ address: w.address, password: pw.value });
    }
  });

  if (signers.length < 2) { el.className = 'attack-result info'; el.textContent = 'Select at least 2 signers.'; return; }

  const txData = { from: 'multisig_vault', to, amount, note: 'MultiSig TX', txId: 'ms_' + Date.now(), timestamp: Date.now() };

  el.className = 'attack-result info';
  el.textContent = 'Collecting signatures...';

  const sigs = [];
  for (const signer of signers.slice(0, 3)) {
    try {
      const result = await api('/multisig/sign', {
        method: 'POST',
        body: JSON.stringify({ txData, signerAddress: signer.address, password: signer.password })
      });
      sigs.push({ signer: signer.address, sig: result.signature });
    } catch (e) {
      sigs.push({ signer: signer.address, error: e.message });
    }
  }

  const valid = sigs.filter(s => !s.error);
  const required = 2;
  const approved = valid.length >= required;

  el.className = 'attack-result ' + (approved ? 'success' : 'fail');
  el.textContent = `🔏 MULTI-SIGNATURE (${required}/3)\n━━━━━━━━━━━━━━━━━━━━━━━━━\n${sigs.map((s, i) =>
    `Signer ${i + 1} [${fmt(s.signer)}]: ${s.error ? '✗ ' + s.error : '✓ Signed'}`
  ).join('\n')}\n\nValid signatures: ${valid.length}/${required} required\nTransaction: ${approved ? '✓ APPROVED' : '✗ REJECTED (insufficient signatures)'}\n\n→ Requires ${required} of ${signers.length} keys to approve.`;
}

// ── REFRESH ──────────────────────────────────────────────
async function refreshAll() {
  try {
    allWallets = await api('/wallets');
    renderSidebar();
    if (activeWallet) {
      activeWallet = allWallets.find(w => w.address === activeWallet.address) || activeWallet;
      renderQuickWallets();
      refreshBalance();
    }
    updatePendingBadge();
  } catch (e) {}
}

async function updatePendingBadge() {
  try {
    const data = await api('/transactions/pending');
    document.getElementById('pending-badge').textContent = data.length;
  } catch (e) {}
}

// ── SSE REAL-TIME ────────────────────────────────────────
function connectSSE() {
  const es = new EventSource('http://localhost:3000/api/events');
  es.addEventListener('block', (e) => {
    const block = JSON.parse(e.data);
    toast(`⛏ Block #${block.index} confirmed! ${block.transactions.length} tx(s)`, 'success');
    refreshAll();

    const activeTab = document.querySelector('.tab.active')?.dataset.tab;
    if (activeTab === 'pending') loadPending();
    if (activeTab === 'blockchain') loadBlockchain();
    if (activeTab === 'history') loadHistory();
    document.getElementById('block-counter').textContent = `Block #${block.index}`;
  });
  es.onerror = () => setTimeout(connectSSE, 5000);
}

// ── INIT ─────────────────────────────────────────────────
async function init() {
  await refreshAll();
  if (allWallets.length > 0) selectWallet(allWallets[0].address);
  connectSSE();
}

init();