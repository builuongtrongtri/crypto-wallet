const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const { hashData } = require('./crypto');

function signTransaction(txData, privateKeyHex) {
  const hash = hashData(txData);
  const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
  const signature = keyPair.sign(hash);
  return {
    r: signature.r.toString('hex'),
    s: signature.s.toString('hex'),
    hash
  };
}

function verifySignature(txData, signature, publicKeyHex) {
  try {
    const hash = hashData(txData);
    const keyPair = ec.keyFromPublic(publicKeyHex, 'hex');
    return keyPair.verify(hash, { r: signature.r, s: signature.s });
  } catch (e) {
    return false;
  }
}

// Verify with known hash (for tamper detection)
function verifyWithHash(hash, signature, publicKeyHex) {
  try {
    const keyPair = ec.keyFromPublic(publicKeyHex, 'hex');
    return keyPair.verify(hash, { r: signature.r, s: signature.s });
  } catch (e) {
    return false;
  }
}

module.exports = { signTransaction, verifySignature, verifyWithHash };
