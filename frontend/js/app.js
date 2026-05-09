const provider = new ethers.JsonRpcProvider(
  "https://ethereum-sepolia-rpc.publicnode.com"
);

const API = 'http://localhost:3000/api';
// const API = 'https://crypto-wallet-9bgw.onrender.com/api';
let activeWallet = null;
let activeWalletIndex = 0;
let walletBalance = 0;
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
  
  // Initialize mnemonic input grid when import modal is opened
  if (id === 'import-wallet-modal') {
    buildMnemonicInputGrid(12);
  }
}
function closeAllModals() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.error-msg').forEach(e => e.textContent = '');

}

function createWalletModal() {
  closeAllModals();
  document.getElementById('create-password').value = '';
  document.getElementById('confirm-password').value = '';

  document.getElementById('mnemonic-grid').innerHTML = '';
  document.getElementById('mnemonic-meta').textContent = '';
}

function closeBackupModal() {
  closeAllModals();
  document.getElementById('backup-password').value = '';
  document.getElementById('backup-mnemonic-grid').innerHTML = ''
  document.getElementById('backup-meta').innerHTML = '';
  document.getElementById('backup-mnemonic-result').style.display = 'none';
  document.querySelector('#backup-modal > div.form-group').style.display = 'block';
  document.querySelector('#backup-modal > button.btn-primary').style.display = 'block';
  document.querySelector('#backup-error').style.display = 'block';
}

function closeExportModal() {
  closeAllModals();
  document.getElementById('export-password').value = '';
  document.getElementById('export-result').style.display = 'none';
  document.getElementById('export-error').textContent = '';
  document.querySelector('#export-wallet-modal > div.form-group').style.display = 'block';
  document.querySelector('#export-wallet-modal > button.btn-primary').style.display = 'block';
  document.querySelector('#export-error').style.display = 'block';
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
    if (tabName === 'attack') loadAttack();
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
    createWalletModal();
    await refreshAll();
    // selectWallet(data.address);

    // Show mnemonic display modal
    showMnemonicDisplay(data.mnemonic, data.address);
    await saveWallet({
      address: data.address,
      encryptedMnemonic: data.vault.encryptedMnemonic,
      iv: data.vault.iv,
      salt: data.vault.salt,
      authTag: data.vault.authTag,
      accountCount: 1
    });
    activeWallet = ethers.Wallet.fromPhrase(data.mnemonic);
    saveSession(activeWallet);

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
    await reloadWallets();
    await refreshAll();
    const session = loadSession();
    activeWalletIndex = session ? session.activeIndex : 0;
    saveSession(activeWallet);
    showWallet(activeWallet);
    toast('Wallet unlocked!', 'success');
    document.getElementById('password').value = '';
  } catch (e) {
    toast(e.message, 'error');
  }
}

// Lock wallet
document.getElementById('lockWallet-btn')
  .addEventListener('click', () => {
    clearSession();
    activeWallet = null;
    document.getElementById('wallet-screen').style.display = 'none';
    document.querySelector('#no-wallet-screen').style.display = 'flex';
    document.querySelector('#no-wallet-screen #create-wallet-screen').style.display = 'none';
    document.querySelector('#no-wallet-screen #unlock-screen').style.display = 'flex';
    document.getElementById('wallet-list-sidebar').innerHTML = '';
    showUnlockScreen();
    toast('Wallet locked', 'info');
  });


