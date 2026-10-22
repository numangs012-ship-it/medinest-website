// Medinest - Store Management Module

let stores = [];
let storeReviewsCache = [];
let storeReviewsLoaded = false;
let currentStoreIdx = -1;
let storeTypeFilter = 'all'; // 'all' | 'homeo' | 'allo'

/**
 * Load all stores from Firestore
 */
async function loadStores() {
  stores = await fsGet(COLLECTIONS.STORES);
  stores.sort(byCreated);
  await loadStoreReviewsCache();
  return stores;
}

/**
 * Load store reviews cache
 */
async function loadStoreReviewsCache(force = false) {
  if (storeReviewsLoaded && !force) return storeReviewsCache;
  try {
    storeReviewsCache = await fsGet(COLLECTIONS.STORE_REVIEWS);
    storeReviewsCache.sort(byCreated);
  } catch (e) {
    console.error('Failed to load store reviews:', e);
    storeReviewsCache = [];
  }
  storeReviewsLoaded = true;
  return storeReviewsCache;
}

/**
 * Get average rating for a store
 */
function storeAvgRating(storeId) {
  const list = storeReviewsCache.filter(r => String(r.storeId || '') === String(storeId || ''));
  if (list.length === 0) return { avg: 0, count: 0 };
  let sum = 0;
  for (const r of list) sum += parseFloat(r.stars) || 0;
  return { avg: sum / list.length, count: list.length };
}

/**
 * Get rating badge HTML for a store
 */
function storeRatingBadge(storeId) {
  const r = storeAvgRating(storeId);
  if (!r.count) return '';
  return ' <span class="badge rating" title="' + r.count + ' review(s)">★ ' + r.avg.toFixed(1) + ' (' + r.count + ')</span>';
}

/**
 * Check if current user already owns a store (one doctor = one store)
 */
function userHasStore() {
  return stores.some(isStoreOwner);
}

/**
 * Create a new store
 */
async function createStore() {
  const nameEl = document.getElementById('storeName');
  const doctorEl = document.getElementById('doctorName');
  const typeEl = document.getElementById('storeType');

  const name = nameEl.value.trim();
  const doctor = doctorEl.value.trim();
  const type = typeEl.value;

  if (!name || !doctor) {
    alert('Store name and doctor name are required.');
    return;
  }

  // One doctor = one store enforcement
  if (userHasStore()) {
    alert('You already have a store! One doctor can only have one store.');
    return;
  }

  const user = getCurrentUser();
  try {
    await fsAdd(COLLECTIONS.STORES, {
      name: name,
      doctor: doctor,
      type: type,
      ownerUid: user.uid || '',
      ownerEmail: user.email || '',
      createdAt: new Date().toISOString(),
    });
    nameEl.value = '';
    doctorEl.value = '';
    await loadStores();
    renderStores();
    renderMedStoreDropdown();
  } catch (e) {
    alert('Failed to create store: ' + e.message);
  }
}

/**
 * Delete a store (owner only) - also deletes its medicines
 */
