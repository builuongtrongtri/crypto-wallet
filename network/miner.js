const mempool = require('./mempool');
const ledger = require('../blockchain/ledger');

let autoMineInterval = null;
const mineListeners = [];

function onMine(cb) {
  mineListeners.push(cb);
}

function mine() {
  const pending = mempool.flush();
  if (pending.length === 0) return null;

  const confirmed = pending.map(tx => ({ ...tx, status: 'confirmed' }));
  const block = ledger.addBlock(confirmed);

  mineListeners.forEach(cb => cb(block));
  return block;
}

function startAutoMine(intervalMs = 8000) {
  if (autoMineInterval) return;
  autoMineInterval = setInterval(() => {
    if (mempool.size() > 0) {
      mine();
    }
  }, intervalMs);
}

function stopAutoMine() {
  if (autoMineInterval) {
    clearInterval(autoMineInterval);
    autoMineInterval = null;
  }
}

module.exports = { mine, startAutoMine, stopAutoMine, onMine };