async function showWallet(wallet) {
  document.getElementById('no-wallet-screen').style.display = 'none';
  document.getElementById('wallet-screen').style.display = 'block';

  document.getElementById('hdr-address').textContent = `Address: ${wallet.address}`;
  document.getElementById('hdr-pubkey').textContent = `Public key: ${wallet.publicKey}`;

  refreshAll();
  renderSidebar();
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
  // const index = parseInt(document.getElementById('import-mnemonic-index').value) || 0;
  const errEl = document.getElementById('import-mnemonic-error');
  errEl.textContent = '';

  if (words.length !== 12 && words.length !== 24) {
    errEl.textContent = `Need 12 or 24 words, got ${words.length}`; return;
  }
  if (!password) { errEl.textContent = 'Password required'; return; }

  try {
    const data = await api('/wallet/import/mnemonic', {
      method: 'POST',
      body: JSON.stringify({ mnemonic: mnemonic, password: password })
    });

    await saveWallet({
      address: data.address,
      encryptedMnemonic: data.vault.encryptedMnemonic,
      iv: data.vault.iv,
      salt: data.vault.salt,
      authTag: data.vault.authTag
    });
    activeWallet = ethers.Wallet.fromPhrase(mnemonic);

    await reloadWallets();
    await refreshAll();
    saveSession(activeWallet);
    updateAccountCount(allWallets.length);
    closeAllModals();
    showWallet(data.address);
    toast(`Wallet imported!`, 'success');
    document.getElementById('import-mnemonic-password').value = '';
  } catch (e) {
    errEl.textContent = "Invalid mnemonic or error importing wallet";
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

function copyMnemonic() {
  const inputs = document.querySelectorAll('#mnemonic-grid .word-text');
  const words = Array.from(inputs).map(i => i.textContent.trim()).filter(Boolean);
  navigator.clipboard.writeText(words.join(' '));
  toast('Mnemonic copied to clipboard', 'success');
}

function copyBackupMnemonic() {
  const inputs = document.querySelectorAll('#backup-mnemonic-grid .word-text');
  const words = Array.from(inputs).map(i => i.textContent.trim()).filter(Boolean);
  navigator.clipboard.writeText(words.join(' '));
  toast('Mnemonic copied to clipboard', 'success');
}

function pasteMnemonic() {
  const inputs = document.querySelectorAll('.mnemonic-input-cell input');
  navigator.clipboard.readText().then(text => {
    const words = text.trim().split(/\s+/);
    words.forEach((w, i) => {
      const inp = inputs[i];
      if (inp) inp.value = w;
    });
  });
}

// ── REVEAL MNEMONIC ───────────────────────────────────────
async function revealMnemonic() {
  const pw = document.getElementById('backup-password').value;
  const errEl = document.getElementById('backup-error');
  errEl.textContent = '';
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

    toast('Mnemonic revealed! Handle with care.', 'success');

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
    document.getElementById('backup-mnemonic-result').style.display = 'block'
    document.querySelector('#backup-modal > div.form-group').style.display = 'none';
    document.querySelector('#backup-modal > button.btn-primary').style.display = 'none';
    document.querySelector('#backup-error').style.display = 'none';

  } catch (e) {
    toast(e.message, 'error');
  }
}

async function revealPrivateKey() {
  const pw = document.getElementById('export-password').value;

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
    toast('Private key revealed! Handle with care.', 'success');
    const privateKey = activeWallet.privateKey;
    const el = document.getElementById('export-result');
    el.style.display = 'block';
    el.textContent = privateKey;
    document.getElementById('export-error').textContent = '';

    document.querySelector('#export-wallet-modal > div.form-group').style.display = 'none';
    document.querySelector('#export-wallet-modal > button.btn-primary').style.display = 'none';
    document.querySelector('#export-error').style.display = 'none';
  } catch (e) {
    document.getElementById('export-error').textContent = e.message;
  }
}

function copyAddress() {
  if (!activeWallet) return;
  navigator.clipboard.writeText(activeWallet.address);
  toast('Address copied!', 'info');
}

async function refreshBalance() {
  if (!activeWallet) return;
  try {
    const data = await api(`/wallet/${activeWallet.address}/eth-balance`);
    const marketData = await api('/tokens/market');
    const ethPriceUSD = marketData.eth.priceUSD;
    const walletBalanceUSD = data.balance * ethPriceUSD;
    walletBalance = walletBalanceUSD;

    document.getElementById('hdr-balance').textContent = '$' + parseFloat(walletBalanceUSD).toFixed(2);
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
    toast('Error fetching balance', 'error');
  }
}

// ── RENDER SIDEBAR ───────────────────────────────────────
function renderSidebar() {
  const el = document.getElementById('wallet-list-sidebar');
  let html = '';
  for (let i = 0; i < allWallets.length; i++) {
    const w = allWallets[i];
    const isActive = (i === activeWalletIndex);
    let balStr = isActive ? `$${parseFloat(walletBalance).toFixed(2)}` : "Loading...";
    html += `
      <div class="sidebar-wallet-item ${isActive ? 'active' : ''}" onclick="selectAccount(${i})">
        <div class="sw-label">Account ${i + 1}</div>
        <div class="sw-address">${fmt(w.address)}</div>
        <div class="sw-balance" id="sidebar-bal-${i}">${balStr}</div>
      </div>
    `;
  }
  el.innerHTML = html;

  // Load balances for inactive accounts
  for (let i = 0; i < allWallets.length; i++) {
    if (i !== activeWalletIndex) {
      const w = allWallets[i];
      api(`/wallet/${w.address}/eth-balance`).then(async data => {
        const marketData = await api('/tokens/market');
        const balUSD = data.balance * marketData.eth.priceUSD;
        const balEl = document.getElementById(`sidebar-bal-${i}`);
        if (balEl) balEl.textContent = `$${parseFloat(balUSD).toFixed(2)}`;
      }).catch(e => {
        const balEl = document.getElementById(`sidebar-bal-${i}`);
        if (balEl) balEl.textContent = `Error`;
      });
    }
  }
}

// function renderQuickWallets() {
//   const others = allWallets.filter(w => w.address !== activeWallet?.address);
//   const el = document.getElementById('quick-wallet-list');
//   if (!others.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text3)">No other wallets. Create one first.</div>'; return; }
//   el.innerHTML = others.map(w => `
//     <div class="quick-wallet-btn" onclick="document.getElementById('send-to').value='${w.address}'">
//       <span class="qw-addr">${fmt(w.address)}</span>
//       <span class="qw-bal">${parseFloat(w.balance || 0).toFixed(4)} CVT</span>
//     </div>
//   `).join('');
// }

// ── SEND TRANSACTION ─────────────────────────────────────
let pendingTx = null;
let currentPendingTx = null;
let pendingPollingTimer = null;

function isValidAddress(address) {
  return ethers.isAddress(address);
}

function isValidAmount(amount) {
  if (!amount) return false;
  if (!/^\d*\.?\d+$/.test(amount)) return false;

  try {
    return ethers.parseEther(amount) > 0n;
  } catch {
    return false;
  }
}

