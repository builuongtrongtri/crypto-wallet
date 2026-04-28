const crypto = require('crypto');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

function generatePrivateKey() {
  return crypto.randomBytes(32).toString('hex');
}

function getPublicKey(privateKeyHex) {
  const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
  return keyPair.getPublic('hex');
}

function publicKeyToAddress(publicKeyHex) {
  const hash = crypto.createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest();
  const ripemd = crypto.createHash('ripemd160').update(hash).digest('hex');
  return '0x' + ripemd;
}

function hashData(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = { generatePrivateKey, getPublicKey, publicKeyToAddress, hashData, sha256 };
