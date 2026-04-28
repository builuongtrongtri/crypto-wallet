#!/bin/bash
echo "🔐 Starting CryptoVault..."
cd "$(dirname "$0")"
node api/server.js
