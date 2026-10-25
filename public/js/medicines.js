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

  // Default the store-type selector to the first store's type
  const typeEl = document.getElementById('medType');
  if (typeEl) typeEl.value = myStores[0].type || 'homeo';

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
  const typeEl = document.getElementById('medType');
  const medType = (typeEl && typeEl.value) || '';

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
      storeType: medType || store.type || 'homeo',
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
 * Toggle the inline stock-add form for a medicine (owner only).
 * The form holds a quantity input and an optional stock photo URL.
 */
function increaseStock(idx) {
  const m = medicines[idx];
  if (!m) return;

  if (!isMedOwner(m)) {
    alert('Only the store owner can update stock.');
    return;
  }

  const form = document.getElementById('stockForm_' + idx);
  if (form) form.classList.toggle('hidden');
}

/**
 * Hide the inline stock-add form for a medicine
 */
function cancelStockForm(idx) {
  const form = document.getElementById('stockForm_' + idx);
  if (form) form.classList.add('hidden');
}

/**
 * Save the inline stock-add form: adds quantity to stock and,
 * if a photo URL was given, sets it as the medicine photo and
 * appends it to the stockPhotos array (owner only).
 */
async function saveStockForm(idx) {
  const m = medicines[idx];
  if (!m) return;

  if (!isMedOwner(m)) {
    alert('Only the store owner can update stock.');
    return;
  }

  const qtyEl = document.getElementById('stockQty_' + idx);
  const photoEl = document.getElementById('stockPhoto_' + idx);
  const qty = qtyEl ? parseInt(qtyEl.value, 10) : NaN;
  if (isNaN(qty) || qty <= 0) {
    alert('Please enter a valid quantity.');
    return;
  }
  const photoUrl = photoEl ? photoEl.value.trim() : '';

  const update = { stock: (parseInt(m.stock, 10) || 0) + qty };
  if (photoUrl) {
    update.photo = photoUrl;
    const existing = Array.isArray(m.stockPhotos) ? m.stockPhotos : [];
    update.stockPhotos = existing.concat([photoUrl]);
  }

  try {
    await fsUpdate(COLLECTIONS.MEDICINES, m._id, update);
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
    html += '<div id="stockForm_' + idx + '" class="hidden" style="margin-bottom:10px;">';
    html += '<input type="number" id="stockQty_' + idx + '" placeholder="Add quantity (current: ' + escH(m.stock) + ')" min="1" style="width:170px;display:inline-block;"> ';
    html += '<input type="text" id="stockPhoto_' + idx + '" placeholder="Stock photo URL (optional)" style="width:230px;display:inline-block;"> ';
    html += '<button class="small" onclick="saveStockForm(' + idx + ')">Save</button> ';
    html += '<button class="small secondary" onclick="cancelStockForm(' + idx + ')">Cancel</button>';
    html += '</div>';
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

/**
 * Bulk Add — dynamic rows for adding several medicines at once,
 * each with an optional photo (URL or file picker).
 * The medMgmtCard is already owner-gated (applyRoleUI), and every
 * saved medicine uses the owner's own store.
 */
let bulkRowCount = 0;

/**
 * Category <option> HTML for a store type
 */
function bulkCategoryOptions(storeType) {
  const cats = CATEGORIES[storeType] || CATEGORIES.homeo;
  return cats.map(c => '<option value="' + escH(c) + '">' + escH(c) + '</option>').join('');
}

/**
 * Add one bulk-add row to the form
 */
function addBulkRow() {
  const container = document.getElementById('bulkRows');
  if (!container) return;
  const myStores = stores.filter(isStoreOwner);
  const storeType = (myStores[0] && myStores[0].type) || 'homeo';
  const idx = bulkRowCount++;
  const row = document.createElement('div');
  row.className = 'bulk-row';
  row.id = 'bulkRow_' + idx;
  row.innerHTML =
    '<input type="text" id="bulkName_' + idx + '" placeholder="Medicine Name"> ' +
    '<input type="number" id="bulkPrice_' + idx + '" placeholder="Price (Rs)" min="0"> ' +
    '<input type="number" id="bulkStock_' + idx + '" placeholder="Stock" min="0"> ' +
    '<input type="text" id="bulkCompany_' + idx + '" placeholder="Company"> ' +
    '<select id="bulkCat_' + idx + '">' + bulkCategoryOptions(storeType) + '</select> ' +
    '<input type="text" id="bulkPhoto_' + idx + '" placeholder="Photo URL (optional)"> ' +
    '<input type="file" id="bulkFile_' + idx + '" accept="image/*"> ' +
    '<button class="small danger" onclick="removeBulkRow(' + idx + ')">Remove</button>';
  container.appendChild(row);
}

/**
 * Remove one bulk-add row
 */
function removeBulkRow(idx) {
  const row = document.getElementById('bulkRow_' + idx);
  if (row) row.remove();
}

/**
 * Convert a picked photo file to a data URL.
 * Files over 700KB are rejected with an alert (Firestore doc size limit).
 */
async function bulkFileToDataUrl(file) {
  if (!file) return '';
  if (file.size > 700 * 1024) {
    alert('Photo "' + file.name + '" is over 700KB and was skipped. Use a smaller image or a photo URL.');
    return '';
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || '');
    reader.onerror = () => reject(new Error('Could not read photo.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate all bulk rows, then save each medicine to the owner's store
 */
async function saveBulkMedicines() {
  const container = document.getElementById('bulkRows');
  if (!container) return;

  const myStores = stores.filter(isStoreOwner);
  if (myStores.length === 0) {
    alert('Create a store first (one doctor = one store).');
    return;
  }
  const store = myStores[0];
  const user = getCurrentUser();

  const rows = container.querySelectorAll('.bulk-row');
  if (rows.length === 0) {
    alert('Add at least one row first.');
    return;
  }

  // Validate every row before saving anything
  const entries = [];
  for (const row of rows) {
    const idx = row.id.replace('bulkRow_', '');
    const nameEl = document.getElementById('bulkName_' + idx);
    const priceEl = document.getElementById('bulkPrice_' + idx);
    const stockEl = document.getElementById('bulkStock_' + idx);
    const companyEl = document.getElementById('bulkCompany_' + idx);
    const catEl = document.getElementById('bulkCat_' + idx);
    const photoEl = document.getElementById('bulkPhoto_' + idx);
    const fileEl = document.getElementById('bulkFile_' + idx);
    const name = (nameEl && nameEl.value || '').trim();
    const price = (priceEl && parseFloat(priceEl.value)) || 0;
    const stock = (stockEl && parseInt(stockEl.value, 10)) || 0;
    const company = (companyEl && companyEl.value || '').trim();
    const cat = (catEl && catEl.value) || '';
    const photoUrl = (photoEl && photoEl.value || '').trim();
    const file = (fileEl && fileEl.files && fileEl.files[0]) || null;
    if (!name) {
      alert('Medicine name is required in every row.');
      return;
    }
    if (price <= 0) {
      alert('Please enter a valid price (over 0) in every row.');
      return;
    }
    entries.push({ name, price, stock, company, cat, photoUrl, file });
  }

  try {
    for (const e of entries) {
      let photo = e.photoUrl;
      if (e.file) {
        const dataUrl = await bulkFileToDataUrl(e.file);
        if (dataUrl) photo = dataUrl;
      }
      await fsAdd(COLLECTIONS.MEDICINES, {
        name: e.name,
        price: e.price,
        stock: e.stock,
        company: e.company,
        cat: e.cat,
        storeId: String(store._id),
        storeName: store.name || '',
        storeType: store.type || 'homeo',
        photo: photo,
        ownerUid: user.uid || '',
        ownerEmail: user.email || '',
        createdAt: new Date().toISOString(),
      });
    }
    container.innerHTML = '';
    bulkRowCount = 0;
    addBulkRow();
    await loadMedicines();
    renderMedicines();
  } catch (err) {
    alert('Bulk save failed: ' + err.message);
  }
}
