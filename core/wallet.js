/**
 * Wallet Manager — BIP-39 / BIP-44 compliant
 *
 * Flow thực tế:
 *   Mnemonic (12/24 words)
 *     → BIP-39 seed (512-bit, PBKDF2)
 *       → BIP-32 HD root key
 *         → BIP-44 path: m/44'/60'/0'/0/index
 *           → Private Key → Public Key → Address
 *
 * Giống hệt MetaMask / Trust Wallet / Ledger
 */

const bip39  = require('bip39');
const { HDKey } = require('@scure/bip32');
const CryptoJS  = require('crypto-js');
const { getPublicKey, publicKeyToAddress } = require('./crypto');

// storage: address → wallet record
const wallets = new Map();

// ── BIP-44 derivation path (Ethereum standard) ───────────
const BASE_PATH = "m/44'/60'/0'/0"; // coin=60 (ETH), account=0, external

function derivePath(index = 0) {
  return `${BASE_PATH}/${index}`;
}

// ── Mnemonic helpers ──────────────────────────────────────

function generateMnemonic(strength = 128) {
  // 128-bit → 12 words  |  256-bit → 24 words
  return bip39.generateMnemonic(strength);
}

function validateMnemonic(mnemonic) {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
}

// ── HD Key derivation ─────────────────────────────────────

async function derivePrivateKey(mnemonic, index = 0, passphrase = '') {
  // BIP-39: mnemonic → 64-byte seed (PBKDF2-HMAC-SHA512, 2048 rounds)
  const seed = await bip39.mnemonicToSeed(mnemonic.trim(), passphrase);

  // BIP-32: seed → HD root
  const root = HDKey.fromMasterSeed(seed);

  // BIP-44: m/44'/60'/0'/0/{index}
  const child = root.derive(derivePath(index));

  if (!child.privateKey) throw new Error('Key derivation failed');
  return Buffer.from(child.privateKey).toString('hex');
}

// ── Wallet creation ───────────────────────────────────────

async function createWallet(password, wordCount = 12) {
  const strength = wordCount === 24 ? 256 : 128;
  const mnemonic = generateMnemonic(strength);
  const { address, publicKey } = await importFromMnemonic(mnemonic, password, 0);
  // mnemonic returned ONCE — caller must display and discard
  return { address, publicKey, mnemonic };
}

async function importFromMnemonic(mnemonic, password, index = 0) {
  if (!validateMnemonic(mnemonic)) throw new Error('Invalid recovery phrase');

  const privateKey = await derivePrivateKey(mnemonic, index);
  const publicKey  = getPublicKey(privateKey);
  const address    = publicKeyToAddress(publicKey);

  const encryptedMnemonic   = CryptoJS.AES.encrypt(mnemonic, password).toString();
  const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKey, password).toString();

  wallets.set(address, {
    address,
    publicKey,
    encryptedMnemonic,
    encryptedPrivateKey,
    derivationPath: derivePath(index),
    accountIndex: index,
    createdAt: Date.now()
  });

  return { address, publicKey };
}

async function importFromPrivateKey(privateKey, password) {
  privateKey = privateKey.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error('Invalid private key (must be 64 hex chars)');

  const publicKey = getPublicKey(privateKey);
  const address   = publicKeyToAddress(publicKey);

  const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKey, password).toString();

  wallets.set(address, {
    address,
    publicKey,
    encryptedMnemonic: null,
    encryptedPrivateKey,
    derivationPath: 'imported',
    accountIndex: null,
    createdAt: Date.now()
  });

  return { address, publicKey };
}

// ── Unlock / Export ───────────────────────────────────────

function unlockWallet(address, password) {
  const wallet = wallets.get(address);
  if (!wallet) throw new Error('Wallet not found');
  try {
    const bytes = CryptoJS.AES.decrypt(wallet.encryptedPrivateKey, password);
    const privateKey = bytes.toString(CryptoJS.enc.Utf8);
    if (!privateKey || privateKey.length !== 64) throw new Error('Wrong password');
    return privateKey;
  } catch {
    throw new Error('Wrong password or corrupted wallet');
  }
}

function revealMnemonic(address, password) {
  const wallet = wallets.get(address);
  if (!wallet) throw new Error('Wallet not found');
  if (!wallet.encryptedMnemonic) throw new Error('This wallet was imported via private key — no recovery phrase available');
  try {
    const bytes    = CryptoJS.AES.decrypt(wallet.encryptedMnemonic, password);
    const mnemonic = bytes.toString(CryptoJS.enc.Utf8);
    if (!mnemonic || !validateMnemonic(mnemonic)) throw new Error('Wrong password');
    return mnemonic;
  } catch {
    throw new Error('Wrong password');
  }
}

function exportWallet(address, password) {
  const privateKey = unlockWallet(address, password);
  const wallet     = wallets.get(address);
  return {
    privateKey,
    address,
    derivationPath: wallet?.derivationPath || 'unknown',
    hasMnemonic: !!wallet?.encryptedMnemonic
  };
}

function getWallet(address) {
  return wallets.get(address) || null;
}

function getAllWallets() {
  return Array.from(wallets.values()).map(w => ({
    address: w.address,
    publicKey: w.publicKey,
    derivationPath: w.derivationPath,
    hasMnemonic: !!w.encryptedMnemonic,
    createdAt: w.createdAt
  }));
}

module.exports = {
  createWallet,
  importFromMnemonic,
  importFromPrivateKey,
  importWallet: importFromPrivateKey, // backward compat
  getWallet,
  getAllWallets,
  unlockWallet,
  exportWallet,
  revealMnemonic,
  validateMnemonic,
  generateMnemonic,
  derivePrivateKey,
  derivePath,
  BASE_PATH
};