const toInput = document.getElementById('send-to');
const amountInput = document.getElementById('send-amount');
const errEl = document.getElementById('send-error');

toInput.addEventListener('input', validateForm);
amountInput.addEventListener('input', validateForm);

function validateForm() {
  const to = toInput.value.trim();
  const amount = amountInput.value;

  if (!to) {
    errEl.textContent = 'Recipient address required';
    return false;
  }

  if (!ethers.isAddress(to)) {
    errEl.textContent = 'Invalid address';
    return false;
  }

  if (!amount) {
    errEl.textContent = 'Amount required';
    return false;
  }

  if (amount >= walletBalance) {
    errEl.textContent = 'Insufficient balance';
    return false;
  }

  try {
    if (ethers.parseEther(amount) <= 0n) {
      errEl.textContent = 'Invalid amount';
      return false;
    }
  } catch {
    errEl.textContent = 'Invalid amount';
    return false;
  }

  errEl.textContent = '';
  return true;
}

async function prepareSendReview() {
  if (!validateForm()) return;
  const to = document.getElementById('send-to').value.trim();
  const amount = parseFloat(document.getElementById('send-amount').value);

  pendingTx = { to, amount };

  document.querySelector('.send-form').classList.add('hidden');
  document.getElementById('send-review').style.display = 'block';
  document.getElementById('review-from').textContent = activeWallet.address;
  document.getElementById('review-to').textContent = to;
  document.getElementById('review-amount').textContent = `${amount.toFixed(4)} ETH`;

  try {
    const data = await api('/transaction/gas-fee', {
      method: 'POST',
      body: JSON.stringify({ from: activeWallet.address, to, amount })
    });

    document.getElementById('review-fee').textContent = `${data.fee} ETH`;
  } catch (e) {
    document.getElementById('review-fee').textContent = 'Error fetching fee';
  }
}

function backToSendForm() {
  document.getElementById('send-review').style.display = 'none';
  document.getElementById('send-error').textContent = '';
  document.querySelector('.send-form').classList.remove('hidden');
}

function activateTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
  if (tabName === 'history') {
    renderHistoryWithPending();
  }
}

async function sendTransaction() {
  const to = document.getElementById('review-to').textContent.trim();
  const amount = document.getElementById('review-amount').textContent.replace("ETH", "").trim();

  const nonce = await provider.getTransactionCount(activeWallet.address);
  const feeData = await provider.getFeeData();
  const gasLimit = await provider.estimateGas({
    from: activeWallet.address,
    to,
    value: ethers.parseEther(amount)
  });

  const tx = {
    to,
    value: ethers.parseEther(amount),
    nonce,
    gasLimit,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    chainId: 11155111 // Sepolia
  };

  const signedTx = await activeWallet.signTransaction(tx);
  console.log('Signed transaction:', signedTx);

  try {
    const data = await api('/transaction/send', {
      method: 'POST',
      body: JSON.stringify({ signedTx })
    });

    const result = data.result;
    console.log('Transaction sent:', result);
    const txHash = result.hash;
    const feePrice = feeData.maxFeePerGas || feeData.gasPrice;
    const estimatedFee = feePrice ? ethers.formatEther(gasLimit * feePrice) : '0';

    currentPendingTx = {
      hash: txHash,
      from: activeWallet.address,
      to,
      amount,
      type: 'out',
      status: 'pending',
      timestamp: Date.now(),
      gasFee: estimatedFee
    };

    toast(`Transaction broadcast! ID: ${txHash.slice(0, 20)}...`, 'success');
    document.getElementById('send-to').value = '';
    document.getElementById('send-amount').value = '';
    pendingTx = null;
    backToSendForm();
    activateTab('history');
    pollPendingTransactionStatus(txHash);

  } catch (e) {
    errEl.textContent = e.message;
    toast(e.message, 'error');
  }
}

// ── LOAD HISTORY ─────────────────────────────────────────
async function loadHistory() {
  if (!activeWallet) return;
  renderHistoryWithPending();
}

async function renderHistoryWithPending() {
  if (!activeWallet) return;
  const el = document.getElementById('history-list');

  try {
    const data = await api(`/transaction/history/${activeWallet.address}`);
    const txItems = [];

    if (currentPendingTx) {
      currentPendingTx.from = currentPendingTx.from.toLowerCase();
      currentPendingTx.to = currentPendingTx.to.toLowerCase();
      txItems.push(renderTxItem(currentPendingTx));
    }

    if (!data.transactions || !data.transactions.length) {
      if (!txItems.length) {
        el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px">No transactions yet.</div>';
        return;
      }
    }

    const historyItems = (data.transactions || []).map(tx => renderTxItem(tx));
    el.innerHTML = [...txItems, ...historyItems].join('');
  } catch (e) {
    el.innerHTML = '<div style="color:var(--red)">Error loading history</div>';
  }
}

