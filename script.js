// ===== Supabase client (replaces raw fetch) =====
const SUPABASE_URL = 'https://ecanypkqbjccawilppvz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYW55cGtxYmpjY2F3aWxwcHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNzQwMzYsImV4cCI6MjA5Nzk1MDAzNn0.SShhAPZjfmu-TchWdRfY9vnGn2_LDtGBQW2YJnjnDQk';
const BUCKET = 'item-photos';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const EMOJIS = { Electronics:'📱', Wallets:'👛', IDs:'🪪', Keys:'🔑', Books:'📚', Bags:'🎒', Clothing:'👕', Accessories:'💍', Other:'📦' };

let currentModalItem = null;
let searchTimers = {};
let currentUser = null;            // { id, email } or null
let isAdmin = false;
let pendingPhotos = {};            // { lost: {file}|"url", found: ... }
let particleRaf = 0;               // requestAnimationFrame handle for the hero canvas

// ===== Helpers =====
function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo(0, 0);
  if (name === 'home') loadHome();
  if (name === 'lost') loadGrid('lost');
  if (name === 'found') loadGrid('found');
  if (name === 'admin') loadAdmin();
  if (name === 'report-lost' || name === 'report-found') refreshReportAuthNote(name.replace('report-',''));
  if (name === 'dashboard') refreshDashEmail();
}

function setNavActive(el) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  el.classList.add('active');
}

function showLoading(gridId) {
  document.getElementById(gridId).innerHTML = '<div class="loading"><div class="loading-spinner"></div><br>Loading…</div>';
}

function showError(gridId, msg) {
  document.getElementById(gridId).innerHTML = `<div class="error-banner">⚠️ ${escapeHtml(msg)}</div>`;
}

// ===== Hero particle canvas =====
// Vanilla port of the reference React effect: drifting, fading dots on the home hero.
// Honors prefers-reduced-motion (no animation) and is scoped to the home page only.
function initHeroParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Stop any previous loop before starting fresh (home can re-show).
  cancelAnimationFrame(particleRaf);

  // Respect reduced-motion users: render nothing, keep canvas transparent.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const setSize = () => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  };
  setSize();

  let particles = [];
  const count = () => Math.floor((canvas.width * canvas.height) / 7000);

  const reset = (p) => {
    p.x = Math.random() * canvas.width;
    p.y = Math.random() * canvas.height;
    p.speed = Math.random() / 5 + 0.1;
    p.opacity = 0.7;
    p.fadeDelay = Math.random() * 600 + 100;
    p.fadeStart = Date.now() + p.fadeDelay;
    p.fadingOut = false;
  };
  const make = () => { const p = {}; reset(p); return p; };

  const init = () => {
    particles = [];
    for (let i = 0; i < count(); i++) particles.push(make());
  };

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.y -= p.speed;
      if (p.y < 0) reset(p);
      if (!p.fadingOut && Date.now() > p.fadeStart) p.fadingOut = true;
      if (p.fadingOut) {
        p.opacity -= 0.008;
        if (p.opacity <= 0) reset(p);
      }
      ctx.fillStyle = `rgba(250, 250, 250, ${p.opacity})`;
      ctx.fillRect(p.x, p.y, 0.6, Math.random() * 2 + 1);
    });
    particleRaf = requestAnimationFrame(draw);
  };

  const onResize = () => { setSize(); init(); };
  window.addEventListener('resize', onResize);
  init();
  particleRaf = requestAnimationFrame(draw);
}

// ===== Auth =====
function updateAuthUI() {
  const out = document.getElementById('nav-auth-signedout');
  const inn = document.getElementById('nav-auth-signedin');
  if (currentUser) {
    out.style.display = 'none';
    inn.style.display = 'flex';
    const emailEl = document.getElementById('nav-user-email');
    emailEl.textContent = currentUser.email;
    emailEl.title = currentUser.email;
  } else {
    out.style.display = 'flex';
    inn.style.display = 'none';
  }
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) adminLink.style.display = isAdmin ? '' : 'none';
}

