const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const miner = require('../network/miner');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// SSE clients for real-time push
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = res;
  sseClients.add(client);

  const heartbeat = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 15000);

  req.on('close', () => {
    sseClients.delete(client);
    clearInterval(heartbeat);
  });
});

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => c.write(msg));
}

miner.onMine(block => {
  broadcast('block', block);
});

// Auto-mine every 10 seconds if there are pending txs
miner.startAutoMine(10000);

app.use('/api', routes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🔐 CryptoWallet running at http://localhost:${PORT}`);
});
