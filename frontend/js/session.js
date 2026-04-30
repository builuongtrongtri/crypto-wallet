const SESSION_KEY = "active_wallet";
const SESSION_TIME = 10 * 60 * 1000;

function saveSession(wallet) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    address: wallet.address,
    mnemonic: wallet.mnemonic.phrase,
    createdAt: Date.now()
  }));
}

function loadSession() {
  const data = localStorage.getItem(SESSION_KEY);
  if (!data) return null;

  const session = JSON.parse(data);
  const expired = Date.now() - session.createdAt > SESSION_TIME;
  if (expired) {
    clearSession();
    return null;
  }

  return session;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

window.saveSession = saveSession;
window.loadSession = loadSession;
window.clearSession = clearSession;