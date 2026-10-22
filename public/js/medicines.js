// Medinest - Medicine Management Module

let medicines = [];

/**
 * Load all medicines from Firestore
 */
async function loadMedicines() {
  medicines = await fsGet(COLLECTIONS.MEDICINES);
  medicines.sort(byCreated);
  return medicines;
}

/**
 * Populate category dropdown based on selected store type
 */
function populateCategories(storeType) {
  const catEl = document.getElementById('medCat');
  if (!catEl) return;
  const cats = CATEGORIES[storeType] || CATEGORIES.homeo;
  catEl.innerHTML = cats.map(c => '<option value="' + escH(c) + '">' + escH(c) + '</option>').join('');
}

/**
 * Populate store dropdown with ONLY the user's own stores (security)
 */
function renderMedStoreDropdown() {
  const sel = document.getElementById('medStore');
  if (!sel) return;

  const myStores = stores.filter(isStoreOwner);

  if (myStores.length === 0) {
    sel.innerHTML = '<option value="">Create a store first (one doctor = one store)</option>';
    sel.disabled = true;
    const addBtn = document.getElementById('addMedBtn');
    if (addBtn) addBtn.disabled = true;
    return;
  }

  sel.disabled = false;
  const addBtn = document.getElementById('addMedBtn');
  if (addBtn) addBtn.disabled = false;

  sel.innerHTML = myStores.map(s =>
    '<option value="' + escH(s._id) + '">' + escH(s.name) + '</option>'
  ).join('');

  // Update categories based on first store's type
  populateCategories(myStores[0].type || 'homeo');
}

/**
 * Add a new medicine
 */
async function addMedicine() {
  const name = document.getElementById('medName').value.trim();
  const price = parseFloat(document.getElementById('medPrice').value) || 0;
  const stock = parseInt(document.getElementById('medStock').value, 10) || 0;
  const company = document.getElementById('medCompany').value.trim();
  const cat = document.getElementById('medCat').value;
  const storeId = document.getElementById('medStore').value;
  const photo = document.getElementById('medPhoto').value.trim();

  if (!name) {
    alert('Medicine name is required.');
    return;
  }
  if (price <= 0) {
    alert('Please enter a valid price.');
    return;
  }
  if (!storeId) {
    alert('Please select your store.');
    return;
  }

  // SECURITY: verify the selected store belongs to the user
  const store = stores.find(s => String(s._id) === String(storeId));
  if (!store || !isStoreOwner(store)) {
    alert('You can only add medicines to your own store.');
    return;
  }

  const user = getCurrentUser();
  try {
    await fsAdd(COLLECTIONS.MEDICINES, {
      name: name,
      price: price,
      stock: stock,
      company: company,
      cat: cat,
      storeId: String(storeId),
      storeName: store.name || '',
      storeType: store.type || 'homeo',
      photo: photo,
      ownerUid: user.uid || '',
      ownerEmail: user.email || '',
      createdAt: new Date().toISOString(),
    });

    // Clear form
    document.getElementById('medName').value = '';
    document.getElementById('medPrice').value = '';
    document.getElementById('medStock').value = '';
    document.getElementById('medCompany').value = '';
    document.getElementById('medPhoto').value = '';

    await loadMedicines();
    renderMedicines();
  } catch (e) {
    alert('Failed to add medicine: ' + e.message);
  }
}

/**
 * Delete a medicine (owner only)
 */
