const express = require('express');
const router = express.Router();
const { createWallet, getEthBalance } = require('../ethereum/wallet');
const { broadcastTransaction } = require('../ethereum/transaction');
const { provider } = require('../ethereum/provider');
const { ethers } = require('ethers');
const { encryptMnemonic, decryptMnemonic } = require('../core/crypto');
const crypto = require('crypto');
const { getMarketData } = require('../ethereum/token');
const { getTransactions, getGasFeeTransaction } = require('../ethereum/scanner');

// ── TOKENS ──────────────────────────────────────────────
router.get('/tokens/market', async (req, res) => {
  try {
    const data = await getMarketData();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── WALLET ──────────────────────────────────────────────
router.post("/wallet/create", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Password required" });
    }

    const { address, mnemonic } = createWallet();

    const { encryptedMnemonic, iv, salt, authTag } = await encryptMnemonic(mnemonic, password);

    res.json({
      address,
      mnemonic,
      vault: {
        encryptedMnemonic,
        iv: iv.toString("hex"),
        salt,
        authTag
      }
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/wallet/unlock', async (req, res) => {
  try {
    const { password, vault } = req.body;

    if (!password || !vault) {
      return res.status(400).json({ error: "Password and vault required" });
    }
    
    const mnemonic = await decryptMnemonic(vault, password);

    res.json({ mnemonic });

  } catch (e) {
    return res.status(401).json({
      error: "Wrong password or invalid vault"
    });
  }
});

// Import from mnemonic phrase
router.post('/wallet/import/mnemonic', async (req, res) => {
  try {
    const { mnemonic, password } = req.body;
    if (!mnemonic) return res.status(400).json({ error: 'Mnemonic required' });
    
    // Use ethers.js to create wallet from mnemonic
    const wallet = ethers.Wallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/0" // Standard Ethereum derivation path
    );

    const address = wallet.address;
    const key = crypto.scryptSync(password, "salt", 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(mnemonic, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Encrypt private key as well
    const cipherPrivate = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encryptedPrivateKey = cipherPrivate.update(wallet.privateKey, "utf8", "hex");
    encryptedPrivateKey += cipherPrivate.final("hex");

    await Wallet.create({
      address: address,
      encryptedMnemonic: encrypted,
      encryptedPrivateKey: encryptedPrivateKey,
      iv: iv.toString("hex")
    });

    res.json({ address: address });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Import from raw private key
router.post('/wallet/import', async (req, res) => {
  try {
    const { privateKey, password } = req.body;
    if (!privateKey) return res.status(400).json({ error: 'Private key required' });
    if (!password) return res.status(400).json({ error: 'Password required' });
    
    // Use ethers.js to get wallet from private key
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address;

    const key = crypto.scryptSync(password, "salt", 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(privateKey, "utf8", "hex");
    encrypted += cipher.final("hex");

    await Wallet.create({
      address: address,
      encryptedPrivateKey: encrypted,
      iv: iv.toString("hex")
    });

    res.json({ address: address });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Reveal mnemonic (requires password)
router.post('/wallet/mnemonic', async (req, res) => {
  try {
    const { address, password } = req.body;
    if (!address || !password) return res.status(400).json({ error: 'Address and password required' });
    
    const walletDoc = await Wallet.findOne({ address });
    if (!walletDoc || !walletDoc.encryptedMnemonic) {
      return res.status(400).json({ error: 'Wallet not found or mnemonic not available' });
    }

    const key = crypto.scryptSync(password, "salt", 32);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(walletDoc.iv, "hex"));
    let mnemonic = decipher.update(walletDoc.encryptedMnemonic, "hex", "utf8");
    mnemonic += decipher.final("utf8");

    res.json({ mnemonic });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/wallet/export', async (req, res) => {
  try {
    const { address, password } = req.body;
    if (!address || !password) return res.status(400).json({ error: 'Address and password required' });
    
    const walletDoc = await Wallet.findOne({ address });
    if (!walletDoc) return res.status(404).json({ error: 'Wallet not found' });

    const key = crypto.scryptSync(password, "salt", 32);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(walletDoc.iv, "hex"));
    let privateKey = decipher.update(walletDoc.encryptedPrivateKey, "hex", "utf8");
    privateKey += decipher.final("utf8");

    res.json({ 
      address: address,
      privateKey: privateKey,
      ...(walletDoc.encryptedMnemonic && {
        mnemonic: (() => {
          const decipher2 = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(walletDoc.iv, "hex"));
          let m = decipher2.update(walletDoc.encryptedMnemonic, "hex", "utf8");
          return m + decipher2.final("utf8");
        })()
      })
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// router.get('/wallets', async (req, res) => {
//   try {
//     const wallets = await Wallet.find({});
//     const result = await Promise.all(wallets.map(async (w) => {
//       const balance = await provider.getEthBalance(w.address);
//       return {
//         address: w.address,
//         balance: ethers.formatEther(balance),
//         balanceWei: balance.toString()
//       };
//     }));
//     res.json(result);
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

router.get('/wallet/:address/eth-balance', async (req, res) => {
  try {
    const balance = await getEthBalance(req.params.address);
    res.json({ 
      address: req.params.address, 
      balance: balance
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


// ── TRANSACTIONS ────────────────────────────────────────
router.post('/transaction/gas-fee', async (req, res) => {
  try {
    const { from, to, amount } = req.body;

    const feeData = await provider.getFeeData();

    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice;

    if (!gasPrice) {
      throw new Error("Gas price not available");
    }

    const gasLimit = await provider.estimateGas({
      from,
      to,
      value: ethers.parseEther(String(amount))
    });

    const fee = gasLimit * gasPrice;

    res.json({
      fee: ethers.formatEther(fee),
      gasLimit: gasLimit.toString()
    });

  } catch (e) {
    console.error("GAS FEE ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/transaction/send', async (req, res) => {
  try {
    const { signedTx } = req.body;
    if (!signedTx) {
      return res.status(400).json({ error: 'Missing field: signedTx' });
    }

    // Send transaction via ethers.js
    const result = await broadcastTransaction(signedTx);
    res.json({ 
      result: result,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/transaction/history/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const transactions = await getTransactions(address);

    const txList = await Promise.all(
      transactions.map(async (tx) => {
        const receipt = await getGasFeeTransaction(tx.hash);
        const gasUsed = BigInt(receipt.gasUsed);
        const gasPrice = BigInt(receipt.effectiveGasPrice || receipt.gasPrice);
        const totalFee = gasUsed * gasPrice;

        return {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          amount: tx.value.toString(),
          type: tx.from.toLowerCase() === address.toLowerCase() ? "out" : "in",
          status: "success",
          timestamp: tx.metadata?.blockTimestamp
            ? new Date(tx.metadata.blockTimestamp).getTime()
            : Date.now(),
          gasFee: ethers.formatEther(totalFee)
        };
      }));
      
    res.json({ address: address, transactions: txList });
  } catch (e) {
    console.error("HISTORY ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/transactions/pending', async (req, res) => {
  try {
    res.json({ note: 'Use getTransactionReceipt with tx hash to check status on Sepolia' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── NETWORK INFO ────────────────────────────────────────
router.get('/network', async (req, res) => {
  try {
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const gasPrice = await provider.getGasPrice();
    
    res.json({
      chainId: network.chainId,
      name: network.name,
      blockNumber: blockNumber,
      gasPrice: ethers.formatUnits(gasPrice, 'gwei') + ' gwei'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;