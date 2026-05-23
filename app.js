// ============================================================
//  GÓC HỌC TRÒ — app.js
//  Firebase Firestore làm database chung cho mọi người
//  Hướng dẫn cấu hình Firebase ở file README.md
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc,
  updateDoc, increment, orderBy, query, onSnapshot, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ──────────────────────────────────────────────────────────────
//  🔥 CẤU HÌNH FIREBASE — Thay bằng config của bạn!
//  Xem README.md để biết cách lấy config này.
// ──────────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyCP85EZo7ntoRXSeAYcASkECo0orC812Cs",
    authDomain: "goc-hoctro-cap2.firebaseapp.com",
    projectId: "goc-hoctro-cap2",
    storageBucket: "goc-hoctro-cap2.firebasestorage.app",
    messagingSenderId: "129784346772",
    appId: "1:129784346772:web:8830cb3c2abdee40bb1c81",
    measurementId: "G-TR644S23VX"
};
// ──────────────────────────────────────────────────────────────

const CATS = [
  { id:'study',  name:'Học tập',  icon:'📖', color:'#185FA5', bg:'#E6F1FB', bar:'#378ADD' },
  { id:'memory', name:'Kỷ niệm', icon:'🌸', color:'#993556', bg:'#FBEAF0', bar:'#D4537E' },
  { id:'fun',    name:'Vui vẻ',   icon:'😄', color:'#854F0B', bg:'#FAEEDA', bar:'#EF9F27' },
  { id:'friend', name:'Tình bạn', icon:'🤝', color:'#0F6E56', bg:'#E1F5EE', bar:'#1D9E75' },
  { id:'love',   name:'Thổ lộ',   icon:'💌', color:'#A32D2D', bg:'#FCEBEB', bar:'#E24B4A' },
  { id:'other',  name:'Khác',     icon:'💬', color:'#534AB7', bg:'#EEEDFE', bar:'#7F77DD' },
];
const GC = id => CATS.find(c => c.id === id) || CATS[5];
const esc = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

let db;
let posts = [];
let selTab = 'all';
let selCat = null;
let curDet = null;
let unsubscribe = null;

// ─── INIT ────────────────────────────────────────────────────
async function init() {
  setNotice('connecting', '🔌 Đang kết nối database...');

  // Kiểm tra config đã điền chưa
  if (firebaseConfig.apiKey === 'PASTE_YOUR_API_KEY_HERE') {
    setNotice('error', '⚠️ Chưa cấu hình Firebase! Xem README.md để biết cách thiết lập.');
    document.getElementById('postsGrid').innerHTML =
      `<div class="empty"><div class="ei">🔧</div>
       <h3>Cần cấu hình Firebase</h3>
       <p>Mở file <strong>app.js</strong> và điền Firebase config của bạn vào.<br>
       Xem <strong>README.md</strong> để hướng dẫn chi tiết.</p></div>`;
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    setNotice('ok', '🌐 Đã kết nối! Bài đăng được chia sẻ với mọi người.');
    startRealtime();
  } catch (e) {
    console.error(e);
    setNotice('error', '❌ Lỗi kết nối Firebase. Kiểm tra lại config trong app.js.');
  }
}

// ─── REALTIME LISTENER ───────────────────────────────────────
function startRealtime() {
  const q = query(collection(db, 'posts'), orderBy('time', 'desc'));
  unsubscribe = onSnapshot(q, snap => {
    posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  }, err => {
    console.error(err);
    setNotice('error', '❌ Mất kết nối. Đang thử lại...');
    setTimeout(startRealtime, 5000);
  });
}

// Tải lại thủ công
window.loadPosts = async function(manual = false) {
  if (manual) {
    const btn = document.querySelector('.btn-refresh');
    if (btn) btn.style.pointerEvents = 'none';
    try {
      const snap = await getDocs(query(collection(db, 'posts'), orderBy('time', 'desc')));
      posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
      showT('🔄 Đã tải lại!', 1500);
    } catch(e) { showT('Lỗi tải bài!'); }
    if (btn) btn.style.pointerEvents = '';
  }
};

// ─── RENDER ──────────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderTabs();
  renderPosts();
  if (curDet) {
    const updated = posts.find(p => p.id === curDet);
    if (updated) renderDet();
  }
}

function renderStats() {
  const tc = posts.reduce((s, p) => s + (p.comments?.length || 0), 0);
  const tl = posts.reduce((s, p) => s + (p.likes || 0), 0);
  document.getElementById('statsBar').innerHTML = `
    <div class="si">📝 <span class="sn">${posts.length}</span> bài viết</div>
    <div class="si">💬 <span class="sn">${tc}</span> bình luận</div>
    <div class="si">❤️ <span class="sn">${tl}</span> lượt thích</div>
    <div class="si" style="margin-left:auto;color:#1D9E75;font-weight:700;font-size:.72rem">🔴 Trực tiếp</div>`;
}

