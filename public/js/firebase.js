// Medinest - Firebase Helpers (Firestore REST API)
// Uses ID token auth for all requests

/**
 * Get the stored Firebase ID token
 */
function getIdToken() {
  return localStorage.getItem('medinest_idToken') || '';
}

/**
 * Get the current user object
 */
function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('medinest_user') || 'null');
  } catch (e) {
    return null;
  }
}

/**
 * Check if user is logged in
 */
function isLoggedIn() {
  return !!getIdToken() && !!getCurrentUser();
}

/**
 * Convert Firestore document to plain object
 */
function docToObj(doc) {
  if (!doc || !doc.fields) return null;
  const obj = { _id: doc.name.split('/').pop() };
  for (const [key, val] of Object.entries(doc.fields)) {
    if (val.stringValue !== undefined) obj[key] = val.stringValue;
    else if (val.integerValue !== undefined) obj[key] = parseInt(val.integerValue, 10);
    else if (val.doubleValue !== undefined) obj[key] = parseFloat(val.doubleValue);
    else if (val.booleanValue !== undefined) obj[key] = val.booleanValue;
    else if (val.timestampValue !== undefined) obj[key] = val.timestampValue;
    else if (val.arrayValue !== undefined) obj[key] = (val.arrayValue.values || []).map(v => v.stringValue || '');
    else obj[key] = null;
  }
  return obj;
}

/**
 * Convert plain object to Firestore fields
 */
function objToFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === '_id') continue;
    if (val === null || val === undefined) continue;
    if (typeof val === 'string') fields[key] = { stringValue: val };
    else if (typeof val === 'number') {
      fields[key] = Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
    else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
    else if (Array.isArray(val)) {
      fields[key] = { arrayValue: { values: val.map(v => ({ stringValue: String(v) })) } };
    }
    else fields[key] = { stringValue: String(val) };
  }
  return fields;
}

/**
 * GET a single document by ID
 */
async function fsGetOne(collection, docId) {
  const token = getIdToken();
  if (!token) throw new Error('Not logged in');

  const res = await fetch(`${FIRESTORE_BASE}/${collection}/${docId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (res.status === 401) throw new Error('Session expired. Please login again.');
  if (res.status === 404) return null;
  if (res.status === 403) throw new Error('Access denied by security rules.');
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to load ${collection}/${docId}: ${err}`);
  }

  return docToObj(await res.json());
}

/**
 * Filtered query via Firestore REST :runQuery (rules-safe).
 * filters: [{ field, op: 'EQUAL' | 'ARRAY_CONTAINS', value }]
 */
async function fsQuery(collection, filters) {
  const token = getIdToken();
  if (!token) throw new Error('Not logged in');

  const fieldFilters = filters.map(f => ({
    fieldFilter: {
      field: { fieldPath: f.field },
      op: f.op,
      value: { stringValue: String(f.value) },
    },
  }));

  const structuredQuery = {
    from: [{ collectionId: collection }],
    where: fieldFilters.length === 1
      ? fieldFilters[0]
      : { compositeFilter: { op: 'AND', filters: fieldFilters } },
  };

  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ structuredQuery }),
  });

  if (res.status === 401) throw new Error('Session expired. Please login again.');
  if (res.status === 403) throw new Error('Access denied by security rules.');
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to query ${collection}: ${err}`);
  }

  const data = await res.json();
  return (data || [])
    .map(r => (r.document ? docToObj(r.document) : null))
    .filter(Boolean);
}

/**
 * SET (create-or-replace) a document with a known ID
 */
async function fsSet(collection, docId, obj) {
  const token = getIdToken();
  if (!token) throw new Error('Not logged in');

  const res = await fetch(`${FIRESTORE_BASE}/${collection}/${docId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: objToFields(obj) }),
  });

  if (res.status === 401) throw new Error('Session expired. Please login again.');
  if (res.status === 403) throw new Error('Access denied by security rules.');
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to save ${collection}/${docId}: ${err}`);
  }

  return docToObj(await res.json());
}

/**
 * GET all documents from a collection
 */
async function fsGet(collection) {
  const token = getIdToken();
  if (!token) throw new Error('Not logged in');

  const res = await fetch(`${FIRESTORE_BASE}/${collection}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (res.status === 401) {
    throw new Error('Session expired. Please login again.');
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to load ${collection}: ${err}`);
  }

  const data = await res.json();
  return (data.documents || []).map(docToObj).filter(Boolean);
}

/**
 * ADD a document to a collection
 */
async function fsAdd(collection, obj) {
  const token = getIdToken();
  if (!token) throw new Error('Not logged in');

  const res = await fetch(`${FIRESTORE_BASE}/${collection}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: objToFields(obj) }),
  });

  if (res.status === 401) throw new Error('Session expired. Please login again.');
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to save: ${err}`);
  }

  return docToObj(await res.json());
}

/**
 * UPDATE a document
 */
async function fsUpdate(collection, docId, obj) {
  const token = getIdToken();
  if (!token) throw new Error('Not logged in');

  // Build update mask from keys
  const fields = objToFields(obj);
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');

  const res = await fetch(`${FIRESTORE_BASE}/${collection}/${docId}?${mask}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (res.status === 401) throw new Error('Session expired. Please login again.');
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to update: ${err}`);
  }

  return docToObj(await res.json());
}

/**
 * DELETE a document
 */
async function fsDelete(collection, docId) {
  const token = getIdToken();
  if (!token) throw new Error('Not logged in');

  const res = await fetch(`${FIRESTORE_BASE}/${collection}/${docId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (res.status === 401) throw new Error('Session expired. Please login again.');
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Failed to delete: ${err}`);
  }
  return true;
}

/**
 * Sort helper: newest first by createdAt
 */
function byCreated(a, b) {
  const ta = a.createdAt || '';
  const tb = b.createdAt || '';
  return tb.localeCompare(ta);
}

/**
 * Escape HTML to prevent XSS
 */
function escH(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
