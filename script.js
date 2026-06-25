const SUPABASE_URL = 'https://ecanypkqbjccawilppvz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYW55cGtxYmpjY2F3aWxwcHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNzQwMzYsImV4cCI6MjA5Nzk1MDAzNn0.SShhAPZjfmu-TchWdRfY9vnGn2_LDtGBQW2YJnjnDQk';
// Supabase Storage bucket name — create a public bucket called "item-photos" in your Supabase dashboard
const STORAGE_BUCKET = 'item-photos';

const EMOJIS = { Electronics:'📱', Wallets:'👛', IDs:'🪪', Keys:'🔑', Books:'📚', Bags:'🎒', Clothing:'👕', Accessories:'💍', Other:'📦' };

let currentModalItem = null;
let searchTimers = {};
let currentUser = null;   // holds the logged-in email
let selectedPhotoFile = null;  // holds the chosen photo File object

// ─────────────────────────────────────────────
// SESSION helpers
// ─────────────────────────────────────────────
function getSession() {
  try { return JSON.parse(sessionStorage.getItem('campusfind_user') || 'null'); } catch { return null; }
}
function setSession(email) {
  sessionStorage.setItem('campusfind_user', JSON.stringify({ email }));
}
function clearSession() {
  sessionStorage.removeItem('campusfind_user');
}

// ─────────────────────────────────────────────
// LOGIN  (email-only, no password)
// ─────────────────────────────────────────────
function handleLogin() {
  const emailInput = document.getElementById('login-email');
  const errEl = document.getElementById('login-error');
  const email = emailInput.value.trim().toLowerCase();

  errEl.style.display = 'none';

  if (!email) {
    showLoginError('Please enter your university email address.');
    return;
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showLoginError('That doesn\'t look like a valid email address.');
    return;
  }
  // Optionally restrict to university domain — edit the domain below, or remove this block
  // const ALLOWED_DOMAIN = 'university.edu';
  // if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
  //   showLoginError(`Only @${ALLOWED_DOMAIN} emails are allowed.`);
  //   return;
  // }

  const btn = document.getElementById('login-btn');
  btn.innerHTML = 'Signing in…';
  btn.disabled = true;

  // Simulate a brief async "check" so the UX feels intentional
  setTimeout(() => {
    setSession(email);
    bootApp(email);
    btn.innerHTML = 'Continue <svg style=\"display:inline;margin-left:6px;vertical-align:-2px\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/><polyline points=\"12 5 19 12 12 19\"/></svg>';
    btn.disabled = false;
  }, 400);
}

function showLoginError(msg) {
  const errEl = document.getElementById('login-error');
  const msgEl = document.getElementById('login-error-msg');
  if (msgEl) msgEl.textContent = msg; else errEl.textContent = msg;
  const inputEl = document.getElementById('login-email');
  if (inputEl) inputEl.classList.add('error');
  errEl.style.display = 'flex';
}

function handleLogout() {
  clearSession();
  currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-error').style.display = 'none';
}

// Allow pressing Enter on the login email field
document.addEventListener('DOMContentLoaded', () => {
  const loginEmailEl = document.getElementById('login-email');
  if (loginEmailEl) {
    loginEmailEl.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    loginEmailEl.addEventListener('input', () => {
      loginEmailEl.classList.remove('error');
      const errEl = document.getElementById('login-error');
      if (errEl) errEl.style.display = 'none';
    });
  }
});

function bootApp(email) {
  currentUser = email;
  // Show nav user badge
  document.getElementById('nav-user-badge').textContent = email;
  // Pre-fill all email fields
  ['lost-email', 'found-email', 'claim-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = email;
  });
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadHome();
  loadDashboard();
}

// ─────────────────────────────────────────────
// Check session on page load
// ─────────────────────────────────────────────
window.addEventListener('load', () => {
  const session = getSession();
  if (session && session.email) {
    bootApp(session.email);
  }
});

