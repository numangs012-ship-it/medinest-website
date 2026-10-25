// Medinest - Orders, Tracking & Ledger Module

let orders = [];
let ledger = [];

/**
 * Load the current user's orders from Firestore (rules-safe filtered query)
 */
async function loadOrders() {
  const user = getCurrentUser();
  const uid = user ? String(user.uid || '') : '';
  if (!uid) { orders = []; return orders; }
  orders = await fsQuery(COLLECTIONS.ORDERS, [{ field: 'parties', op: 'ARRAY_CONTAINS', value: uid }]);
  orders.sort(byCreated);
  return orders;
}

/**
 * Check if an order belongs to the current user
 * (either as buyer or as store owner)
 */
function isMyOrder(o) {
  const user = getCurrentUser();
  if (!user || !o) return false;
  const uid = String(user.uid || '');
  const email = String(user.email || '').toLowerCase();
  return (
    (uid && (String(o.buyerUid || '') === uid || String(o.storeOwnerUid || '') === uid)) ||
    (email && (String(o.buyerEmail || '').toLowerCase() === email || String(o.storeOwnerEmail || '').toLowerCase() === email))
  );
}

/**
 * Check if current user is the seller (store owner) for an order
 */
function isOrderSeller(o) {
  const user = getCurrentUser();
  if (!user || !o) return false;
  const uid = String(user.uid || '');
  const email = String(user.email || '').toLowerCase();
  return (
    (uid && String(o.storeOwnerUid || '') === uid) ||
    (email && String(o.storeOwnerEmail || '').toLowerCase() === email)
  );
}

/**
 * Render orders (isolated per user), split into two sections:
 * Doctor Orders (received on the user's own store) and
 * My Customer Orders (placed by the user as a buyer).
 */
function renderOrders() {
  const listEl = document.getElementById('orderList');
  if (!listEl) return;

  const myOrders = orders.filter(isMyOrder);

  if (myOrders.length === 0) {
    listEl.innerHTML = '<p>No orders yet.</p>';
    return;
  }

  const sellerOrders = myOrders.filter(isOrderSeller);
  const buyerOrders = myOrders.filter(o => !isOrderSeller(o));

  const orderHtml = o => {
    return '<div class="order-item">' +
      '<strong>' + escH(o.medicine || '') + '</strong> × ' + escH(o.qty || '') +
      ' <span class="status ' + escH(o.status || 'Pending') + '">' + escH(o.status || 'Pending') + '</span><br>' +
      '<span class="meta" style="font-size:0.85rem;color:#666;">' +
      'Total: Rs ' + escH(o.total || '') +
      ' | Store: ' + escH(o.storeName || '') +
      ' | By: ' + escH(o.by || '') +
      '</span></div>';
  };

  let html = '';
  if (sellerOrders.length > 0) {
    html += '<h4>📥 Doctor Orders</h4>';
    html += sellerOrders.map(orderHtml).join('');
  }
  if (buyerOrders.length > 0) {
    html += '<h4>🛍️ My Customer Orders</h4>';
    html += buyerOrders.map(orderHtml).join('');
  }
  listEl.innerHTML = html;
}

/**
 * Render tracking list
 * Owners see status dropdown + update button; others see read-only status
 */
function renderTracking() {
  const listEl = document.getElementById('trackingList');
  if (!listEl) return;

  const myOrders = orders.filter(isMyOrder);

  if (myOrders.length === 0) {
    listEl.innerHTML = '<p>No orders to track.</p>';
    return;
  }

  listEl.innerHTML = myOrders.map(o => {
    const isSeller = isOrderSeller(o);
    let html = '<div class="order-item">' +
      '<strong>' + escH(o.medicine || '') + '</strong> × ' + escH(o.qty || '') + '<br>' +
      '<span style="font-size:0.85rem;color:#666;">Store: ' + escH(o.storeName || '') +
      ' | Ordered: ' + escH((o.createdAt || '').substring(0, 10)) + '</span><br>';

    if (isSeller) {
      // Owner can update status
      html += '<select id="status_' + escH(o._id) + '" style="width:auto;display:inline-block;margin-top:8px;">' +
        ORDER_STATUSES.map(s =>
          '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>'
        ).join('') + '</select> ';
      html += '<button class="small" style="width:auto;display:inline-block;" onclick="updateOrderStatus(\'' + escH(o._id) + '\')">Update</button>';
    } else {
      // Customer sees read-only status
      html += '<span class="status ' + escH(o.status || 'Pending') + '" style="margin-top:8px;display:inline-block;">' + escH(o.status || 'Pending') + '</span>';
    }

    html += '</div>';
    return html;
  }).join('');
}

