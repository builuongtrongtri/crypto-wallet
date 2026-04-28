const { verifyTransaction, checkTamper } = require('../blockchain/transaction');

class Mempool {
  constructor() {
    this.pending = new Map(); // txId -> tx
    this.lockedBalances = new Map(); // address -> amount locked
  }

  add(tx, balanceCheck) {
    // Verify signature
    if (!verifyTransaction(tx)) {
      throw new Error('Invalid signature');
    }
    // Check tamper
    if (!checkTamper(tx)) {
      throw new Error('Transaction data has been tampered');
    }
    // Check balance (including locked)
    const locked = this.lockedBalances.get(tx.from) || 0;
    const available = balanceCheck(tx.from) - locked;
    if (available < tx.amount) {
      throw new Error(`Insufficient balance. Available: ${available.toFixed(4)}`);
    }
    // Lock balance
    this.lockedBalances.set(tx.from, locked + tx.amount);
    this.pending.set(tx.txId, { ...tx, addedAt: Date.now() });
    return tx.txId;
  }

  getAll() {
    return Array.from(this.pending.values());
  }

  getByAddress(address) {
    return this.getAll().filter(tx => tx.from === address || tx.to === address);
  }

  flush() {
    const txs = this.getAll();
    this.pending.clear();
    this.lockedBalances.clear();
    return txs;
  }

  remove(txId) {
    const tx = this.pending.get(txId);
    if (tx) {
      const locked = this.lockedBalances.get(tx.from) || 0;
      this.lockedBalances.set(tx.from, Math.max(0, locked - tx.amount));
      this.pending.delete(txId);
    }
  }

  size() {
    return this.pending.size;
  }
}

const mempool = new Mempool();
module.exports = mempool;