async function pollPendingTransactionStatus(txHash) {
  if (!txHash) return;
  if (pendingPollingTimer) clearInterval(pendingPollingTimer);

  const checkStatus = async () => {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt && currentPendingTx && currentPendingTx.hash === txHash) {
        clearInterval(pendingPollingTimer);
        pendingPollingTimer = null;
        currentPendingTx = null;
        renderHistoryWithPending();
        refreshAll();
        toast(`Transaction ${receipt.status === 1 ? 'confirmed' : 'failed'} on blockchain.`, receipt.status === 1 ? 'success' : 'error');
      }
    } catch (err) {
      // ignore temporary network errors
    }
  };
  await checkStatus();
  pendingPollingTimer = setInterval(checkStatus, 5000);
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
        icon: 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png',
        price: balance * data.eth.priceUSD,
        change24h: data.eth.change24h,
        balance: balance,
        badge: 'Earn'
      },
      {
        name: 'Solana',
        symbol: 'SOL',
        icon: 'https://assets.coingecko.com/coins/images/4128/thumb/solana.png',
        price: 0 * data.sol.priceUSD,
        change24h: data.sol.change24h,
        balance: 0,
        badge: ''
      },
      {
        name: 'Bitcoin',
        symbol: 'BTC',
        icon: 'https://assets.coingecko.com/coins/images/1/thumb/bitcoin.png',
        price: 0 * data.btc.priceUSD,
        change24h: data.btc.change24h,
        balance: 0,
        badge: 'Native SegWit'
      },
      {
        name: 'Tether',
        symbol: 'USDT',
        icon: 'https://assets.coingecko.com/coins/images/325/thumb/Tether.png',
        price: 0 * data.usdt.priceUSD,
        change24h: data.usdt.change24h,
        balance: 0,
        badge: 'Stablecoin'
      },
      {
        name: 'USD Coin',
        symbol: 'USDC',
        icon: 'https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png',
        price: 0 * data.usdc.priceUSD,
        change24h: data.usdc.change24h,
        balance: 0,
        badge: 'Stablecoin'
      },
      {
        name: 'Binance Coin',
        symbol: 'BNB',
        icon: 'https://assets.coingecko.com/coins/images/825/thumb/bnb-icon2_2x.png',
        price: 0 * data.bnb.priceUSD,
        change24h: data.bnb.change24h,
        balance: 0,
        badge: ''
      },
      {
        name: 'Cardano',
        symbol: 'ADA',
        icon: 'https://assets.coingecko.com/coins/images/975/thumb/cardano.png',
        price: 0 * data.ada.priceUSD,
        change24h: data.ada.change24h,
        balance: 0,
        badge: ''
      },
      {
        name: 'XRP',
        symbol: 'XRP',
        icon: 'https://assets.coingecko.com/coins/images/44/thumb/xrp-symbol-white-128.png',
        price: 0 * data.xrp.priceUSD,
        change24h: data.xrp.change24h,
        balance: 0,
        badge: ''
      },
      {
        name: 'Polkadot',
        symbol: 'DOT',
        icon: 'https://assets.coingecko.com/coins/images/12171/thumb/polkadot.png',
        price: 0 * data.dot.priceUSD,
        change24h: data.dot.change24h,
        balance: 0,
        badge: ''
      },
      {
        name: 'Chainlink',
        symbol: 'LINK',
        icon: 'https://assets.coingecko.com/coins/images/877/thumb/chainlink-new-logo.png',
        price: 0 * data.link.priceUSD,
        change24h: data.link.change24h,
        balance: 0,
        badge: ''
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
      <img src="${token.icon}" alt="${token.name}" class="token-icon">
      <div class="token-info">
        <div class="token-name">${token.name}${badgeHtml}</div>
        <div class="token-change ${changeClass}">${changeSign} ${Math.abs(token.change24h).toFixed(2)}%</div>
      </div>
      <div class="token-stats">
        <div class="token-price">$${token.price.toFixed(2)}</div>
        <div class="token-balance">${token.balance.toFixed(4)} ${token.symbol}</div>
      </div>
    </div>
  `;
}



function renderTxItem(tx) {
  const status = tx.status || 'success';
  const isOut = tx.type === 'out';
  const dir = isOut ? 'out' : 'in';
  const icon = isOut ? '↑' : '↓';
  const statusClass = status === 'pending' ? 'pending' : status === 'success' ? 'confirmed' : 'failed';
  const statusLabel = status === 'pending' ? 'PENDING' : status === 'success' ? 'CONFIRMED' : 'FAILED';
  const txJson = JSON.stringify(tx).replace(/"/g, '&quot;');

  return `
    <div class="tx-item" onclick="showTxDetail(JSON.parse(this.dataset.tx))" data-tx="${txJson}">
      <div class="tx-icon ${dir}">${icon}</div>
      <div class="tx-info">
        <div class="tx-parties">${fmt(tx.from)} → ${fmt(tx.to)}</div>
        <div class="tx-time">${fmtTime(tx.timestamp)}</div>
      </div>
      <div class="tx-amount">
        <div class="tx-amount-val ${dir}">${fmtAmt(tx.amount, dir)} ETH</div>
        <div class="tx-status ${statusClass}">${statusLabel}</div>
      </div>
    </div>
  `;
}

function showTxDetail(tx) {
  document.getElementById('tx-detail-content').innerHTML = `
    <div class="detail-row"><div class="detail-label">Hash (SHA-256)</div><div class="detail-val">${tx.hash || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">From</div><div class="detail-val">${tx.from}</div></div>
    <div class="detail-row"><div class="detail-label">To</div><div class="detail-val">${tx.to}</div></div>
    <div class="detail-row"><div class="detail-label">Amount</div><div class="detail-val">${tx.amount} ETH</div></div>
    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-val">${tx.status || 'confirmed'}</div></div>
    <div class="detail-row"><div class="detail-label">Timestamp</div><div class="detail-val">${fmtTime(tx.timestamp)}</div></div>
    <div class="detail-row"><div class="detail-label">Total gas fee</div><div class="detail-val">${tx.gasFee} ETH</div></div>
    <div class="detail-row"><div class="detail-label">Total</div><div class="detail-val">${parseFloat(tx.amount) + parseFloat(tx.gasFee)} ETH</div></div>
    <div style="margin-top:8px">
      <button class="btn-primary" style="font-size:13px;padding:8px 16px" onclick="window.open('https://sepolia.etherscan.io/tx/${tx.hash}', '_blank')">View on block explorer</button>
    </div>
  `;
  openModal('tx-detail-modal');
}

// LOAD ATTACK DEMO ───────────────────────────────────────────
function loadAttack() {
  if (!activeWallet) return;
  // Auto-fill fields
  const fromEl = document.getElementById('integrity-from');
  if (fromEl) fromEl.value = activeWallet.address;

  // Auto-fill nonce
  provider.getTransactionCount(activeWallet.address).then(nonce => {
    const nonceEl = document.getElementById('integrity-nonce');
    if (nonceEl) nonceEl.value = nonce;
  });
}

// ═══════════════════════════════════════════════════════════════
// 3.4.2 — SIGN ORIGINAL TX (Bước 1 của Integrity Attack)
// ═══════════════════════════════════════════════════════════════
let _integritySignature = null;
let _integrityOriginalData = null;

async function signOriginalTx() {
  if (!activeWallet) { toast('Vui lòng mở khoá ví trước.', 'error'); return; }

  const to = document.getElementById('integrity-to').value.trim() || '0x000000000000000000000000000000000000dEaD';
  const amount = parseFloat(document.getElementById('integrity-original-amount').value) || 0.001;
  let nonce = parseInt(document.getElementById('integrity-nonce').value);
  if (isNaN(nonce)) nonce = await provider.getTransactionCount(activeWallet.address);

  document.getElementById('integrity-to').value = to;
  document.getElementById('integrity-nonce').value = nonce;

  const txData = { from: activeWallet.address, to, amount, nonce, chainId: 11155111 };
  _integrityOriginalData = JSON.stringify(txData);

  _integritySignature = await activeWallet.signMessage(_integrityOriginalData);
  const hash = ethers.hashMessage(_integrityOriginalData);

  document.getElementById('integrity-signature-display').textContent = _integritySignature;
  document.getElementById('integrity-hash-display').textContent = hash;
  document.getElementById('integrity-sign-result').style.display = 'block';

  // Activate step 2
  const m2 = document.getElementById('integrity-marker-2');
  if (m2) m2.classList.add('active');
  const form2 = document.getElementById('integrity-step2-form');
  if (form2) form2.style.display = 'flex';

  toast('Giao dịch đã được ký thành công!', 'success');
}

// ═══════════════════════════════════════════════════════════════
// 3.4.2 — RUN INTEGRITY ATTACK (Bước 2)
// ═══════════════════════════════════════════════════════════════
async function runIntegrityAttack() {
  const resultEl = document.getElementById('integrity-result');
  const tamperAmount = parseFloat(document.getElementById('integrity-tamper-amount').value);

  if (!activeWallet) { resultEl.innerHTML = '<span style="color:var(--yellow)">⚠ Mở khoá ví trước.</span>'; return; }
  if (!_integritySignature) { resultEl.innerHTML = '<span style="color:var(--yellow)">⚠ Hãy ký giao dịch ở bước 1 trước.</span>'; return; }

  // Activate step 3 marker
  const m3 = document.getElementById('integrity-marker-3');
  if (m3) m3.classList.add('active');

  resultEl.innerHTML = '<span style="color:var(--text3)">⏳ Đang xác minh...</span>';

  const originalHash = ethers.hashMessage(_integrityOriginalData);
  const original = JSON.parse(_integrityOriginalData);

  // Kẻ tấn công sửa amount
  const tampered = { ...original, amount: tamperAmount };
  const tamperedData = JSON.stringify(tampered);
  const tamperedHash = ethers.hashMessage(tamperedData);

  // Xác minh chữ ký với dữ liệu bị sửa
  let recoveredAddress, isValid;
  try {
    recoveredAddress = ethers.verifyMessage(tamperedData, _integritySignature);
    isValid = recoveredAddress.toLowerCase() === activeWallet.address.toLowerCase();
  } catch(e) { isValid = false; recoveredAddress = 'ERROR'; }

  const step = (num, cls, label, val) => `
    <div class="integrity-step">
      <div class="step-num ${cls}">${num}</div>
      <div class="step-content">
        <div class="step-label">${label}</div>
        <div class="step-val">${val}</div>
      </div>
    </div>`;

  resultEl.innerHTML = `
    ${step(1, 'ok', '✅ Ký giao dịch gốc (amount = ' + original.amount + ' ETH)', 'Signature: ' + _integritySignature.slice(0,28) + '...')}
    ${step(2, 'info', '📋 Hash giao dịch gốc', originalHash)}
    ${step(3, 'fail', '💀 Kẻ tấn công sửa amount → ' + tamperAmount + ' ETH', 'Hash bị sửa: ' + tamperedHash)}
    ${step(4, isValid ? 'fail' : 'ok',
      isValid ? '❌ Chữ ký vẫn hợp lệ (lỗi!)' : '🔒 Xác minh: KHÔNG HỢP LỆ',
      'Recovered: ' + recoveredAddress.slice(0,20) + '...\nWallet: ' + activeWallet.address.slice(0,20) + '...\nKhớp: ' + (isValid ? 'CÓ (lỗi!)' : 'KHÔNG → TỪ CHỐI')
    )}
    <div class="conclusion-box ${isValid ? 'fail' : 'success'}">
      ${isValid ? '⚠️ Phát hiện lỗi bảo mật!' : '✅ KẾT LUẬN: Dữ liệu bị sửa → Hash thay đổi → Chữ ký ECDSA không khớp → Giao dịch bị TỪ CHỐI.'}
    </div>`;

  if (m3) m3.classList.add(isValid ? 'error' : 'completed');
}

// ═══════════════════════════════════════════════════════════════
// 3.4.3 — NONCE: Bước 1 — Gửi giao dịch gốc
// ═══════════════════════════════════════════════════════════════
let _lastSignedTxHex = null;

async function nonceStepSendTx() {
  const to = document.getElementById('nonce-to').value.trim();
  const amount = document.getElementById('nonce-amount').value.trim();
  const resultEl = document.getElementById('nonce-step1-result');
  const btn = document.getElementById('nonce-send-btn');

  if (!activeWallet) { toast('Mở khoá ví trước.', 'error'); return; }
  if (!ethers.isAddress(to)) { toast('Địa chỉ không hợp lệ.', 'error'); return; }
  if (!amount || parseFloat(amount) <= 0) { toast('Số tiền không hợp lệ.', 'error'); return; }

  btn.disabled = true;
  btn.querySelector('span:last-child').textContent = '⏳ Đang gửi...';
  resultEl.style.display = 'none';

  try {
    const nonce = await provider.getTransactionCount(activeWallet.address);
    const feeData = await provider.getFeeData();
    const gasLimit = await provider.estimateGas({
      from: activeWallet.address, to, value: ethers.parseEther(amount)
    });

    const tx = {
      to, value: ethers.parseEther(amount), nonce, gasLimit,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      chainId: 11155111
    };

    const signedTx = await activeWallet.signTransaction(tx);
    _lastSignedTxHex = signedTx;

    const data = await api('/transaction/send', { method: 'POST', body: JSON.stringify({ signedTx }) });
    const hash = data.result.hash;

    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div class="sign-result-item">
        <div class="sign-result-label">✅ Giao dịch đã broadcast</div>
        <div class="sign-result-value">Hash: ${hash}</div>
      </div>
      <div class="sign-result-item">
        <div class="sign-result-label">📋 Nonce sử dụng</div>
        <div class="sign-result-value">${nonce}</div>
      </div>
      <div class="sign-result-item">
        <div class="sign-result-label">🔑 Signed TX Hex (đã tự động điền vào bước 2)</div>
        <div class="sign-result-value" style="max-height:60px;overflow:auto">${signedTx.slice(0,80)}...</div>
      </div>`;

    // Auto-fill vào bước 2
    document.getElementById('replay-signed-transaction').value = signedTx;
    const m2 = document.getElementById('nonce-marker-2');
    if (m2) m2.classList.add('active');

    toast('Giao dịch gốc đã gửi! Nonce=' + nonce, 'success');
  } catch (e) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div style="color:var(--red)">✗ Lỗi: ${e.message}</div>`;
    resultEl.style.borderColor = 'rgba(255,77,109,0.25)';
  } finally {
    btn.disabled = false;
    btn.querySelector('span:last-child').textContent = 'Gửi giao dịch gốc';
  }
}

// ═══════════════════════════════════════════════════════════════
// 3.4.3 — REPLAY ATTACK (Bước 2)
// ═══════════════════════════════════════════════════════════════
async function runReplayAttack() {
  const signedTx = document.getElementById('replay-signed-transaction').value.trim();
  const resultEl = document.getElementById('ra-result');
  const m3 = document.getElementById('nonce-marker-3');

  if (!signedTx) {
    resultEl.innerHTML = '<span style="color:var(--yellow)">⚠ Dán signed transaction hex vào ô trên hoặc gửi giao dịch gốc ở bước 1.</span>';
    return;
  }

  if (m3) m3.classList.add('active');
  resultEl.innerHTML = '<span style="color:var(--text3)">⏳ Đang phát lại giao dịch...</span>';

  try {
    const data = await api('/transaction/send', { method: 'POST', body: JSON.stringify({ signedTx }) });
    const result = data.result;
    if (m3) m3.classList.add('error');
    resultEl.innerHTML = `<div class="conclusion-box fail">⚠ Giao dịch được chấp nhận! Hash: ${result.hash.slice(0,20)}...\n→ Nonce chưa bị dùng. Thử lại với signedTx đã broadcast.</div>`;
  } catch (e) {
    if (m3) m3.classList.add('completed');
    resultEl.innerHTML = `
      <div class="integrity-step">
        <div class="step-num ok">✓</div>
        <div class="step-content">
          <div class="step-label">✅ Phòng thủ Replay Attack thành công!</div>
          <div class="step-val">Mạng từ chối: ${e.message}</div>
        </div>
      </div>
      <div class="conclusion-box success">✅ KẾT LUẬN: Nonce trong signedTx đã bị dùng → Ethereum node từ chối giao dịch trùng lặp → Replay Attack thất bại.</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3.4.4 — RACE ATTACK / PENDING STATE MONITOR
// Gửi giao dịch thật → Theo dõi trạng thái pending real-time
// UI cảnh báo → ngăn người dùng giao dịch vội (Race Attack defense)
// ═══════════════════════════════════════════════════════════════
let _racePollingTimer = null;

async function runRaceAttackDemo() {
  const to       = document.getElementById('race-to').value.trim();
  const amount   = document.getElementById('race-amount').value.trim();
  const resultEl = document.getElementById('race-result');
  const btn      = document.getElementById('race-send-btn');

  if (!activeWallet) {
    resultEl.innerHTML = '<span style="color:var(--yellow)">⚠ Vui lòng mở khoá ví trước.</span>';
    return;
  }
  if (!ethers.isAddress(to)) {
    resultEl.innerHTML = '<span style="color:var(--red)">✗ Địa chỉ người nhận không hợp lệ.</span>';
    return;
  }
  if (!amount || parseFloat(amount) <= 0) {
    resultEl.innerHTML = '<span style="color:var(--red)">✗ Số lượng ETH không hợp lệ.</span>';
    return;
  }

  // Dừng polling cũ nếu có
  if (_racePollingTimer) { clearInterval(_racePollingTimer); _racePollingTimer = null; }

  btn.disabled = true;
  btn.querySelector('span:last-child').textContent = '⏳ Đang gửi...';
  resultEl.innerHTML = '<span style="color:var(--text3)">📡 Đang ký và phát sóng giao dịch...</span>';

  let txHash = null;
  let startTime = Date.now();

  try {
    // Lấy nonce & fee data
    const nonce    = await provider.getTransactionCount(activeWallet.address);
    const feeData  = await provider.getFeeData();
    const gasLimit = await provider.estimateGas({
      from: activeWallet.address, to,
      value: ethers.parseEther(amount)
    });

    const tx = {
      to,
      value: ethers.parseEther(amount),
      nonce,
      gasLimit,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      chainId: 11155111
    };

    const signedTx = await activeWallet.signTransaction(tx);

    // Broadcast
    const data = await api('/transaction/send', {
      method: 'POST',
      body: JSON.stringify({ signedTx })
    });

    txHash = data.result.hash;
    startTime = Date.now();

    resultEl.innerHTML = `<span style="color:var(--green)">✅ Giao dịch đã broadcast! Hash: <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" style="color:var(--accent)">${txHash.slice(0,22)}...</a></span>`;

    // Hiển thị pending card ngay lập tức
    _updatePendingMonitor(txHash, to, amount, nonce, 'pending', startTime);

    // Hiện cảnh báo Race Attack
    document.getElementById('race-warning').style.display = 'flex';

    // ── Bắt đầu polling mỗi 5 giây ──
    _racePollingTimer = setInterval(async () => {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        if (receipt) {
          clearInterval(_racePollingTimer);
          _racePollingTimer = null;
          const confirmed = receipt.status === 1;
          _updatePendingMonitor(txHash, to, amount, nonce,
            confirmed ? 'confirmed' : 'failed', startTime);
          document.getElementById('race-warning').style.display = 'none';
          document.getElementById('pending-dot').className = 'pending-dot ' + (confirmed ? 'confirmed' : '');
          btn.disabled = false;
          btn.querySelector('span:last-child').textContent = 'Gửi & Monitor Pending';
          resultEl.innerHTML = `<span style="color:${confirmed ? 'var(--green)' : 'var(--red)'}">
            ${confirmed ? '✅' : '❌'} Giao dịch ${confirmed ? 'xác nhận thành công' : 'thất bại'} sau ${elapsed}s. 
            Block #${receipt.blockNumber}</span>`;
        } else {
          // Vẫn pending → cập nhật timer
          _updatePendingMonitor(txHash, to, amount, nonce, 'pending', startTime);
        }
      } catch(e) {
        // Bỏ qua lỗi mạng tạm thời
      }
    }, 5000);

  } catch(e) {
    resultEl.innerHTML = `<span style="color:var(--red)">✗ Lỗi: ${e.message}</span>`;
    btn.disabled = false;
    btn.querySelector('span:last-child').textContent = 'Gửi & Monitor Pending';
  }
}