async function deleteMedicine(idx) {
  const m = medicines[idx];
  if (!m) return;

  if (!isMedOwner(m)) {
    alert('Only the store owner can delete this medicine.');
    return;
  }

  if (!confirm('Delete "' + m.name + '"?')) return;

  try {
    await fsDelete(COLLECTIONS.MEDICINES, m._id);
    await loadMedicines();
    renderMedicines();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

/**
 * Increase stock (owner only)
 */
async function increaseStock(idx) {
  const m = medicines[idx];
  if (!m) return;

  if (!isMedOwner(m)) {
    alert('Only the store owner can update stock.');
    return;
  }

  const qtyStr = prompt('Add how many to stock? (Current: ' + m.stock + ')', '10');
  if (qtyStr === null) return;
  const qty = parseInt(qtyStr, 10);
  if (isNaN(qty) || qty <= 0) {
    alert('Please enter a valid quantity.');
    return;
  }

  try {
    await fsUpdate(COLLECTIONS.MEDICINES, m._id, { stock: (parseInt(m.stock, 10) || 0) + qty });
    await loadMedicines();
    renderMedicines();
  } catch (e) {
    alert('Stock update failed: ' + e.message);
  }
}

/**
 * Render the medicine management list
 * Shows ONLY the current user's medicines (owner view)
 */
function renderMedicines() {
  const listEl = document.getElementById('medList');
  if (!listEl) return;

  const myMeds = medicines.filter(isMedOwner);

  // Count low stock for owner
  const lowCount = myMeds.filter(m => (parseInt(m.stock, 10) || 0) < LOW_STOCK_THRESHOLD).length;

  if (myMeds.length === 0) {
    listEl.innerHTML = '<p>No medicines yet. Add one below!</p>';
    return;
  }

  listEl.innerHTML = myMeds.map(m => {
    const idx = medicines.indexOf(m);
    const lowStock = (parseInt(m.stock, 10) || 0) < LOW_STOCK_THRESHOLD;

    let html = '<div class="med-item' + (lowStock ? ' low-stock' : '') + '">';
    if (m.photo) html += '<img src="' + escH(m.photo) + '" alt="">';
    html += '<div class="med-info">';
    html += '<strong>' + escH(m.name) + '</strong>';
    html += '<span class="meta">Rs ' + escH(m.price) + ' | Stock: ' + escH(m.stock);
    if (m.company) html += ' | ' + escH(m.company);
    html += ' | ' + escH(m.cat || '') + ' | ' + escH(m.storeName || '') + '</span>';
    if (lowStock) {
      html += '<br><span class="low-stock-badge">🔴 Low stock! Only ' + escH(m.stock) + ' left</span>';
    }
    html += '</div>';
    html += '<div class="med-actions">';
    html += '<button class="small" onclick="increaseStock(' + idx + ')">+ Stock</button>';
    html += '<button class="small danger" onclick="deleteMedicine(' + idx + ')">Delete</button>';
    html += '</div></div>';
    return html;
  }).join('');
}

/**
 * Order a medicine (for visitors/customers)
 * Includes stock validation
 */
async function orderMedicine(idx) {
  const m = medicines[idx];
  if (!m) return;

  // Owner cannot order their own medicine
  if (isMedOwner(m)) {
    alert('This is your own medicine.');
    return;
  }

  const qtyStr = prompt('How many "' + m.name + '"? (Available: ' + m.stock + ')', '1');
  if (qtyStr === null) return;
  const qty = parseInt(qtyStr, 10);
  if (isNaN(qty) || qty <= 0) {
    alert('Please enter a valid quantity.');
    return;
  }

  // STOCK VALIDATION
  const available = parseInt(m.stock, 10) || 0;
  if (qty > available) {
    alert('Itna stock available nahi hai! Available: ' + available);
    return;
  }

  const user = getCurrentUser();
  const store = stores.find(s => String(s._id) === String(m.storeId));

  const sellerUid = (store && store.ownerUid) || m.ownerUid || '';
  const buyerUid = user.uid || '';

  try {
    // Create the order
    await fsAdd(COLLECTIONS.ORDERS, {
      medicine: m.name,
      medId: String(m._id || ''),
      qty: qty,
      price: parseFloat(m.price) || 0,
      total: (parseFloat(m.price) || 0) * qty,
      storeId: String(m.storeId || ''),
      storeName: m.storeName || '',
      storeOwnerUid: sellerUid,
      storeOwnerEmail: (store && store.ownerEmail) || m.ownerEmail || '',
      buyerUid: buyerUid,
      buyerEmail: user.email || '',
      parties: [String(buyerUid), String(sellerUid)],
      by: user.name || user.email || 'Customer',
      status: 'Pending',
      createdAt: new Date().toISOString(),
    });

    // Decrement stock
    await fsUpdate(COLLECTIONS.MEDICINES, m._id, { stock: available - qty });

    await loadMedicines();
    renderMedicines();
    if (currentStoreIdx >= 0) {
      const s = stores[currentStoreIdx];
      if (s) renderStoreMedicines(s._id);
    }

    alert('Order placed successfully!');
  } catch (e) {
    alert('Order failed: ' + e.message);
  }
}
