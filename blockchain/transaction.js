const { hashData } = require('../core/crypto');
const { signTransaction, verifySignature } = require('../core/signature');

let txCounter = 0;

function createTransaction({ from, to, amount, publicKey, privateKey, note = '' }) {
  const txId = `tx_${Date.now()}_${++txCounter}`;
  const txData = { from, to, amount: parseFloat(amount), note, txId, timestamp: Date.now() };
  const { r, s, hash } = signTransaction(txData, privateKey);

  return {
    ...txData,
    hash,
    signature: { r, s },
    publicKey,
    status: 'pending'
  };
}

function verifyTransaction(tx) {
  const txData = {
    from: tx.from,
    to: tx.to,
    amount: tx.amount,
    note: tx.note,
    txId: tx.txId,
    timestamp: tx.timestamp
  };
  return verifySignature(txData, tx.signature, tx.publicKey);
}

// Tamper check: recompute hash and compare
function checkTamper(tx) {
  const txData = {
    from: tx.from,
    to: tx.to,
    amount: tx.amount,
    note: tx.note,
    txId: tx.txId,
    timestamp: tx.timestamp
  };
  const expectedHash = hashData(txData);
  return expectedHash === tx.hash;
}

module.exports = { createTransaction, verifyTransaction, checkTamper };