// ─────────────────────────────────────────────
// SUPABASE REST helper
// ─────────────────────────────────────────────
async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers
    },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─────────────────────────────────────────────
// PHOTO UPLOAD helpers
// ─────────────────────────────────────────────
function handlePhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('⚠️ Photo must be smaller than 5 MB'); return;
  }
  selectedPhotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('upload-placeholder').style.display = 'none';
    document.getElementById('upload-preview').style.display = 'block';
    document.getElementById('upload-preview-img').src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removePhoto(event) {
  event.stopPropagation();
  selectedPhotoFile = null;
  document.getElementById('found-photo-input').value = '';
  document.getElementById('upload-placeholder').style.display = 'block';
  document.getElementById('upload-preview').style.display = 'none';
  document.getElementById('upload-preview-img').src = '';
}

async function uploadPhoto(file) {
  // Upload to Supabase Storage and return the public URL
  const ext = file.name.split('.').pop() || 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filename}`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': file.type,
        'x-upsert': 'false'
      },
      body: file
    }
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(err.error || 'Photo upload failed');
  }
  // Return the public URL
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`;
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function showPage(name) {
  // Guard: require login
  if (!currentUser) { return; }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo(0, 0);
  if (name === 'home') loadHome();
  if (name === 'lost') loadGrid('lost');
  if (name === 'found') loadGrid('found');
  if (name === 'admin') loadAdmin();
  if (name === 'dashboard') loadDashboard();
  // Re-fill email fields each time (in case of DOM resets)
  ['lost-email', 'found-email', 'claim-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = currentUser;
  });
}

function setNavActive(el) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  el.classList.add('active');
}

function showLoading(gridId) {
  document.getElementById(gridId).innerHTML = '<div class="loading"><div class="loading-spinner"></div><br>Loading…</div>';
}

function showError(gridId, msg) {
  document.getElementById(gridId).innerHTML = `<div class="error-banner">⚠️ ${msg}</div>`;
}

// ─────────────────────────────────────────────
// CARD RENDERING (with photo support)
// ─────────────────────────────────────────────
function renderCard(item) {
  const emoji = EMOJIS[item.category] || '📦';
  const isLost = item.type === 'lost';
  const isReturned = item.status === 'returned';
  const badgeClass = isReturned ? 'badge-returned' : (isLost ? 'badge-lost' : 'badge-found');
  const badgeText = isReturned ? 'Returned' : (isLost ? 'Lost' : 'Found');

  // Thumb: real photo if available, otherwise emoji placeholder
  const thumbHTML = item.photo_url
    ? `<div class="item-thumb item-thumb-has-photo"><img class="item-thumb-img" src="${item.photo_url}" alt="${item.title}" loading="lazy" onerror="this.parentElement.innerHTML='<span style=font-size:52px>${emoji}</span>';this.parentElement.classList.remove('item-thumb-has-photo')"></div>`
    : `<div class="item-thumb">${emoji}</div>`;

  const div = document.createElement('div');
  div.className = 'item-card';
  div.onclick = () => openDetail(item);
  div.innerHTML = `
    ${thumbHTML}
    <div class="item-card-body">
      <div class="item-card-title">${item.title}</div>
      <div class="item-card-meta">
        <span>${item.location || '—'}</span>
        <span class="meta-dot"></span>
        <span>${fmt(item.date)}</span>
      </div>
      <span class="badge ${badgeClass}">${badgeText}</span>
      ${!isLost && !isReturned ? '<span class="badge badge-pending" style="margin-left:6px">Awaiting Claim</span>' : ''}
      ${item.photo_url ? '<span class="badge badge-category" style="margin-left:6px">📷 Photo</span>' : ''}
    </div>`;
  return div;
}

