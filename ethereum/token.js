require('dotenv').config();
const { ethers } = require("ethers");
const { provider } = require("./provider");

const abi = [
  "function balanceOf(address) view returns (uint256)"
];

async function getTokenBalance(tokenAddress, walletAddress) {
  const contract = new ethers.Contract(tokenAddress, abi, provider);

  const balance = await contract.balanceOf(walletAddress);

  return balance.toString();
}

async function getMarketData() {
  const symbols = `["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","ADAUSDT","XRPUSDT","DOTUSDT","LINKUSDT"]`;
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`
  );

  if (!res.ok) {
    throw new Error("Binance API error");
  }

  const data = await res.json();

  const result = {};

  data.forEach(item => {
    const symbol = item.symbol.replace('USDT', '').toLowerCase();
    result[symbol] = {
      priceUSD: Number(item.lastPrice),
      change24h: Number(item.priceChangePercent)
    };
  });

  // Add stablecoins
  result.usdt = { priceUSD: 1, change24h: 0 };
  result.usdc = { priceUSD: 1, change24h: 0 };

  return result;
}

module.exports = {
  getTokenBalance, getMarketData
};