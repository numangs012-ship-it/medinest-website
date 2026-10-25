// Medinest - Main App Initialization

/**
 * Show error in a designated element
 */
function showError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

/**
 * Switch tabs
 */
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('#mainTabs .tab[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Show/hide sections
  const sections = ['stores', 'orders', 'tracking', 'ledger', 'reviews', 'delivery', 'dashboard'];
  sections.forEach(s => {
    const el = document.getElementById('tab-' + s);
    if (el) el.classList.toggle('hidden', s !== tabName);
  });

  // Refresh data for the active tab
  if (tabName === 'reviews') renderAllReviews();
  if (tabName === 'tracking') renderTracking();
  if (tabName === 'dashboard') renderDashboard();
}

/**
 * Show the main app view
 */
function showApp() {
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
}

/**
 * Show the auth view
 */
function showAuth() {
  document.getElementById('authView').classList.remove('hidden');
  document.getElementById('appView').classList.add('hidden');
}

/**
 * Apply role-based UI visibility (Step 4: role-gated UI pass)
 * - Manage Medicines card: only for store owners (doctors)
 * - Create Store card: only for doctor account types (customers cannot create stores)
 */
function applyRoleUI() {
  const medMgmtCard = document.getElementById('medMgmtCard');
  if (medMgmtCard) {
    medMgmtCard.style.display = userHasStore() ? '' : 'none';
  }
  const createStoreCard = document.getElementById('createStoreCard');
  if (createStoreCard) {
    createStoreCard.style.display = (isDoctor() && !userHasStore()) ? '' : 'none';
  }
}

/**
 * Load all data after login
 */
async function loadAllData() {
  try {
    await loadStores();
    await loadMedicines();
    await loadOrders();
    await loadLedger();
    applyRoleUI();
    renderStores();
    renderMedicines();
    renderMedStoreDropdown();
    const bulkContainer = document.getElementById('bulkRows');
    if (bulkContainer && bulkContainer.children.length === 0) addBulkRow();
    renderOrders();
    renderTracking();
    renderLedger();
    checkAdminAccess();
  } catch (e) {
    console.error('Failed to load data:', e);
    if (e.message && e.message.includes('Session expired')) {
      alert('Session expired. Please login again.');
      logout();
    }
  }
}

