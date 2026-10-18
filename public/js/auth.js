// Medinest - Authentication Module

/**
 * Login with email/password via auth proxy
 */
async function login(email, password) {
  const res = await fetch(AUTH_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signin', email, password }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = typeof data.error === 'string' ? data.error
      : (data.error && data.error.message) || 'Login failed';
    throw new Error(msg);
  }

  // Store session
  localStorage.setItem('medinest_idToken', data.idToken);
  localStorage.setItem('medinest_user', JSON.stringify({
    uid: data.localId,
    email: data.email,
    name: data.displayName || data.email,
  }));

  return data;
}

/**
 * Sign up a new account
 */
async function signup(email, password, accountType, extra = {}) {
  const res = await fetch(AUTH_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signup', email, password }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = typeof data.error === 'string' ? data.error
      : (data.error && data.error.message) || 'Signup failed';
    throw new Error(msg);
  }

  // Store session
  localStorage.setItem('medinest_idToken', data.idToken);
  const user = {
    uid: data.localId,
    email: data.email,
    name: extra.name || data.email,
    accountType: accountType, // 'customer', 'homeo', 'allo'
  };
  localStorage.setItem('medinest_user', JSON.stringify(user));

  // If doctor, we may need to create their store (handled by caller)
  return { ...data, user };
}

/**
 * Logout - clear session
 */
function logout() {
  localStorage.removeItem('medinest_idToken');
  localStorage.removeItem('medinest_user');
  window.location.reload();
}

/**
 * Check if current user is a doctor
 */
function isDoctor() {
  const user = getCurrentUser();
  return user && (user.accountType === 'homeo' || user.accountType === 'allo');
}

/**
 * Check if current user owns a store
 */
function isStoreOwner(store) {
  const user = getCurrentUser();
  if (!user || !store) return false;
  return (
    (user.uid && store.ownerUid && String(store.ownerUid) === String(user.uid)) ||
    (user.email && store.ownerEmail && String(store.ownerEmail).toLowerCase() === String(user.email).toLowerCase())
  );
}

/**
 * Check if current user owns a medicine
 */
function isMedOwner(medicine) {
  const user = getCurrentUser();
  if (!user || !medicine) return false;
  return (
    (user.uid && medicine.ownerUid && String(medicine.ownerUid) === String(user.uid)) ||
    (user.email && medicine.ownerEmail && String(medicine.ownerEmail).toLowerCase() === String(user.email).toLowerCase())
  );
}
