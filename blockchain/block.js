const { sha256 } = require('../core/crypto');

function createBlock(index, transactions, previousHash) {
  const timestamp = Date.now();
  const blockData = { index, transactions, previousHash, timestamp };
  const hash = sha256(JSON.stringify(blockData));
  return { index, transactions, previousHash, timestamp, hash };
}

function createGenesisBlock() {
  return createBlock(0, [], '0'.repeat(64));
}

module.exports = { createBlock, createGenesisBlock };
