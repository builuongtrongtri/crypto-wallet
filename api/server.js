const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api', routes);

async function start() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🔐 CryptoWallet running at http://localhost:${PORT}`);
    console.log(`📡 Connected to Sepolia Testnet`);
  });
}

start().catch(err => {
  console.error('Server failed to start:', err);
  process.exit(1);
});