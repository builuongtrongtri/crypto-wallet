const { ethers } = require('ethers');
const { provider } = require('./provider');

function createWallet() {
  const wallet = ethers.Wallet.createRandom();

  return {
    address: wallet.address,
    mnemonic: wallet.mnemonic.phrase
  };
}

function importWalletFromMnemonic(mnemonic, derivationPath = "m/44'/60'/0'/0/0") {
  const wallet = ethers.HDNodeWallet.fromPhrase(
    mnemonic, 
    null, 
    derivationPath
  );

  return {
    address: wallet.address
  };
}

// function getWallet(privateKey) {
//   return new ethers.Wallet(privateKey, provider);
// }

// function getWalletFromMnemonic(mnemonic, derivationPath = "m/44'/60'/0'/0/0") {
//   const hdNode = ethers.HDNodeWallet.fromMnemonic(
//     ethers.Mnemonic.fromPhrase(mnemonic),
//     derivationPath
//   );
//   return new ethers.Wallet(hdNode.privateKey, provider);
// }

async function getEthBalance(address) {
  const ethBalance = await provider.getBalance(address);
  return ethers.formatEther(ethBalance);
}

module.exports = {
  createWallet,
  getEthBalance,
  importWalletFromMnemonic
};