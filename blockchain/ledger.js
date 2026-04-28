const { createGenesisBlock, createBlock } = require('./block');

class Ledger {
  constructor() {
    this.chain = [createGenesisBlock()];
    // Genesis balances: seed some addresses with initial coins
    this.genesisBalances = new Map();
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  addBlock(transactions) {
    const prev = this.getLatestBlock();
    const block = createBlock(prev.index + 1, transactions, prev.hash);
    this.chain.push(block);
    return block;
  }

  seedBalance(address, amount) {
    this.genesisBalances.set(address, (this.genesisBalances.get(address) || 0) + amount);
  }

  getBalance(address) {
    let balance = this.genesisBalances.get(address) || 0;
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.to === address) balance += tx.amount;
        if (tx.from === address) balance -= tx.amount;
      }
    }
    return Math.round(balance * 1e8) / 1e8;
  }

  getTransactionHistory(address) {
    const txs = [];
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.from === address || tx.to === address) {
          txs.push({ ...tx, blockIndex: block.index, status: 'confirmed' });
        }
      }
    }
    return txs.sort((a, b) => b.timestamp - a.timestamp);
  }

  getAllTransactions() {
    const txs = [];
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        txs.push({ ...tx, blockIndex: block.index, status: 'confirmed' });
      }
    }
    return txs;
  }

  isValid() {
    for (let i = 1; i < this.chain.length; i++) {
      if (this.chain[i].previousHash !== this.chain[i - 1].hash) return false;
    }
    return true;
  }
}

const ledger = new Ledger();
module.exports = ledger;