async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    currentUser = { id: session.user.id, email: session.user.email };
    await refreshAdminFlag();
  } else {
    currentUser = null;
    isAdmin = false;
  }
  updateAuthUI();
}

// Read is_admin from profiles. Fail-safe to false if the table/policy is missing.
async function refreshAdminFlag() {
  if (!currentUser) { isAdmin = false; return; }
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', currentUser.id)
    .maybeSingle();
  isAdmin = !error && data && data.is_admin === true;
}

function openLoginModal() {
  document.getElementById('login-email').value = '';
  document.getElementById('login-msg').style.display = 'none';
  document.getElementById('login-modal').classList.add('open');
}
function closeLoginModal() { document.getElementById('login-modal').classList.remove('open'); }

async function sendLoginLink() {
  const email = document.getElementById('login-email').value.trim();
  const msg = document.getElementById('login-msg');
  if (!email) { msg.textContent = 'Please enter your email.'; msg.style.display = 'block'; msg.style.color = 'var(--danger)'; return; }
  const btn = document.getElementById('login-submit-btn');
  btn.textContent = 'Sending…'; btn.disabled = true;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
  btn.textContent = 'Send Login Link'; btn.disabled = false;
  if (error) {
    msg.textContent = 'Could not send link: ' + error.message;
    msg.style.color = 'var(--danger)';
    msg.style.display = 'block';
    return;
  }
  msg.textContent = '✅ Check your email — we sent a login link. Click it to sign in.';
  msg.style.color = 'var(--success)';
  msg.style.display = 'block';
  showToast('📧 Login link sent to ' + email);
}

async function doLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  updateAuthUI();
  showToast('👋 Logged out');
  showPage('home');
}

// Gate report submission behind login
function guardReport(type) {
  if (!currentUser) {
    showToast('⚠️ Please log in to submit a report');
    openLoginModal();
    return;
  }
  showPage('report-' + type);
}

function refreshReportAuthNote(type) {
  const note = document.getElementById(type + '-auth-note');
  if (currentUser) note.innerHTML = 'Reporting as <strong>' + escapeHtml(currentUser.email) + '</strong>';
  else note.innerHTML = '<span style="color:var(--danger)">Please log in to submit.</span>';
}

function refreshDashEmail() {
  if (currentUser) document.getElementById('dash-email').value = currentUser.email;
}

// ===== Photo handling =====
function renderPhotoPreview(type, url) {
  const box = document.getElementById(type + '-photo-preview');
  if (url) {
    box.classList.add('photo-preview-has');
    box.classList.remove('photo-preview-empty');
    box.innerHTML = `<img class="photo-preview-img" src="${escapeHtml(url)}" alt="preview">
                     <button type="button" class="photo-clear" onclick="clearPhoto('${type}'); event.preventDefault();">✕</button>`;
  } else {
    box.classList.remove('photo-preview-has');
    box.classList.add('photo-preview-empty');
    box.innerHTML = '<div style="font-size:28px">📷</div><div style="font-size:13px;color:var(--gray-500);margin-top:6px">Click to upload a photo</div>';
  }
}

function handlePhotoPick(type, event) {
  const file = event.target.files[0];
  if (!file) return;
  // create a local object URL so the user sees a preview before submit
  const localUrl = URL.createObjectURL(file);
  pendingPhotos[type] = { file };
  document.getElementById(type + '-photo-url').value = '';   // file takes precedence over URL
  renderPhotoPreview(type, localUrl);
}

function handlePhotoUrl(type, url) {
  if (!url) { clearPhoto(type); return; }
  // a pasted URL overrides any picked file
  delete pendingPhotos[type].file;
  pendingPhotos[type] = { url };
  document.getElementById(type + '-photo-input').value = '';
  renderPhotoPreview(type, url);
}