function renderTabs() {
  const h = [`<button class="tab ${selTab==='all'?'active':''}" onclick="sTab('all')">Tất cả (${posts.length})</button>`];
  CATS.forEach(c => {
    const n = posts.filter(p => p.cat === c.id).length;
    if (n) h.push(`<button class="tab ${selTab===c.id?'active':''}" onclick="sTab('${c.id}')">${c.icon} ${c.name} (${n})</button>`);
  });
  document.getElementById('tabsEl').innerHTML = h.join('');
}
window.sTab = id => { selTab = id; renderAll(); };

function getFiltered() {
  const q = (document.getElementById('si')?.value || '').toLowerCase();
  return posts
    .filter(p => selTab === 'all' || p.cat === selTab)
    .filter(p => !q ||
      p.title?.toLowerCase().includes(q) ||
      p.content?.toLowerCase().includes(q) ||
      p.author?.toLowerCase().includes(q)
    );
}
window.doFilter = () => renderPosts();

function renderPosts() {
  const list = getFiltered();
  const g = document.getElementById('postsGrid');
  if (!list.length) {
    g.innerHTML = `<div class="empty"><div class="ei">🔍</div><h3>Không tìm thấy bài nào</h3><p>Thử từ khóa khác hoặc đăng bài mới!</p></div>`;
    return;
  }
  const now = Date.now();
  g.innerHTML = list.map((p, i) => {
    const c = GC(p.cat);
    const ts = p.time?.toMillis ? p.time.toMillis() : (p.time || 0);
    const isNew = now - ts < 3_600_000 * 3;
    const ex = (p.content || '').replace(/\n/g, ' ').slice(0, 112) + (p.content?.length > 112 ? '...' : '');
    const av = (p.author || 'AN').trim().slice(0, 2).toUpperCase();
    const liked = localStorage.getItem('lk_' + p.id);
    return `<div class="card" style="animation-delay:${i * 0.04}s" onclick="openDet('${p.id}')">
      <div class="cbar" style="background:${c.bar}"></div>
      ${p.pinned ? '<div class="pb">📌 Ghim</div>' : isNew ? '<div class="nb">Mới</div>' : ''}
      <div class="cbody">
        <div class="cmeta">
          <span class="badge" style="background:${c.bg};color:${c.color}">${c.icon} ${c.name}</span>
          <span class="cdate">${ago(ts)}</span>
        </div>
        <div class="ctitle">${esc(p.title || '')}</div>
        <div class="cex">${esc(ex)}</div>
      </div>
      <div class="cfoot">
        <div class="auth">
          <div class="av" style="background:${c.bg};color:${c.color}">${av}</div>
          <span class="an">${esc(p.author || 'Ẩn danh')}</span>
        </div>
        <div class="acts">
          <button class="ab" style="${liked ? 'color:#E24B4A' : ''}" onclick="doLike(event,'${p.id}')">❤️ ${p.likes || 0}</button>
          <span class="ab" style="color:#378ADD">💬 ${p.comments?.length || 0}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── LIKE ────────────────────────────────────────────────────
window.doLike = async (e, id) => {
  e.stopPropagation();
  const k = 'lk_' + id;
  const already = localStorage.getItem(k);
  try {
    await updateDoc(doc(db, 'posts', id), {
      likes: increment(already ? -1 : 1)
    });
    already ? localStorage.removeItem(k) : localStorage.setItem(k, '1');
  } catch(err) { showT('Lỗi! Thử lại nhé.'); }
};

// ─── DETAIL ──────────────────────────────────────────────────
window.openDet = id => {
  curDet = id;
  renderDet();
  document.getElementById('detOv').classList.add('show');
  document.body.style.overflow = 'hidden';
};
window.closeDet = () => {
  document.getElementById('detOv').classList.remove('show');
  document.body.style.overflow = '';
  curDet = null;
};
window.cDOut = e => { if (e.target === document.getElementById('detOv')) closeDet(); };

function renderDet() {
  const p = posts.find(x => x.id === curDet);
  if (!p) return;
  const c = GC(p.cat);
  const ts = p.time?.toMillis ? p.time.toMillis() : (p.time || 0);
  const av = (p.author || 'AN').trim().slice(0, 2).toUpperCase();
  const cmts = (p.comments || []).map(cm => `
    <div class="ci2">
      <div class="av" style="background:${c.bg};color:${c.color};width:28px;height:28px;font-size:.66rem;flex-shrink:0">${(cm.author||'AN').slice(0,2).toUpperCase()}</div>
      <div class="cb">
        <div class="cau" style="color:${c.color}">${esc(cm.author || 'Ẩn danh')}</div>
        <div class="ctx">${esc(cm.text || '')}</div>
        <div class="ctm">${ago(cm.time || 0)}</div>
      </div>
    </div>`).join('');

  document.getElementById('detPanel').innerHTML = `
    <div class="dtop">
      <div class="dbar" style="background:${c.bar}"></div>
      <div class="dhd">
        <div class="dtit">${esc(p.title || '')}</div>
        <button class="xb" onclick="closeDet()">✕</button>
      </div>
      <div class="cmeta" style="margin-bottom:.65rem">
        <span class="badge" style="background:${c.bg};color:${c.color}">${c.icon} ${c.name}</span>
        <span class="cdate">${ago(ts)}</span>
      </div>
      <div class="auth" style="margin-bottom:.85rem">
        <div class="av" style="background:${c.bg};color:${c.color}">${av}</div>
        <span style="font-size:.82rem;font-weight:600">${esc(p.author || 'Ẩn danh')}</span>
      </div>
    </div>
    <div class="dc">${esc(p.content || '')}</div>
    <div class="ddiv"></div>
    <div class="cs">
      <div class="cst">💬 Bình luận (${p.comments?.length || 0})</div>
      <div id="cList">${cmts || '<div style="color:#888780;font-size:.82rem;text-align:center;padding:.8rem">Chưa có bình luận — hãy là người đầu tiên! 🌟</div>'}</div>
      <div class="cf">
        <input type="text" id="cA" placeholder="Tên bạn..." style="max-width:100px">
        <input type="text" id="cTx" placeholder="Viết bình luận..." onkeydown="if(event.key==='Enter')doCmt()">
        <button class="cbtn" id="cBtn" onclick="doCmt()">Gửi</button>
      </div>
    </div>`;
}

window.doCmt = async () => {
  const author = document.getElementById('cA')?.value.trim() || '';
  const text   = document.getElementById('cTx')?.value.trim() || '';
  if (!author || !text) { showT('Nhập tên và bình luận nhé!'); return; }
  const btn = document.getElementById('cBtn');
  btn.disabled = true; btn.textContent = '...';
  try {
    const newCmt = { author, text, time: Date.now() };
    await updateDoc(doc(db, 'posts', curDet), {
      comments: arrayUnion(newCmt)
    });
    document.getElementById('cTx').value = '';
    showT('💬 Đã đăng bình luận!');
  } catch(e) { showT('Lỗi! Thử lại.'); }
  btn.disabled = false; btn.textContent = 'Gửi';
};

// ─── NEW POST ─────────────────────────────────────────────────
function buildCG() {
  document.getElementById('catGrid').innerHTML = CATS.map(c => `
    <div class="co ${selCat===c.id?'sel':''}" onclick="pCat('${c.id}')">
      <div class="ci">${c.icon}</div>
      <div class="cn">${c.name}</div>
    </div>`).join('');
}
window.pCat = id => { selCat = id; buildCG(); };

window.openNew = () => {
  if (!db) { showT('⚠️ Chưa kết nối Firebase!'); return; }
  selCat = null; buildCG();
  document.getElementById('newOv').classList.add('show');
  document.body.style.overflow = 'hidden';
};
window.closeNew = () => {
  document.getElementById('newOv').classList.remove('show');
  document.body.style.overflow = '';
  resetForm();
};
function resetForm() {
  ['pT','pC','pA'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('tc').textContent  = '0';
  document.getElementById('cc2').textContent = '0';
  selCat = null; buildCG();
}
window.upC = (src, out, max) => {
  document.getElementById(out).textContent = document.getElementById(src).value.length;
};

window.doSubmit = async () => {
  const title   = document.getElementById('pT').value.trim();
  const content = document.getElementById('pC').value.trim();
  const author  = document.getElementById('pA').value.trim() || 'Ẩn danh';
  if (!title)   { showT('Vui lòng nhập tiêu đề!'); return; }
  if (!content) { showT('Vui lòng nhập nội dung!'); return; }
  if (!selCat)  { showT('Vui lòng chọn danh mục!'); return; }

  const btn = document.getElementById('subBtn');
  btn.disabled = true; btn.textContent = '⏳ Đang đăng...';
  try {
    await addDoc(collection(db, 'posts'), {
      title, content, author, cat: selCat,
      likes: 0, comments: [], pinned: false,
      time: serverTimestamp()
    });
    closeNew();
    showT('🎉 Đã đăng bài! Mọi người đều thấy rồi!', 3000);
  } catch(e) {
    console.error(e);
    showT('❌ Lỗi đăng bài. Kiểm tra kết nối và Firestore rules.');
  }
  btn.disabled = false; btn.textContent = '📌 Đăng bài ngay';
};

// ─── UTILS ───────────────────────────────────────────────────
function setNotice(type, msg) {
  const el = document.getElementById('dbNotice');
  el.className = `notice ${type}`;
  el.textContent = msg;
}

function showT(msg, dur = 2700) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), dur);
}

function ago(ts) {
  const ms = typeof ts === 'number' ? ts : (ts?.toMillis?.() || 0);
  const d = (Date.now() - ms) / 1000;
  if (d < 60)    return 'Vừa xong';
  if (d < 3600)  return Math.floor(d / 60) + ' phút trước';
  if (d < 86400) return Math.floor(d / 3600) + ' giờ trước';
  return Math.floor(d / 86400) + ' ngày trước';
}

// Close modals on background click
document.getElementById('newOv').onclick = e => { if (e.target === document.getElementById('newOv')) closeNew(); };

// ─── START ────────────────────────────────────────────────────
init();