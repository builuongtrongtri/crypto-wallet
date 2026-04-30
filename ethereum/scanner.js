require('dotenv').config();
const axios = require('axios');

const url = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;


async function getTransactions(address) {
  const baseBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_getAssetTransfers"
  };

  const [inRes, outRes] = await Promise.all([
    axios.post(url, {
      ...baseBody,
      params: [{
        fromBlock: "0x0",
        toAddress: address,
        category: ["external"],
        withMetadata: true
      }]
    }),
    axios.post(url, {
      ...baseBody,
      params: [{
        fromBlock: "0x0",
        fromAddress: address,
        category: ["external"],
        withMetadata: true
      }]
    })
  ]);

  const inTxs = inRes.data.result?.transfers || [];
  const outTxs = outRes.data.result?.transfers || [];

  const allTxs = [...inTxs, ...outTxs];

  return allTxs
    .sort((a, b) => {
      const t1 = new Date(a.metadata?.blockTimestamp || 0).getTime();
      const t2 = new Date(b.metadata?.blockTimestamp || 0).getTime();
      return t2 - t1;
    });
}

async function getGasFeeTransaction(txHash) {
  const res = await axios.post(url, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getTransactionReceipt",
    params: [txHash]
  });

  return res.data.result;
}

module.exports = {
    getTransactions,
    getGasFeeTransaction
};