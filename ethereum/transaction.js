const { ethers } = require('ethers');
const { getWallet } = require('./wallet');
const { provider } = require('./provider');

async function sendTx(wallet, to, amount) {
  const tx = await wallet.sendTransaction({
    to,
    value: ethers.parseEther(amount)
  });

  // Wait for 1 confirmation
  const receipt = await tx.wait(1);

  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: ethers.formatEther(tx.value),
    blockNumber: receipt?.blockNumber,
    transactionIndex: receipt?.transactionIndex,
    gasUsed: receipt?.gasUsed?.toString(),
    status: receipt?.status === 1 ? 'success' : 'failed'
  };
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
  sendTx,
  getTransactionStatus,
  getGasPrice
};