function renderGrid(items, gridId, countId, type) {
  const grid = document.getElementById(gridId);
  if (countId) document.getElementById(countId).textContent = `${items.length} item${items.length !== 1 ? 's' : ''} listed`;
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No items found</div><div class="empty-text">Try a different search or filter</div></div>';
    return;
  }
  grid.className = 'items-grid';
  items.forEach(item => grid.appendChild(renderCard(item)));
}

// ─────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────
async function loadHome() {
  showLoading('home-grid');
  try {
    const [items, lostItems, foundItems, retItems] = await Promise.all([
      sb('items?select=*&order=created_at.desc&limit=6'),
      sb('items?type=eq.lost&select=id'),
      sb('items?type=eq.found&select=id'),
      sb('items?status=eq.returned&select=id')
    ]);
    document.getElementById('stat-lost').textContent = lostItems.length;
    document.getElementById('stat-found').textContent = foundItems.length;
    document.getElementById('stat-returned').textContent = retItems.length;
    renderGrid(items, 'home-grid', null, null);
  } catch(e) {
    showError('home-grid', 'Could not load items: ' + e.message);
  }
}

async function loadGrid(type, search = '', category = '') {
  const gridId = type + '-grid';
  const countId = type + '-count';
  showLoading(gridId);
  try {
    let query = `items?type=eq.${type}&order=created_at.desc`;
    if (category) query += `&category=eq.${encodeURIComponent(category)}`;
    if (search) query += `&or=(title.ilike.*${encodeURIComponent(search)}*,description.ilike.*${encodeURIComponent(search)}*,location.ilike.*${encodeURIComponent(search)}*)`;
    const items = await sb(query);
    renderGrid(items, gridId, countId, type);
  } catch(e) {
    showError(gridId, 'Could not load items: ' + e.message);
  }
}

function handleSearch(type, val) {
  clearTimeout(searchTimers[type]);
  searchTimers[type] = setTimeout(() => loadGrid(type, val), 350);
}

function handleCategoryFilter(type, cat) {
  loadGrid(type, '', cat);
}

// ─────────────────────────────────────────────
// ITEM DETAIL MODAL (with full-size photo)
// ─────────────────────────────────────────────
function openDetail(item) {
  currentModalItem = item;
  const emoji = EMOJIS[item.category] || '📦';

  // Thumbnail in header
  if (item.photo_url) {
    document.getElementById('modal-img').innerHTML = `<img src="${item.photo_url}" alt="${item.title}" style="width:90px;height:90px;object-fit:cover;border-radius:var(--radius)" onerror="this.outerHTML='<span style=font-size:40px>${emoji}</span>'">`;
  } else {
    document.getElementById('modal-img').innerHTML = `<span style="font-size:40px">${emoji}</span>`;
  }

  // Full-size photo row
  const photoRow = document.getElementById('modal-photo-row');
  const photoImg = document.getElementById('modal-photo-img');
  if (item.photo_url) {
    photoImg.src = item.photo_url;
    photoImg.alt = item.title;
    photoRow.style.display = 'block';
  } else {
    photoRow.style.display = 'none';
  }

  const isLost = item.type === 'lost';
  const isReturned = item.status === 'returned';
  const tb = document.getElementById('modal-type-badge');
  tb.className = 'badge ' + (isReturned ? 'badge-returned' : isLost ? 'badge-lost' : 'badge-found');
  tb.textContent = isReturned ? 'Returned' : (isLost ? 'Lost' : 'Found');
  document.getElementById('modal-cat-badge').textContent = item.category || '—';
  document.getElementById('modal-title').textContent = item.title;
  document.getElementById('modal-date').textContent = fmt(item.date);
  document.getElementById('modal-location').textContent = item.location || '—';
  document.getElementById('modal-reporter').textContent = item.reporter_email || '—';
  document.getElementById('modal-status').innerHTML = isReturned
    ? '<span style="color:var(--gray-500);font-weight:600">Resolved</span>'
    : '<span style="color:var(--success);font-weight:600">Active</span>';
  document.getElementById('modal-id').textContent = item.id.slice(0,8).toUpperCase();
  document.getElementById('modal-desc').textContent = item.description || 'No description provided.';
  const btn = document.getElementById('modal-action-btn');
  if (isReturned) { btn.style.display = 'none'; }
  else if (!isLost) { btn.style.display = ''; btn.textContent = '🙋 Claim This Item'; }
  else { btn.style.display = ''; btn.textContent = '✅ I Found This!'; }
  document.getElementById('item-modal').classList.add('open');
}

