const { ethers } = require('ethers');
const { getWallet } = require('./wallet');
const { provider } = require('./provider');

async function broadcastTransaction(signedTx) {
  const tx = await provider.broadcastTransaction(signedTx);
  return tx
}

async function getTransactionStatus(txHash) {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    return { status: 'pending' };
  }
  
  return {
    status: receipt.status === 1 ? 'success' : receipt.status === 0 ? 'failed' : 'pending',
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed?.toString(),
    confirmations: await provider.getBlockNumber() - receipt.blockNumber
  };
}

async function getGasPrice() {
  const feeData = await provider.getFeeData();
  return {
    gasPrice: ethers.formatUnits(feeData.gasPrice, 'gwei') + ' gwei',
    maxFeePerGas: ethers.formatUnits(feeData.maxFeePerGas, 'gwei') + ' gwei',
    maxPriorityFeePerGas: ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') + ' gwei'
  };
}

module.exports = {
  broadcastTransaction,
  getTransactionStatus,
  getGasPrice
};