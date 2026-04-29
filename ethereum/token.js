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
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,solana&vs_currencies=usd&include_24hr_change=true",
    {
      headers: {
        "x-cg-demo-api-key": process.env.COINGECKO_API_KEY,
      },
    }
  );

  const data = await res.json();

  return {
    ethereum: {
      priceUSD: data.ethereum.usd,
      change24h: data.ethereum.usd_24h_change
    },
    bitcoin: {
      priceUSD: data.bitcoin.usd,
      change24h: data.bitcoin.usd_24h_change
    },
    solana: {
      priceUSD: data.solana.usd,
      change24h: data.solana.usd_24h_change
    }
  };
}

module.exports = {
  getTokenBalance, getMarketData
};