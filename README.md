# CryptoVault — Simulated Blockchain Wallet

## Quick Start
```bash
npm install
node api/server.js
# Open http://localhost:3000
```

## Architecture
```
/core        → wallet.js, crypto.js, signature.js
/blockchain  → transaction.js, block.js, ledger.js
/network     → mempool.js, miner.js
/api         → server.js, routes.js
/frontend    → index.html, css/, js/
```

## Features
- ECDSA key generation (secp256k1)
- AES-encrypted private key storage
- SHA-256 transaction hashing
- Mempool with balance locking
- Auto-mining every 10s
- Real-time SSE updates
- Attack demos: tamper, double-spend, fake signature, multi-sig