/**
 * Update order status (seller only)
 */
async function updateOrderStatus(orderId) {
  const o = orders.find(x => String(x._id) === String(orderId));
  if (!o) return;

  if (!isOrderSeller(o)) {
    alert('Only the store owner can update order status.');
    return;
  }

  const sel = document.getElementById('status_' + orderId);
  const newStatus = sel ? sel.value : 'Pending';

  try {
    await fsUpdate(COLLECTIONS.ORDERS, orderId, { status: newStatus });
    await loadOrders();
    renderOrders();
    renderTracking();
  } catch (e) {
    alert('Status update failed: ' + e.message);
  }
}

/**
 * Load the current user's ledger from Firestore (rules-safe filtered query)
 */
async function loadLedger() {
  const user = getCurrentUser();
  const uid = user ? String(user.uid || '') : '';
  if (!uid) { ledger = []; return ledger; }
  ledger = await fsQuery(COLLECTIONS.LEDGER, [{ field: 'ownerUid', op: 'EQUAL', value: uid }]);
  ledger.sort(byCreated);
  return ledger;
}

/**
 * Render ledger with totals
 */
function renderLedger() {
  const listEl = document.getElementById('ledgerList');
  const summaryEl = document.getElementById('ledgerSummary');
  if (!listEl) return;

  let pending = 0, received = 0;
  for (const t of ledger) {
    const amt = parseFloat(t.amt) || 0;
    if (t.type === 'received') received += amt;
    else pending += amt;
  }

  if (summaryEl) {
    summaryEl.innerHTML =
      '<p><strong>Pending:</strong> Rs ' + pending.toFixed(0) + '</p>' +
      '<p><strong>Received:</strong> Rs ' + received.toFixed(0) + '</p>' +
      '<p><strong>Balance:</strong> Rs ' + (received - pending).toFixed(0) + '</p>';
  }

  if (ledger.length === 0) {
    listEl.innerHTML = '<p>No transactions yet.</p>';
    return;
  }

  listEl.innerHTML = ledger.map(t =>
    '<div class="order-item">' +
    '<strong>' + escH(t.desc || '') + '</strong> - Rs ' + escH(t.amt || '') +
    ' <span class="status ' + (t.type === 'received' ? 'Delivered' : 'Pending') + '">' + escH(t.type || '') + '</span><br>' +
    '<span style="font-size:0.85rem;color:#666;">' + escH(t.date || '') + '</span></div>'
  ).join('');
}

/**
 * Add a ledger transaction
 */
async function addTransaction() {
  const desc = document.getElementById('ledDesc').value.trim();
  const amt = parseFloat(document.getElementById('ledAmt').value) || 0;
  const type = document.getElementById('ledType').value;

  if (!desc) {
    alert('Description is required.');
    return;
  }
  if (amt <= 0) {
    alert('Please enter a valid amount.');
    return;
  }

  const user = getCurrentUser();
  try {
    await fsAdd(COLLECTIONS.LEDGER, {
      desc: desc,
      amt: amt,
      type: type,
      date: new Date().toLocaleDateString(),
      ownerUid: user.uid || '',
      ownerEmail: user.email || '',
      createdAt: new Date().toISOString(),
    });
    document.getElementById('ledDesc').value = '';
    document.getElementById('ledAmt').value = '';
    await loadLedger();
    renderLedger();
  } catch (e) {
    alert('Failed to add transaction: ' + e.message);
  }
}

/**
 * Calculate delivery fee (customers only)
 */
function calculateDelivery() {
  const qty = parseFloat(document.getElementById('delQty').value) || 1;
  const weight = parseFloat(document.getElementById('delWeight').value) || 1;
  const distance = parseFloat(document.getElementById('delDistance').value) || 5;

  let fee = 100 + (weight * 20) + (distance * 10);
  if (qty > 10) fee *= 0.9; // 10% discount for bulk

  document.getElementById('delResult').innerHTML =
    '<div class="alert success">Delivery Fee: <strong>Rs ' + Math.round(fee) + '</strong></div>';
}