/**
 * Handle login
 */
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showError('loginError', 'Please enter email and password.');
    return;
  }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  showError('loginError', null);

  try {
    await login(email, password);
    showApp();
    await loadAllData();
  } catch (e) {
    showError('loginError', e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

/**
 * Handle signup
 */
async function handleSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const accountType = document.getElementById('accountType').value;

  if (!name || !email || !password) {
    showError('signupError', 'Please fill all fields.');
    return;
  }
  if (password.length < 6) {
    showError('signupError', 'Password must be at least 6 characters.');
    return;
  }

  const btn = document.getElementById('signupBtn');
  btn.disabled = true;
  btn.textContent = 'Creating account...';
  showError('signupError', null);

  try {
    const result = await signup(email, password, accountType, { name: name });

    // Write user profile doc (used by admin dashboard user count)
    try {
      await fsSet(COLLECTIONS.USERS, result.user.uid, {
        name: name,
        email: email,
        accountType: accountType,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to write user profile:', e);
    }

    // If doctor, create their store immediately (one doctor = one store)
    if (accountType === 'homeo' || accountType === 'allo') {
      const storeName = document.getElementById('signupStoreName').value.trim();
      if (!storeName) {
        showError('signupError', 'Store name is required for doctors.');
        btn.disabled = false;
        btn.textContent = 'Create Account';
        return;
      }
      await fsAdd(COLLECTIONS.STORES, {
        name: storeName,
        doctor: name,
        type: accountType,
        ownerUid: result.user.uid || '',
        ownerEmail: email,
        createdAt: new Date().toISOString(),
      });
    }

    // Show channel join overlay
    document.getElementById('channelOverlay').classList.remove('hidden');

    showApp();
    await loadAllData();
  } catch (e) {
    showError('signupError', e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

/**
 * Bind all event listeners
 */
function bindEvents() {
  // Auth
  document.getElementById('loginBtn').onclick = handleLogin;
  document.getElementById('signupBtn').onclick = handleSignup;

  document.getElementById('loginPassword').addEventListener('keypress', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('signupPassword').addEventListener('keypress', e => {
    if (e.key === 'Enter') handleSignup();
  });

  // Show/hide password
  document.getElementById('showLoginPw').onchange = function() {
    document.getElementById('loginPassword').type = this.checked ? 'text' : 'password';
  };
  document.getElementById('showSignupPw').onchange = function() {
    document.getElementById('signupPassword').type = this.checked ? 'text' : 'password';
  };

  // Auth view switching
  document.getElementById('showSignup').onclick = e => {
    e.preventDefault();
    document.getElementById('loginCard').classList.add('hidden');
    document.getElementById('signupCard').classList.remove('hidden');
  };
  document.getElementById('showLogin').onclick = e => {
    e.preventDefault();
    document.getElementById('signupCard').classList.add('hidden');
    document.getElementById('loginCard').classList.remove('hidden');
  };
  document.getElementById('showForgot').onclick = async e => {
    e.preventDefault();
    const email = prompt('Apna email likho, reset link bhej dunga:');
    if (!email) return;
    try {
      const res = await fetch(AUTH_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        alert('Reset link bhej diya! Email check karo.');
      } else {
        alert('Error: ' + (data.error && data.error.message ? data.error.message : data.error));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Doctor fields toggle
  document.getElementById('accountType').onchange = function() {
    const isDoc = this.value === 'homeo' || this.value === 'allo';
    document.getElementById('doctorFields').classList.toggle('hidden', !isDoc);
  };

  // Tabs
  document.querySelectorAll('#mainTabs .tab[data-tab]').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
  document.getElementById('logoutTab').onclick = logout;

  // Stores
  document.getElementById('createStoreBtn').onclick = createStore;
  document.getElementById('storeSearch').oninput = renderStores;
  document.getElementById('storeFilterAll').onclick = () => setStoreTypeFilter('all');
  document.getElementById('storeFilterHomeo').onclick = () => setStoreTypeFilter('homeo');
  document.getElementById('storeFilterAllo').onclick = () => setStoreTypeFilter('allo');
  document.getElementById('backToStoresBtn').onclick = backToStores;
  document.getElementById('delStoreBtn').onclick = deleteStore;
  document.getElementById('detailAddRevBtn').onclick = submitStoreReview;

  // Medicines
  document.getElementById('addMedBtn').onclick = addMedicine;
  document.getElementById('medStore').onchange = function() {
    const s = stores.find(x => String(x._id) === String(this.value));
    if (s) {
      const typeEl = document.getElementById('medType');
      if (typeEl) typeEl.value = s.type || 'homeo';
      populateCategories(s.type || 'homeo');
    }
  };
  document.getElementById('medType').onchange = function() {
    populateCategories(this.value);
  };

  // Bulk add
  document.getElementById('bulkAddRowBtn').onclick = addBulkRow;
  document.getElementById('bulkSaveBtn').onclick = saveBulkMedicines;

  // Ledger
  document.getElementById('addLedBtn').onclick = addTransaction;

  // Delivery
  document.getElementById('calcDelBtn').onclick = calculateDelivery;

  // Channel overlay
  document.getElementById('channelContinue').onclick = () => {
    document.getElementById('channelOverlay').classList.add('hidden');
  };
}

/**
 * Initialize the app
 */
function initApp() {
  bindEvents();

  // Check existing session
  if (isLoggedIn()) {
    showApp();
    loadAllData();
  } else {
    showAuth();
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