function _updatePendingMonitor(hash, to, amount, nonce, status, startTime) {
  const dot = document.getElementById('pending-dot');
  const listEl = document.getElementById('pending-tx-list');

  dot.className = 'pending-dot' + (status === 'pending' ? ' active' : status === 'confirmed' ? ' confirmed' : '');

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const badgeLabel = status === 'pending' ? '⏳ PENDING' : status === 'confirmed' ? '✅ CONFIRMED' : '❌ FAILED';

  listEl.innerHTML = `
    <div class="pending-tx-card status-${status}">
      <div class="ptx-header">
        <span class="ptx-badge ${status}">${badgeLabel}</span>
        <a href="https://sepolia.etherscan.io/tx/${hash}" target="_blank"
           style="font-size:10px;color:var(--accent);font-family:var(--mono)">Etherscan ↗</a>
      </div>
      <div class="ptx-hash">${hash.slice(0,30)}...</div>
      <div class="ptx-row"><span class="ptx-label">To:</span><span class="ptx-val">${to.slice(0,18)}...</span></div>
      <div class="ptx-row"><span class="ptx-label">Amount:</span><span class="ptx-val">${amount} ETH</span></div>
      <div class="ptx-row"><span class="ptx-label">Nonce:</span><span class="ptx-val">${nonce}</span></div>
      <div class="ptx-timer ${status !== 'pending' ? 'done' : ''}">
        ${status === 'pending'
          ? `⏱ Đã chờ: ${elapsed}s — Mạng đang xử lý...`
          : `✓ Hoàn thành sau ${elapsed}s`}
      </div>
      ${status === 'pending' ? `
      <div style="margin-top:8px;font-size:10px;color:var(--red);font-family:var(--sans)">
        🛡 Cảnh báo Race Attack: Không gửi thêm TX với cùng Nonce ${nonce} trong lúc này!
      </div>` : ''}
    </div>
  `;
}

