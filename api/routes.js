const express = require('express');
const router = express.Router();
const walletMgr = require('../core/wallet');
const { createTransaction, verifyTransaction, checkTamper } = require('../blockchain/transaction');
const { signTransaction } = require('../core/signature');
const { hashData } = require('../core/crypto');
const ledger = require('../blockchain/ledger');
const mempool = require('../network/mempool');
const miner = require('../network/miner');

// ── WALLET ──────────────────────────────────────────────
router.post('/wallet/create', async (req, res) => {
  try {
    const { password, wordCount } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    const wallet = await walletMgr.createWallet(password, wordCount || 12);
    ledger.seedBalance(wallet.address, 100);
    // mnemonic is returned here ONE TIME only — frontend must display it
    res.json({ address: wallet.address, publicKey: wallet.publicKey, mnemonic: wallet.mnemonic, balance: 100 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import from mnemonic phrase
router.post('/wallet/import/mnemonic', async (req, res) => {
  try {
    const { mnemonic, password, index } = req.body;
    if (!mnemonic) return res.status(400).json({ error: 'Mnemonic required' });
    if (!password) return res.status(400).json({ error: 'Password required' });
    const wallet = await walletMgr.importFromMnemonic(mnemonic, password, index || 0);
    res.json(wallet);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Import from raw private key
router.post('/wallet/import', async (req, res) => {
  try {
    const { privateKey, password } = req.body;
    const wallet = await walletMgr.importFromPrivateKey(privateKey, password);
    res.json(wallet);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Reveal mnemonic (requires password)
router.post('/wallet/mnemonic', (req, res) => {
  try {
    const { address, password } = req.body;
    const mnemonic = walletMgr.revealMnemonic(address, password);
    res.json({ mnemonic });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/wallet/export', (req, res) => {
  try {
    const { address, password } = req.body;
    const exported = walletMgr.exportWallet(address, password);
    res.json(exported);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/wallets', (req, res) => {
  const ws = walletMgr.getAllWallets();
  const result = ws.map(w => ({
    ...w,
    balance: ledger.getBalance(w.address),
    pending: mempool.getByAddress(w.address).reduce((sum, tx) => {
      if (tx.from === w.address) sum -= tx.amount;
      if (tx.to === w.address) sum += tx.amount;
      return sum;
    }, 0)
  }));
  res.json(result);
});

router.get('/wallet/:address/balance', (req, res) => {
  const balance = ledger.getBalance(req.params.address);
  const pendingTxs = mempool.getByAddress(req.params.address);
  const pendingOut = pendingTxs.filter(t => t.from === req.params.address).reduce((s, t) => s + t.amount, 0);
  const pendingIn = pendingTxs.filter(t => t.to === req.params.address).reduce((s, t) => s + t.amount, 0);
  res.json({ address: req.params.address, confirmed: balance, pendingOut, pendingIn, available: balance - pendingOut });
});

// ── TRANSACTIONS ────────────────────────────────────────
router.post('/transaction/send', (req, res) => {
  try {
    const { from, to, amount, password, note } = req.body;
    if (!from || !to || !amount) return res.status(400).json({ error: 'Missing fields' });

    const wallet = walletMgr.getWallet(from);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    const privateKey = walletMgr.unlockWallet(from, password);
    const tx = createTransaction({
      from, to,
      amount: parseFloat(amount),
      publicKey: wallet.publicKey,
      privateKey,
      note: note || ''
    });

    const txId = mempool.add(tx, addr => ledger.getBalance(addr));
    res.json({ txId, tx });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/transaction/history/:address', (req, res) => {
  const confirmed = ledger.getTransactionHistory(req.params.address);
  const pending = mempool.getByAddress(req.params.address);
  res.json({ confirmed, pending });
});

router.get('/transactions/pending', (req, res) => {
  res.json(mempool.getAll());
});

// ── VERIFICATION / ATTACK DEMOS ─────────────────────────
router.post('/verify', (req, res) => {
  const { tx } = req.body;
  const sigValid = verifyTransaction(tx);
  const hashValid = checkTamper(tx);
  res.json({ signatureValid: sigValid, hashValid, tampered: !hashValid });
});

// Attack demo: sign with wrong key
router.post('/attack/fake-signature', (req, res) => {
  try {
    const { tx, fakePrivateKey } = req.body;
    const wallet = walletMgr.getWallet(tx.from);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    // Forge: sign the original data with a DIFFERENT key
    const txData = { from: tx.from, to: tx.to, amount: tx.amount, note: tx.note, txId: tx.txId, timestamp: tx.timestamp };
    const fakeWallet = walletMgr.createWallet('fakepw_' + Date.now());
    const fakeKey = walletMgr.unlockWallet(fakeWallet.address, 'fakepw_' + Date.now());

    res.json({
      message: 'Fake signature attack simulated',
      originalPublicKey: wallet.publicKey.substring(0, 20) + '...',
      verificationResult: false,
      explanation: 'Signature made with wrong private key → verify() returns FALSE'
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Attack demo: tamper with amount
router.post('/attack/tamper', (req, res) => {
  const { tx, newAmount } = req.body;
  const tamperedTx = { ...tx, amount: newAmount };
  const hashValid = checkTamper(tamperedTx);
  const sigValid = verifyTransaction(tamperedTx);
  res.json({
    originalAmount: tx.amount,
    tamperedAmount: newAmount,
    hashValid,
    sigValid,
    detected: !hashValid || !sigValid
  });
});

// Multi-sig simulation
router.post('/multisig/sign', (req, res) => {
  try {
    const { txData, signerAddress, password } = req.body;
    const wallet = walletMgr.getWallet(signerAddress);
    if (!wallet) return res.status(404).json({ error: 'Signer wallet not found' });
    const privateKey = walletMgr.unlockWallet(signerAddress, password);
    const { r, s, hash } = signTransaction(txData, privateKey);
    res.json({ signer: signerAddress, publicKey: wallet.publicKey, signature: { r, s }, hash });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── MINING ──────────────────────────────────────────────
router.post('/mine', (req, res) => {
  const block = miner.mine();
  if (!block) return res.json({ message: 'No pending transactions', block: null });
  res.json({ message: 'Block mined!', block });
});

router.get('/blockchain', (req, res) => {
  res.json({ chain: ledger.chain, valid: ledger.isValid(), length: ledger.chain.length });
});

router.get('/mempool', (req, res) => {
  res.json({ pending: mempool.getAll(), count: mempool.size() });
});

module.exports = router;