function closeModal() { document.getElementById('item-modal').classList.remove('open'); }

function handleModalAction() {
  if (!currentModalItem) return;
  if (currentModalItem.type === 'found') {
    closeModal();
    document.getElementById('claim-modal').classList.add('open');
  } else {
    closeModal();
    showToast('✅ Thank you! We\'ve notified the owner.');
  }
}

function closeClaimModal() { document.getElementById('claim-modal').classList.remove('open'); }

// ─────────────────────────────────────────────
// SUBMIT REPORT (with optional photo upload)
// ─────────────────────────────────────────────
async function submitReport(type) {
  const name = document.getElementById(type + '-name').value.trim();
  const cat = document.getElementById(type + '-cat').value;
  const desc = document.getElementById(type + '-desc').value.trim();
  const location = document.getElementById(type + '-location').value;
  const date = document.getElementById(type + '-date').value;
  const email = currentUser || document.getElementById(type + '-email').value.trim();
  if (!name || !cat || !desc || !location || !date || !email) {
    showToast('⚠️ Please fill in all required fields'); return;
  }
  const btn = document.getElementById(type + '-submit-btn');
  btn.textContent = 'Submitting…'; btn.disabled = true;

  try {
    let photo_url = null;

    // Upload photo if one was selected (only for "found" reports)
    if (type === 'found' && selectedPhotoFile) {
      btn.textContent = 'Uploading photo…';
      try {
        photo_url = await uploadPhoto(selectedPhotoFile);
      } catch(photoErr) {
        // Photo upload failed — warn but continue without photo
        showToast('⚠️ Photo upload failed, submitting without photo');
        photo_url = null;
      }
      btn.textContent = 'Submitting…';
    }

    await sb('items', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ title: name, category: cat, description: desc, location, date, reporter_email: email, type, status: 'active', photo_url })
    });

    // Reset form
    document.getElementById(type + '-name').value = '';
    document.getElementById(type + '-desc').value = '';
    document.getElementById(type + '-location').value = '';
    document.getElementById(type + '-cat').value = '';
    document.getElementById(type + '-cat-grid').querySelectorAll('.category-chip').forEach(c => c.classList.remove('selected'));
    if (type === 'found') {
      selectedPhotoFile = null;
      document.getElementById('found-photo-input').value = '';
      document.getElementById('upload-placeholder').style.display = 'block';
      document.getElementById('upload-preview').style.display = 'none';
      document.getElementById('upload-preview-img').src = '';
    }

    showToast('🎉 Report submitted successfully!');
    setTimeout(() => showPage(type), 600);
  } catch(e) {
    showToast('⚠️ Could not submit: ' + e.message);
  } finally {
    btn.textContent = 'Submit Report'; btn.disabled = false;
  }
}

// ─────────────────────────────────────────────
// CLAIM
// ─────────────────────────────────────────────
async function submitClaim() {
  const answer = document.getElementById('claim-answer').value.trim();
  const email = currentUser || document.getElementById('claim-email').value.trim();
  if (!answer) { showToast('⚠️ Please describe a unique identifying feature'); return; }
  if (!currentModalItem) return;
  const btn = document.getElementById('claim-submit-btn');
  btn.textContent = 'Submitting…'; btn.disabled = true;
  try {
    await sb('claims', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ item_id: currentModalItem.id, claimant_email: email, verification_answer: answer, status: 'pending' })
    });
    document.getElementById('claim-answer').value = '';
    closeClaimModal();
    showToast('🎉 Claim submitted! The owner will review it shortly.');
  } catch(e) {
    showToast('⚠️ Could not submit claim: ' + e.message);
  } finally {
    btn.textContent = 'Submit Claim'; btn.disabled = false;
  }
}