// ── MULTI-ACCOUNT ───────────────────────────────────────
async function hasActivity(wallet) {
  const balance = await provider.getBalance(wallet.address);

  // từng có ETH
  if (balance > 0n) return true;

  // từng có transaction
  const txCount = await provider.getTransactionCount(wallet.address);

  return txCount > 0;
}

async function reloadWallets() {
  if (!activeWallet) return;

  allWallets = [];

  const walletData = await getWallet();

  // nếu còn local data thì load nhanh
  if (walletData?.accountCount) {
    for (let i = 0; i < walletData.accountCount; i++) {
      const wallet = ethers.HDNodeWallet.fromPhrase(
        activeWallet.mnemonic.phrase,
        null,
        `m/44'/60'/0'/0/${i}`
      );

      allWallets.push(wallet);
    }
  }

  // // mất local data => scan blockchain
  else {
    let emptyCount = 0;
    let index = 0;

    while (emptyCount < 5) { // test trước, sau tăng lên 20
      const wallet = ethers.HDNodeWallet.fromPhrase(
        activeWallet.mnemonic.phrase,
        null,
        `m/44'/60'/0'/0/${index}`
      );

      const used = await hasActivity(wallet);

      if (used) {
        allWallets.push(wallet);
        emptyCount = 0;
      } else {
        emptyCount++;
      }

      index++;
    }

    // ít nhất phải có account 0
    if (allWallets.length === 0) {
      const wallet = ethers.HDNodeWallet.fromPhrase(
        activeWallet.mnemonic.phrase,
        null,
        `m/44'/60'/0'/0/0`
      );

      allWallets.push(wallet);
    }
  }

  if (activeWalletIndex >= allWallets.length) {
    activeWalletIndex = 0;
  }

  activeWallet = allWallets[activeWalletIndex];
}

