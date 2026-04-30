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
  const res = await fetch(
    'https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT"]'
  );

  if (!res.ok) {
    throw new Error("Binance API error");
  }

  const data = await res.json();

  return data.reduce((acc, item) => {
    if (item.symbol === "BTCUSDT") {
      acc.bitcoin = {
        priceUSD: Number(item.lastPrice),
        change24h: Number(item.priceChangePercent)
      };
    }

    if (item.symbol === "ETHUSDT") {
      acc.ethereum = {
        priceUSD: Number(item.lastPrice),
        change24h: Number(item.priceChangePercent)
      };
    }

    if (item.symbol === "SOLUSDT") {
      acc.solana = {
        priceUSD: Number(item.lastPrice),
        change24h: Number(item.priceChangePercent)
      };
    }

    return acc;
  }, {});
}

module.exports = {
  getTokenBalance, getMarketData
};