// ─────────────────────────────────────────────
// CATEGORY CHIP
// ─────────────────────────────────────────────
function selectCat(el, hiddenId) {
  el.closest('.category-grid').querySelectorAll('.category-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const label = el.textContent.trim().replace(/^\S+\s/, '');
  document.getElementById(hiddenId).value = label;
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
async function loadDashboard() {
  if (!currentUser) return;
  const email = currentUser;
  try {
    const items = await sb(`items?reporter_email=eq.${encodeURIComponent(email)}&order=created_at.desc`);
    const lostItems = items.filter(i => i.type === 'lost');
    const foundItems = items.filter(i => i.type === 'found');
    const retItems = items.filter(i => i.status === 'returned');
    const claims = await sb(`claims?claimant_email=eq.${encodeURIComponent(email)}`).catch(() => []);
    document.getElementById('my-lost-count').textContent = lostItems.length;
    document.getElementById('my-found-count').textContent = foundItems.length;
    document.getElementById('my-claims-count').textContent = claims.length;
    document.getElementById('my-returned-count').textContent = retItems.length;
    renderDashRows('dash-lost-rows', lostItems);
    renderDashRows('dash-found-rows', foundItems);
  } catch(e) {
    showToast('⚠️ Could not load reports: ' + e.message);
  }
}

function renderDashRows(containerId, items) {
  const el = document.getElementById(containerId);
  if (!items.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No reports yet</div><div class="empty-text">Submit a report to see it here</div></div>';
    return;
  }
  el.innerHTML = items.map(item => {
    const thumbHTML = item.photo_url
      ? `<div class="report-thumb" style="padding:0;overflow:hidden"><img src="${item.photo_url}" alt="${item.title}" style="width:50px;height:50px;object-fit:cover" onerror="this.parentElement.innerHTML='${EMOJIS[item.category]||'📦'}'"></div>`
      : `<div class="report-thumb">${EMOJIS[item.category]||'📦'}</div>`;
    return `
    <div class="report-row">
      ${thumbHTML}
      <div class="report-info">
        <div class="report-title">${item.title}</div>
        <div class="report-meta">${item.location||'—'} · ${fmt(item.date)}</div>
      </div>
      <div class="report-actions">
        <span class="badge ${item.type==='lost'?'badge-lost':'badge-found'}">${item.type}</span>
        ${item.status !== 'returned' ? `<button class="btn-sm resolve" onclick="markResolved('${item.id}')">Mark Returned</button>` : '<span class="badge badge-returned">Returned</span>'}
        <button class="btn-sm del" onclick="deleteItem('${item.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function markResolved(id) {
  try {
    await sb(`items?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'returned' }) });
    showToast('✅ Item marked as returned!');
    loadDashboard();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

async function deleteItem(id) {
  if (!confirm('Delete this report? This cannot be undone.')) return;
  try {
    await sb(`items?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    showToast('🗑️ Report deleted.');
    loadDashboard();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

// ─────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────
async function loadAdmin() {
  try {
    const [all, claims] = await Promise.all([
      sb('items?order=created_at.desc'),
      sb('claims?order=created_at.desc')
    ]);
    const lost = all.filter(i => i.type === 'lost');
    const found = all.filter(i => i.type === 'found');
    const ret = all.filter(i => i.status === 'returned');
    document.getElementById('admin-total').textContent = all.length;
    document.getElementById('admin-lost').textContent = lost.length;
    document.getElementById('admin-found').textContent = found.length;
    document.getElementById('admin-returned').textContent = ret.length;

    document.getElementById('admin-items-body').innerHTML = all.map(item => `
      <tr>
        <td>
          ${item.photo_url ? `<img src="${item.photo_url}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:4px;margin-right:8px;vertical-align:middle">` : ''}
          <strong>${item.title}</strong><br>
          <span style="font-size:11px;color:var(--gray-400)">${item.id.slice(0,8).toUpperCase()}</span>
        </td>
        <td><span class="badge ${item.type==='lost'?'badge-lost':'badge-found'}">${item.type}</span></td>
        <td>${item.category||'—'}</td>
        <td style="font-size:13px">${item.location||'—'}</td>
        <td style="font-size:13px;color:var(--gray-500)">${fmt(item.date)}</td>
        <td><span class="badge ${item.status==='returned'?'badge-returned':'badge-found'}">${item.status}</span></td>
        <td>
          ${item.status !== 'returned' ? `<button class="btn-sm resolve" style="margin-right:4px" onclick="adminResolve('${item.id}')">Resolve</button>` : ''}
          <button class="btn-sm del" onclick="adminDelete('${item.id}')">Delete</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-400)">No items found</td></tr>';

    document.getElementById('admin-claims-body').innerHTML = claims.map(c => `
      <tr>
        <td style="font-size:13px;color:var(--gray-500)">${c.item_id.slice(0,8).toUpperCase()}</td>
        <td>${c.claimant_email}</td>
        <td style="font-size:13px;color:var(--gray-500)">${fmt(c.created_at)}</td>
        <td style="max-width:200px;font-size:13px;color:var(--gray-600)">${c.verification_answer}</td>
        <td><span class="badge ${c.status==='approved'?'badge-found':c.status==='rejected'?'badge-lost':'badge-pending'}">${c.status}</span></td>
        <td>
          ${c.status === 'pending' ? `
            <button class="btn-sm resolve" style="margin-right:4px" onclick="adminUpdateClaim('${c.id}','approved')">Approve</button>
            <button class="btn-sm del" onclick="adminUpdateClaim('${c.id}','rejected')">Reject</button>` : '—'}
        </td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400)">No claims yet</td></tr>';
  } catch(e) {
    showToast('⚠️ Admin load failed: ' + e.message);
  }
}

async function adminResolve(id) {
  try {
    await sb(`items?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'returned' }) });
    showToast('✅ Marked as returned'); loadAdmin();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