async function selectAccount(index) {
  activeWalletIndex = index;
  activeWallet = allWallets[activeWalletIndex];
  saveSession(activeWallet, activeWalletIndex);
  showWallet(activeWallet);
  document.querySelector(".tab[data-tab='tokens']").click();
}

async function addNewAccount() {
  if (!activeWallet.mnemonic.phrase) {
    toast('Please unlock your wallet first', 'error');
    return;
  }

  try {
    const newIndex = allWallets.length;

    const wallet = ethers.HDNodeWallet.fromPhrase(
      activeWallet.mnemonic.phrase,
      null,
      `m/44'/60'/0'/0/${newIndex}`
    );

    allWallets.push(wallet);

    // chỉ cache UI thôi
    await updateAccountCount(allWallets.length);

    await selectAccount(newIndex);

    toast(`Account ${newIndex + 1} created!`, 'success');

  } catch (e) {
    toast(e.message, 'error');
  }
}

// // ── REFRESH ──────────────────────────────────────────────
async function refreshAll() {
  try {
    if (activeWallet) {
      await refreshBalance();
      renderSidebar();
      loadTokens();
    }
    
  } catch (e) {
    toast('Error refreshing data', 'error');
  }
}

// ── INIT ─────────────────────────────────────────────────
async function init() {
  try {
    const exists = await hasWallet();

    if (!exists) {
      showCreateWalletScreen();
      return;
    }

    const session = loadSession();

    if (session?.mnemonic) {
      const currentMnemonic = session.mnemonic;
      activeWalletIndex = session.activeIndex || 0;
      activeWallet = ethers.HDNodeWallet.fromPhrase(
        currentMnemonic,
        null,
        `m/44'/60'/0'/0/${activeWalletIndex}`
      );
      await reloadWallets();

      showWallet(activeWallet);
      toast('Wallet unlocked!', 'success');
    } else {
      showUnlockScreen();
    }

  } catch (err) {
    console.error(err);
    showCreateWalletScreen();
  }
}

init();