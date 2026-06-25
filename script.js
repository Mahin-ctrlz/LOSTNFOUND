const SUPABASE_URL = 'https://ecanypkqbjccawilppvz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYW55cGtxYmpjY2F3aWxwcHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNzQwMzYsImV4cCI6MjA5Nzk1MDAzNn0.SShhAPZjfmu-TchWdRfY9vnGn2_LDtGBQW2YJnjnDQk';

const EMOJIS = { Electronics:'📱', Wallets:'👛', IDs:'🪪', Keys:'🔑', Books:'📚', Bags:'🎒', Clothing:'👕', Accessories:'💍', Other:'📦' };

let currentModalItem = null;
let searchTimers = {};

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

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo(0, 0);
  if (name === 'home') loadHome();
  if (name === 'lost') loadGrid('lost');
  if (name === 'found') loadGrid('found');
  if (name === 'admin') loadAdmin();
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

function renderCard(item) {
  const emoji = EMOJIS[item.category] || '📦';
  const isLost = item.type === 'lost';
  const isReturned = item.status === 'returned';
  const badgeClass = isReturned ? 'badge-returned' : (isLost ? 'badge-lost' : 'badge-found');
  const badgeText = isReturned ? 'Returned' : (isLost ? 'Lost' : 'Found');
  const div = document.createElement('div');
  div.className = 'item-card';
  div.onclick = () => openDetail(item);
  div.innerHTML = `
    <div class="item-thumb">${emoji}</div>
    <div class="item-card-body">
      <div class="item-card-title">${item.title}</div>
      <div class="item-card-meta">
        <span>${item.location || '—'}</span>
        <span class="meta-dot"></span>
        <span>${fmt(item.date)}</span>
      </div>
      <span class="badge ${badgeClass}">${badgeText}</span>
      ${!isLost && !isReturned ? '<span class="badge badge-pending" style="margin-left:6px">Awaiting Claim</span>' : ''}
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
  items.forEach(item => grid.appendChild(renderCard(item)));
}

async function loadHome() {
  showLoading('home-grid');
  try {
    const [items, lostCount, foundCount, returnedCount] = await Promise.all([
      sb('items?select=*&order=created_at.desc&limit=6'),
      sb('items?type=eq.lost&select=id', { headers: { 'Prefer': 'count=exact' }, method: 'HEAD' }).catch(() => null),
      sb('items?type=eq.found&select=id', { headers: { 'Prefer': 'count=exact' }, method: 'HEAD' }).catch(() => null),
      sb('items?status=eq.returned&select=id', { headers: { 'Prefer': 'count=exact' }, method: 'HEAD' }).catch(() => null),
    ]);
    const lostItems = await sb('items?type=eq.lost&select=id');
    const foundItems = await sb('items?type=eq.found&select=id');
    const retItems = await sb('items?status=eq.returned&select=id');
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

function openDetail(item) {
  currentModalItem = item;
  const emoji = EMOJIS[item.category] || '📦';
  document.getElementById('modal-img').innerHTML = `<span style="font-size:40px">${emoji}</span>`;
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

async function submitClaim() {
  const answer = document.getElementById('claim-answer').value.trim();
  const email = document.getElementById('claim-email').value.trim();
  if (!answer || !email) { showToast('⚠️ Please fill in all fields'); return; }
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
    document.getElementById('claim-email').value = '';
    closeClaimModal();
    showToast('🎉 Claim submitted! The owner will review it shortly.');
  } catch(e) {
    showToast('⚠️ Could not submit claim: ' + e.message);
  } finally {
    btn.textContent = 'Submit Claim'; btn.disabled = false;
  }
}

function selectCat(el, hiddenId) {
  el.closest('.category-grid').querySelectorAll('.category-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const label = el.textContent.trim().replace(/^\S+\s/, '');
  document.getElementById(hiddenId).value = label;
}

async function submitReport(type) {
  const name = document.getElementById(type + '-name').value.trim();
  const cat = document.getElementById(type + '-cat').value;
  const desc = document.getElementById(type + '-desc').value.trim();
  const location = document.getElementById(type + '-location').value;
  const date = document.getElementById(type + '-date').value;
  const email = document.getElementById(type + '-email').value.trim();
  if (!name || !cat || !desc || !location || !date || !email) {
    showToast('⚠️ Please fill in all required fields'); return;
  }
  const btn = document.getElementById(type + '-submit-btn');
  btn.textContent = 'Submitting…'; btn.disabled = true;
  try {
    await sb('items', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ title: name, category: cat, description: desc, location, date, reporter_email: email, type, status: 'active' })
    });
    document.getElementById(type + '-name').value = '';
    document.getElementById(type + '-desc').value = '';
    document.getElementById(type + '-location').value = '';
    document.getElementById(type + '-cat').value = '';
    document.getElementById(type + '-email').value = '';
    document.getElementById(type + '-cat-grid').querySelectorAll('.category-chip').forEach(c => c.classList.remove('selected'));
    showToast('🎉 Report submitted successfully!');
    setTimeout(() => showPage(type), 600);
  } catch(e) {
    showToast('⚠️ Could not submit: ' + e.message);
  } finally {
    btn.textContent = 'Submit Report'; btn.disabled = false;
  }
}

async function loadDashboard() {
  const email = document.getElementById('dash-email').value.trim();
  if (!email) { showToast('⚠️ Enter your email first'); return; }
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
  el.innerHTML = items.map(item => `
    <div class="report-row">
      <div class="report-thumb">${EMOJIS[item.category]||'📦'}</div>
      <div class="report-info">
        <div class="report-title">${item.title}</div>
        <div class="report-meta">${item.location||'—'} · ${fmt(item.date)}</div>
      </div>
      <div class="report-actions">
        <span class="badge ${item.type==='lost'?'badge-lost':'badge-found'}">${item.type}</span>
        ${item.status !== 'returned' ? `<button class="btn-sm resolve" onclick="markResolved('${item.id}')">Mark Returned</button>` : '<span class="badge badge-returned">Returned</span>'}
        <button class="btn-sm del" onclick="deleteItem('${item.id}')">Delete</button>
      </div>
    </div>`).join('');
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
        <td><strong>${item.title}</strong><br><span style="font-size:11px;color:var(--gray-400)">${item.id.slice(0,8).toUpperCase()}</span></td>
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

document.getElementById('item-modal').addEventListener('click', e => { if (e.target === document.getElementById('item-modal')) closeModal(); });
document.getElementById('claim-modal').addEventListener('click', e => { if (e.target === document.getElementById('claim-modal')) closeClaimModal(); });

document.getElementById('lost-date').value = new Date().toISOString().split('T')[0];
document.getElementById('found-date').value = new Date().toISOString().split('T')[0];

loadHome();