async function adminDelete(id) {
  if (!confirm('Permanently delete this item and all its claims?')) return;
  try {
    await sb(`claims?item_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    await sb(`items?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    showToast('🗑️ Item deleted'); loadAdmin();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

async function adminUpdateClaim(claimId, status) {
  try {
    await sb(`claims?id=eq.${claimId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status }) });
    showToast(`✅ Claim ${status}`); loadAdmin();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

// ─────────────────────────────────────────────
// UI UTILITIES
// ─────────────────────────────────────────────
function switchTab(el, targetId) {
  el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const allTabs = ['tab-lost','tab-found','admin-tab-reports','admin-tab-claims'];
  allTabs.forEach(id => { const el2 = document.getElementById(id); if (el2) el2.style.display = 'none'; });
  const target = document.getElementById(targetId);
  if (target) target.style.display = '';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ─────────────────────────────────────────────
// MODAL CLOSE ON BACKDROP CLICK
// ─────────────────────────────────────────────
document.getElementById('item-modal').addEventListener('click', e => { if (e.target === document.getElementById('item-modal')) closeModal(); });
document.getElementById('claim-modal').addEventListener('click', e => { if (e.target === document.getElementById('claim-modal')) closeClaimModal(); });

// ─────────────────────────────────────────────
// DEFAULT DATES
// ─────────────────────────────────────────────
document.getElementById('lost-date').value = new Date().toISOString().split('T')[0];
document.getElementById('found-date').value = new Date().toISOString().split('T')[0];
