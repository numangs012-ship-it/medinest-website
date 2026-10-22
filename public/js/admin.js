// Medinest - Admin Dashboard Module
// Visible only to admins (admins collection doc with ID = user's UID).
// Managed from the Firebase console — never created client-side.

let adminAccess = false;

/**
 * Check if the current user is an admin.
 * The admins rules allow list only for admins; a 403 means "not admin".
 */
async function checkAdminAccess() {
  adminAccess = false;
  const tabBtn = document.getElementById('dashboardTab');
  const section = document.getElementById('tab-dashboard');

  try {
    const admins = await fsGet(COLLECTIONS.ADMINS);
    const user = getCurrentUser();
    const uid = user ? String(user.uid || '') : '';
    // Admin only if their own UID has a doc in the admins collection
    adminAccess = !!uid && admins.some(a => String(a._id || '') === uid);
  } catch (e) {
    adminAccess = false;
  }

  if (tabBtn) tabBtn.style.display = adminAccess ? '' : 'none';
  if (section && !adminAccess) section.classList.add('hidden');

  return adminAccess;
}

/**
 * Render the admin dashboard: totals + orders by status.
 * Admin-only reads (rules enforce this).
 */
async function renderDashboard() {
  const el = document.getElementById('dashboardContent');
  if (!el) return;
  if (!adminAccess) {
    el.innerHTML = '<p>Access denied.</p>';
    return;
  }

  el.innerHTML = '<p>Loading dashboard...</p>';

  try {
    const [users, storesAll, ordersAll] = await Promise.all([
      fsGet(COLLECTIONS.USERS),
      fsGet(COLLECTIONS.STORES),
      fsGet(COLLECTIONS.ORDERS),
    ]);

    let revenue = 0;
    const byStatus = {};
    for (const o of ordersAll) {
      revenue += parseFloat(o.total) || 0;
      const st = o.status || 'Pending';
      byStatus[st] = (byStatus[st] || 0) + 1;
    }

    const statusRows = Object.keys(byStatus).length
      ? Object.keys(byStatus).map(st =>
          '<p><strong>' + escH(st) + ':</strong> ' + escH(byStatus[st]) + '</p>').join('')
      : '<p>No orders yet.</p>';

    el.innerHTML =
      '<div class="stat-grid">' +
        '<div class="stat-box"><h4>' + users.length + '</h4><p>Total Users</p></div>' +
        '<div class="stat-box"><h4>' + storesAll.length + '</h4><p>Total Stores</p></div>' +
        '<div class="stat-box"><h4>' + ordersAll.length + '</h4><p>Total Orders</p></div>' +
        '<div class="stat-box"><h4>Rs ' + Math.round(revenue) + '</h4><p>Total Revenue</p></div>' +
      '</div>' +
      '<hr style="margin:16px 0;">' +
      '<h4>Orders by Status</h4>' +
      statusRows;
  } catch (e) {
    el.innerHTML = '<p class="alert error">Dashboard failed: ' + escH(e.message) + '</p>';
  }
}