async function deleteStore() {
  const s = stores[currentStoreIdx];
  if (!s || !isStoreOwner(s)) {
    alert('Only the store owner can delete this store.');
    return;
  }

  if (!confirm('Delete "' + (s.name || 'this store') + '" and ALL its medicines? This cannot be undone.')) {
    return;
  }

  try {
    // Delete all medicines belonging to this store
    const meds = await fsGet(COLLECTIONS.MEDICINES);
    for (const m of meds) {
      if (String(m.storeId || '') === String(s._id || '')) {
        await fsDelete(COLLECTIONS.MEDICINES, m._id);
      }
    }
    // Delete the store
    await fsDelete(COLLECTIONS.STORES, s._id);
    backToStores();
    await loadStores();
    renderStores();
    if (typeof renderMedicines === 'function') await renderMedicines();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

/**
 * Render the store list
 */
function renderStores() {
  const listEl = document.getElementById('storeList');
  if (!listEl) return;

  const query = (document.getElementById('storeSearch').value || '').toLowerCase().trim();

  let filtered = stores;
  if (storeTypeFilter !== 'all') {
    filtered = filtered.filter(s => (s.type || 'homeo') === storeTypeFilter);
  }
  if (query) {
    filtered = filtered.filter(s =>
      (s.name || '').toLowerCase().includes(query) ||
      (s.doctor || '').toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    listEl.innerHTML = query ? '<p>No stores found.</p>' : '<p>No stores yet. Create one above!</p>';
    return;
  }

  listEl.innerHTML = filtered.map(s => {
    const idx = stores.indexOf(s);
    const typeLabel = s.type === 'allo' ? 'Allopathic' : 'Homeopathic';
    const typeClass = s.type === 'allo' ? 'allo' : 'homeo';
    return '<div class="store-card" onclick="openStore(' + idx + ')" title="Click to open this store">' +
      '<h3>🏪 ' + escH(s.name) + storeRatingBadge(s._id) + '</h3>' +
      '<p class="doctor">Doctor: <strong>' + escH(s.doctor) + '</strong> ' +
      '<span class="badge ' + typeClass + '">' + typeLabel + '</span></p>' +
      '</div>';
  }).join('');

  // Show/hide create store card based on ownership
  const createCard = document.getElementById('createStoreCard');
  if (createCard) {
    createCard.style.display = userHasStore() ? 'none' : '';
  }
}

/**
 * Set the store type filter (Homeo / Allo / All)
 */
function setStoreTypeFilter(type) {
  storeTypeFilter = type;
  ['All', 'Homeo', 'Allo'].forEach(t => {
    const btn = document.getElementById('storeFilter' + t);
    if (btn) btn.style.opacity = t.toLowerCase() === type ? '1' : '0.5';
  });
  renderStores();
}

/**
 * Open a store detail view
 */
async function openStore(idx) {
  const s = stores[idx];
  if (!s) return;
  currentStoreIdx = idx;

  document.getElementById('storeListView').classList.add('hidden');
  document.getElementById('storeDetailView').classList.remove('hidden');

  // Fill store info
  document.getElementById('detailStoreName').textContent = '🏪 ' + (s.name || '');
  document.getElementById('detailStoreDoctor').textContent = 'Doctor: ' + (s.doctor || '');
  const typeLabel = s.type === 'allo' ? 'Allopathic' : 'Homeopathic';
  const typeClass = s.type === 'allo' ? 'allo' : 'homeo';
  document.getElementById('detailStoreType').innerHTML = '<span class="badge ' + typeClass + '">' + typeLabel + '</span>';

  // Show delete button only for owner
  const delBtn = document.getElementById('delStoreBtn');
  if (delBtn) delBtn.classList.toggle('hidden', !isStoreOwner(s));

  // Render medicines in this store
  renderStoreMedicines(s._id);

  // Render reviews
  await loadStoreReviewsCache();
  renderStoreReviews(s._id);

  window.scrollTo(0, 0);
}

/**
 * Go back to store list
 */
function backToStores() {
  currentStoreIdx = -1;
  document.getElementById('storeDetailView').classList.add('hidden');
  document.getElementById('storeListView').classList.remove('hidden');
  renderStores();
}

/**
 * Render medicines belonging to a specific store
 * Visitors see: name, price, stock qty, Order button
 * Owners see additionally: low-stock warnings
 */
function renderStoreMedicines(storeId) {
  const listEl = document.getElementById('detailMedList');
  if (!listEl) return;

  const meds = (typeof medicines !== 'undefined' ? medicines : []).filter(
    m => String(m.storeId || '') === String(storeId || '')
  );

  if (meds.length === 0) {
    listEl.innerHTML = '<p>No medicines in this store yet.</p>';
    return;
  }

  listEl.innerHTML = meds.map(m => {
    const globalIdx = (typeof medicines !== 'undefined' ? medicines : []).indexOf(m);
    const isOwner = isMedOwner(m);
    const lowStock = parseInt(m.stock, 10) < LOW_STOCK_THRESHOLD;

    let html = '<div class="med-item' + (isOwner && lowStock ? ' low-stock' : '') + '">';
    if (m.photo) html += '<img src="' + escH(m.photo) + '" alt="">';
    html += '<div class="med-info">';
    html += '<strong>' + escH(m.name) + '</strong>';
    html += '<span class="meta">Rs ' + escH(m.price) + ' | Stock: ' + escH(m.stock);
    if (m.company) html += ' | ' + escH(m.company);
    html += ' | ' + escH(m.cat || '') + '</span>';
    // Low stock warning ONLY for owner
    if (isOwner && lowStock) {
      html += '<br><span class="low-stock-badge">🔴 Low stock! Only ' + escH(m.stock) + ' left</span>';
    }
    html += '</div>';
    html += '<div class="med-actions">';
    // Order button HIDDEN for owner on own items, shown for visitors
    if (!isOwner) {
      html += '<button class="small secondary" onclick="orderMedicine(' + globalIdx + ')">Order</button>';
    }
    html += '</div></div>';
    return html;
  }).join('');
}

/**
 * Render reviews for a store
 */
function renderStoreReviews(storeId) {
  const r = storeAvgRating(storeId);

  const avgEl = document.getElementById('detailAvgRating');
  if (avgEl) {
    avgEl.textContent = r.count ? '★ ' + r.avg.toFixed(1) + ' (' + r.count + ' review' + (r.count > 1 ? 's' : '') + ')' : '';
  }

  const listEl = document.getElementById('detailReviewList');
  if (!listEl) return;

  const list = storeReviewsCache.filter(x => String(x.storeId || '') === String(storeId || ''));

  if (list.length === 0) {
    listEl.innerHTML = '<p>No reviews yet. Be the first to review!</p>';
    return;
  }

  listEl.innerHTML = list.map(x => {
    const stars = parseInt(x.stars, 10) || 0;
    let sHtml = '';
    for (let k = 0; k < 5; k++) sHtml += (k < stars ? '★' : '☆');
    return '<div class="order-item">' +
      '<strong>' + escH(x.by || 'Customer') + '</strong> ' +
      '<span style="color:#e65100;">' + sHtml + '</span><br>' +
      escH(x.text || '') + '</div>';
  }).join('');
}

/**
 * Submit a review for the current store
 */
async function submitStoreReview() {
  const s = stores[currentStoreIdx];
  if (!s) {
    alert('No store selected.');
    return;
  }

  const stars = parseInt(document.getElementById('detailRevStars').value, 10) || 5;
  const text = document.getElementById('detailRevText').value.trim();
  if (!text) {
    alert('Please write a review.');
    return;
  }

  const user = getCurrentUser();
  try {
    await fsAdd(COLLECTIONS.STORE_REVIEWS, {
      storeId: String(s._id || ''),
      storeName: s.name || '',
      stars: stars,
      text: text,
      by: (user && (user.name || user.email)) || 'Customer',
      createdAt: new Date().toISOString(),
    });
    document.getElementById('detailRevText').value = '';
    await loadStoreReviewsCache(true);
    renderStoreReviews(s._id);
    renderStores();
  } catch (e) {
    alert('Could not submit review: ' + e.message);
  }
}

/**
 * Render all reviews (Reviews tab)
 */
function renderAllReviews() {
  const listEl = document.getElementById('allReviewsList');
  if (!listEl) return;

  if (storeReviewsCache.length === 0) {
    listEl.innerHTML = '<p>No reviews yet.</p>';
    return;
  }

  listEl.innerHTML = storeReviewsCache.map(x => {
    const stars = parseInt(x.stars, 10) || 0;
    let sHtml = '';
    for (let k = 0; k < 5; k++) sHtml += (k < stars ? '★' : '☆');
    return '<div class="order-item">' +
      '<strong>' + escH(x.storeName || 'Store') + '</strong><br>' +
      '<strong>' + escH(x.by || 'Customer') + '</strong> ' +
      '<span style="color:#e65100;">' + sHtml + '</span><br>' +
      escH(x.text || '') + '</div>';
  }).join('');
}