function clearPhoto(type) {
  pendingPhotos[type] = null;
  document.getElementById(type + '-photo-input').value = '';
  document.getElementById(type + '-photo-url').value = '';
  renderPhotoPreview(type, null);
}

// Returns final image URL (uploaded or pasted) or null.
async function resolvePhotoUrl(type, itemId) {
  const p = pendingPhotos[type];
  if (!p) return null;
  if (p.url) return p.url;                 // pasted link used as-is
  if (p.file) {
    const ext = (p.file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${currentUser.id}/${itemId || Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, p.file, { cacheControl: '3600', upsert: true });
    if (error) throw new Error('Photo upload failed: ' + error.message);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
  return null;
}

function resetPhotoField(type) {
  pendingPhotos[type] = null;
  document.getElementById(type + '-photo-input').value = '';
  document.getElementById(type + '-photo-url').value = '';
  renderPhotoPreview(type, null);
}

// ===== Rendering =====
function renderCard(item) {
  const emoji = EMOJIS[item.category] || '📦';
  const isLost = item.type === 'lost';
  const isReturned = item.status === 'returned';
  const badgeClass = isReturned ? 'badge-returned' : (isLost ? 'badge-lost' : 'badge-found');
  const badgeText = isReturned ? 'Returned' : (isLost ? 'Lost' : 'Found');
  const thumb = item.image_url
    ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" onerror="this.parentNode.innerHTML='<span style=&quot;font-size:52px&quot;>${emoji}</span>'">`
    : emoji;
  const div = document.createElement('div');
  div.className = 'item-card';
  div.onclick = () => openDetail(item);
  div.innerHTML = `
    <div class="item-thumb">${thumb}</div>
    <div class="item-card-body">
      <div class="item-card-title">${escapeHtml(item.title)}</div>
      <div class="item-card-meta">
        <span>${escapeHtml(item.location || '—')}</span>
        <span class="meta-dot"></span>
        <span>${fmt(item.date)}</span>
      </div>
      <span class="badge ${badgeClass}">${badgeText}</span>
      ${!isLost && !isReturned ? '<span class="badge badge-pending" style="margin-left:6px">Awaiting Claim</span>' : ''}
    </div>`;
  return div;
}

function renderGrid(items, gridId, countId) {
  const grid = document.getElementById(gridId);
  if (countId) document.getElementById(countId).textContent = `${items.length} item${items.length !== 1 ? 's' : ''} listed`;
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No items found</div><div class="empty-text">Try a different search or filter</div></div>';
    return;
  }
  items.forEach(item => grid.appendChild(renderCard(item)));
}

// ===== Data: home & grids =====
async function loadHome() {
  showLoading('home-grid');
  try {
    const { count: lostCount } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('type', 'lost');
    const { count: foundCount } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('type', 'found');
    const { count: returnedCount } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('status', 'returned');
    document.getElementById('stat-lost').textContent = lostCount ?? '—';
    document.getElementById('stat-found').textContent = foundCount ?? '—';
    document.getElementById('stat-returned').textContent = returnedCount ?? '—';

    const { data: items, error } = await supabase.from('items').select('*').order('created_at', { ascending: false }).limit(6);
    if (error) throw error;
    renderGrid(items || [], 'home-grid', null);
  } catch(e) {
    showError('home-grid', 'Could not load items: ' + e.message);
  }
}

async function loadGrid(type, search = '', category = '') {
  const gridId = type + '-grid';
  const countId = type + '-count';
  showLoading(gridId);
  try {
    let query = supabase.from('items').select('*').eq('type', type);
    if (category) query = query.eq('category', category);
    if (search) {
      const s = `%${search}%`;
      query = query.or(`title.ilike.${s},description.ilike.${s},location.ilike.${s}`);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    renderGrid(data || [], gridId, countId);
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

// ===== Detail modal =====
function openDetail(item) {
  currentModalItem = item;
  const emoji = EMOJIS[item.category] || '📦';
  const imgBox = document.getElementById('modal-img');
  if (item.image_url) {
    imgBox.className = 'modal-img has-img';
    imgBox.innerHTML = `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" onerror="this.parentNode.className='modal-img';this.parentNode.innerHTML='<span style=&quot;font-size:40px&quot;>${emoji}</span>'">`;
  } else {
    imgBox.className = 'modal-img';
    imgBox.innerHTML = `<span style="font-size:40px">${emoji}</span>`;
  }
  const isLost = item.type === 'lost';
  const isReturned = item.status === 'returned';
  const tb = document.getElementById('modal-type-badge');
  tb.className = 'badge ' + (isReturned ? 'badge-returned' : isLost ? 'badge-lost' : 'badge-found');
  tb.textContent = isReturned ? 'Returned' : (isLost ? 'Lost' : 'Found');
  document.getElementById('modal-cat-badge').textContent = item.category || '—';
  document.getElementById('modal-title').textContent = item.title;
  box('modal-date').textContent = fmt(item.date);
  box('modal-location').textContent = item.location || '—';
  box('modal-reporter').textContent = item.reporter_email || '—';
  document.getElementById('modal-status').innerHTML = isReturned
    ? '<span style="color:var(--gray-500);font-weight:600">Resolved</span>'
    : '<span style="color:var(--success);font-weight:600">Active</span>';
  box('modal-id').textContent = item.id.slice(0,8).toUpperCase();
  box('modal-desc').textContent = item.description || 'No description provided.';
  const btn = document.getElementById('modal-action-btn');
  if (isReturned) { btn.style.display = 'none'; }
  else if (!isLost) { btn.style.display = ''; btn.textContent = '🙋 Claim This Item'; }
  else { btn.style.display = ''; btn.textContent = '✅ I Found This!'; }
  document.getElementById('item-modal').classList.add('open');
}
function box(id) { return document.getElementById(id); }
function closeModal() { document.getElementById('item-modal').classList.remove('open'); }

function handleModalAction() {
  if (!currentModalItem) return;
  if (currentModalItem.type === 'found') {
    closeModal();
    if (!currentUser) { openLoginModal(); showToast('⚠️ Please log in to claim an item'); return; }
    document.getElementById('claim-auth-email').textContent = currentUser.email;
    document.getElementById('claim-modal').classList.add('open');
  } else {
    closeModal();
    showToast('✅ Thank you! We\'ve notified the owner.');
  }
}

function closeClaimModal() { document.getElementById('claim-modal').classList.remove('open'); }

async function submitClaim() {
  if (!currentUser) { openLoginModal(); return; }
  const answer = document.getElementById('claim-answer').value.trim();
  if (!answer) { showToast('⚠️ Please fill in the identifying feature'); return; }
  if (!currentModalItem) return;
  const btn = document.getElementById('claim-submit-btn');
  btn.textContent = 'Submitting…'; btn.disabled = true;
  try {
    const { error } = await supabase.from('claims').insert({
      item_id: currentModalItem.id,
      claimant_email: currentUser.email,
      verification_answer: answer,
      status: 'pending'
    });
    if (error) throw error;
    document.getElementById('claim-answer').value = '';
    closeClaimModal();
    showToast('🎉 Claim submitted! The owner will review it shortly.');
  } catch(e) {
    showToast('⚠️ Could not submit claim: ' + e.message);
  } finally {
    btn.textContent = 'Submit Claim'; btn.disabled = false;
  }
}

// ===== Report submission =====
function selectCat(el, hiddenId) {
  el.closest('.category-grid').querySelectorAll('.category-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const label = el.textContent.trim().replace(/^\S+\s/, '');
  document.getElementById(hiddenId).value = label;
}

async function submitReport(type) {
  if (!currentUser) { openLoginModal(); return; }
  const name = document.getElementById(type + '-name').value.trim();
  const cat = document.getElementById(type + '-cat').value;
  const desc = document.getElementById(type + '-desc').value.trim();
  const location = document.getElementById(type + '-location').value;
  const date = document.getElementById(type + '-date').value;
  if (!name || !cat || !desc || !location || !date) {
    showToast('⚠️ Please fill in all required fields'); return;
  }

  const btn = document.getElementById(type + '-submit-btn');
  btn.textContent = 'Submitting…'; btn.disabled = true;
  try {
    // 1) Insert the row first (no image yet)
    const { data: inserted, error } = await supabase.from('items').insert({
      title: name, category: cat, description: desc, location, date,
      reporter_email: currentUser.email, user_id: currentUser.id,
      type, status: 'active'
    }).select();
    if (error) throw error;
    const row = inserted && inserted[0];

    // 2) Resolve + upload photo (optional), then PATCH image_url back onto the row
    if (pendingPhotos[type]) {
      try {
        const imageUrl = await resolvePhotoUrl(type, row && row.id);
        if (imageUrl && row) {
          await supabase.from('items').update({ image_url: imageUrl }).eq('id', row.id);
        }
      } catch (uploadErr) {
        // Row already created — don't fail the whole report, just warn
        showToast('⚠️ ' + uploadErr.message);
      }
    }

    // 3) Reset form
    document.getElementById(type + '-name').value = '';
    document.getElementById(type + '-desc').value = '';
    document.getElementById(type + '-location').value = '';
    document.getElementById(type + '-cat').value = '';
    document.getElementById(type + '-cat-grid').querySelectorAll('.category-chip').forEach(c => c.classList.remove('selected'));
    resetPhotoField(type);
    showToast('🎉 Report submitted successfully!');
    setTimeout(() => showPage(type), 600);
  } catch(e) {
    showToast('⚠️ Could not submit: ' + e.message);
  } finally {
    btn.textContent = 'Submit Report'; btn.disabled = false;
  }
}

// ===== Dashboard =====
async function loadDashboard() {
  const email = document.getElementById('dash-email').value.trim();
  if (!email) { showToast('⚠️ Enter your email first'); return; }
  try {
    const { data: items, error } = await supabase.from('items')
      .select('*').eq('reporter_email', email).order('created_at', { ascending: false });
    if (error) throw error;
    const list = items || [];
    const lostItems = list.filter(i => i.type === 'lost');
    const foundItems = list.filter(i => i.type === 'found');
    const retItems = list.filter(i => i.status === 'returned');

    const { data: claims, error: cErr } = await supabase.from('claims')
      .select('*').eq('claimant_email', email);
    if (cErr) throw cErr;

    document.getElementById('my-lost-count').textContent = lostItems.length;
    document.getElementById('my-found-count').textContent = foundItems.length;
    document.getElementById('my-claims-count').textContent = (claims || []).length;
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
      <div class="report-thumb">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-sm)" onerror="this.replaceWith(document.createTextNode('${EMOJIS[item.category]||'📦'}'))">` : (EMOJIS[item.category]||'📦')}</div>
      <div class="report-info">
        <div class="report-title">${escapeHtml(item.title)}</div>
        <div class="report-meta">${escapeHtml(item.location||'—')} · ${fmt(item.date)}</div>
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
    const { error } = await supabase.from('items').update({ status: 'returned' }).eq('id', id);
    if (error) throw error;
    showToast('✅ Item marked as returned!');
    loadDashboard();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

async function deleteItem(id) {
  if (!confirm('Delete this report? This cannot be undone.')) return;
  try {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) throw error;
    showToast('🗑️ Report deleted.');
    loadDashboard();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

// ===== Admin =====
async function loadAdmin() {
  if (!currentUser) {
    renderAdminDenied('You must be logged in to view the admin panel.');
    return;
  }
  // Refresh in case the admin flag was just granted
  await refreshAdminFlag();
  if (!isAdmin) {
    renderAdminDenied('This area is restricted to administrators. Your account does not have admin access.');
    return;
  }
  try {
    const [itemsRes, claimsRes] = await Promise.all([
      supabase.from('items').select('*').order('created_at', { ascending: false }),
      supabase.from('claims').select('*').order('created_at', { ascending: false })
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (claimsRes.error) throw claimsRes.error;
    const all = itemsRes.data || [];
    const claims = claimsRes.data || [];
    const lost = all.filter(i => i.type === 'lost');
    const found = all.filter(i => i.type === 'found');
    const ret = all.filter(i => i.status === 'returned');
    document.getElementById('admin-total').textContent = all.length;
    document.getElementById('admin-lost').textContent = lost.length;
    document.getElementById('admin-found').textContent = found.length;
    document.getElementById('admin-returned').textContent = ret.length;

    document.getElementById('admin-items-body').innerHTML = all.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.title)}</strong><br><span style="font-size:11px;color:var(--gray-400)">${item.id.slice(0,8).toUpperCase()}</span></td>
        <td><span class="badge ${item.type==='lost'?'badge-lost':'badge-found'}">${item.type}</span></td>
        <td>${escapeHtml(item.category||'—')}</td>
        <td style="font-size:13px">${escapeHtml(item.location||'—')}</td>
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
        <td>${escapeHtml(c.claimant_email)}</td>
        <td style="font-size:13px;color:var(--gray-500)">${fmt(c.created_at)}</td>
        <td style="max-width:200px;font-size:13px;color:var(--gray-600)">${escapeHtml(c.verification_answer)}</td>
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
  if (!isAdmin) { showToast('⚠️ Admin access required'); return; }
  try {
    const { error } = await supabase.from('items').update({ status: 'returned' }).eq('id', id);
    if (error) throw error;
    showToast('✅ Marked as returned'); loadAdmin();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

async function adminDelete(id) {
  if (!isAdmin) { showToast('⚠️ Admin access required'); return; }
  if (!confirm('Permanently delete this item and all its claims?')) return;
  try {
    const { error: cErr } = await supabase.from('claims').delete().eq('item_id', id);
    if (cErr) throw cErr;
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) throw error;
    showToast('🗑️ Item deleted'); loadAdmin();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

async function adminUpdateClaim(claimId, status) {
  if (!isAdmin) { showToast('⚠️ Admin access required'); return; }
  try {
    const { error } = await supabase.from('claims').update({ status }).eq('id', claimId);
    if (error) throw error;
    showToast(`✅ Claim ${status}`); loadAdmin();
  } catch(e) { showToast('⚠️ ' + e.message); }
}

// Rendered when a non-admin reaches the admin page
function renderAdminDenied(message) {
  document.getElementById('admin-items-body').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-400)">' + escapeHtml(message) + '</td></tr>';
  document.getElementById('admin-claims-body').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400)">' + escapeHtml(message) + '</td></tr>';
  document.getElementById('admin-total').textContent = '—';
  document.getElementById('admin-lost').textContent = '—';
  document.getElementById('admin-found').textContent = '—';
  document.getElementById('admin-returned').textContent = '—';
}

// ===== Tabs & toast =====
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

// ===== Event wiring =====
document.getElementById('item-modal').addEventListener('click', e => { if (e.target === document.getElementById('item-modal')) closeModal(); });
document.getElementById('claim-modal').addEventListener('click', e => { if (e.target === document.getElementById('claim-modal')) closeClaimModal(); });
document.getElementById('login-modal').addEventListener('click', e => { if (e.target === document.getElementById('login-modal')) closeLoginModal(); });

document.getElementById('lost-date').value = new Date().toISOString().split('T')[0];
document.getElementById('found-date').value = new Date().toISOString().split('T')[0];

// ===== Boot =====
// React to login/logout (incl. magic-link redirect resolving the session).
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    currentUser = { id: session.user.id, email: session.user.email };
    await refreshAdminFlag();
  } else {
    currentUser = null;
    isAdmin = false;
  }
  updateAuthUI();
});

(async () => {
  await getCurrentUser();
  loadHome();
})();
