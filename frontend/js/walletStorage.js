const DB_NAME = "walletDB";
const STORE_NAME = "wallet";
const DB_VERSION = 1;

// mở DB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// SAVE WALLET
async function saveWallet(data) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const walletData = {
      id: "main-wallet",
      address: data.address,
      encryptedMnemonic: data.encryptedMnemonic,
      iv: data.iv,
      salt: data.salt,
      authTag: data.authTag,
      accountCount: data.accountCount || null,
      createdAt: Date.now()
    };

    const req = store.put(walletData);

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function hasWallet() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const req = store.get("main-wallet");

    req.onsuccess = () => {
      resolve(!!req.result);
    };

    req.onerror = () => reject(req.error);
  });
}

async function getWallet() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const req = store.get("main-wallet");

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateAccountCount(count) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const getReq = store.get("main-wallet");

    getReq.onsuccess = () => {
      const data = getReq.result;
      if (!data) return reject(new Error("Wallet not found"));
      
      data.accountCount = count;
      
      const putReq = store.put(data);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

window.saveWallet = saveWallet;
window.hasWallet = hasWallet;
window.getWallet = getWallet;
window.updateAccountCount = updateAccountCount;