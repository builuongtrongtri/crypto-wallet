const crypto = require('crypto');

async function encryptMnemonic(mnemonic, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 32);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(mnemonic, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encryptedMnemonic: encrypted,
    iv: iv.toString("hex"),
    salt,
    authTag
  }
}

function decryptMnemonic(vault, password) {
  const { encryptedMnemonic, iv, salt, authTag } = vault;

  // derive key giống lúc encrypt
  const key = crypto.scryptSync(password, salt, 32);

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex")
  );

  // set authTag
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(encryptedMnemonic, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

module.exports = { encryptMnemonic, decryptMnemonic };
