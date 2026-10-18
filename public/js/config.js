// Medinest - Firebase Configuration
// Project: medinest-36419

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBGc4EL3iDVKVSd1ZnnIJ-dWyQG_KRRRvY',
  projectId: 'medinest-36419',
  authDomain: 'medinest-36419.firebaseapp.com',
};

// Firestore REST API base
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

// Auth proxy (Netlify function - bypasses browser restrictions)
const AUTH_PROXY_URL = 'https://marvelous-genie-304f9f.netlify.app/.netlify/functions/auth';

// WhatsApp
const WHATSAPP_SUPPORT = '+923198086233';
const WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029Vb9MT0kChq6MFsUW142v';

// Collections
const COLLECTIONS = {
  MEDICINES: 'medicines',
  ORDERS: 'orders',
  STORES: 'stores',
  LEDGER: 'ledger',
  REVIEWS: 'reviews',
  STORE_REVIEWS: 'storeReviews',
};

// Categories
const CATEGORIES = {
  allo: ['Injection', 'Drip', 'Syrup', 'Tablet', 'Capsule', 'Cotton', 'Needle', 'Bandage', 'Syringe', 'Ointment', 'Other'],
  homeo: ['Syrup', 'German Potency', 'Pakistan Potency', 'Drops', 'Tablet', 'Capsule', 'Other'],
};

// Constants
const LOW_STOCK_THRESHOLD = 5;
const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered'];
