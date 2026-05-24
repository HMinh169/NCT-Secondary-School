// ============================================================
//  GÓC HỌC TRÒ — app.js  (phiên bản nâng cấp)
//  - Đăng ảnh (upload / chụp camera)
//  - 5 filter cute
//  - Tải ảnh về
//  - Phát nhạc YouTube (toàn trang & trong bài)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc,
  updateDoc, increment, orderBy, query, onSnapshot, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadString, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ──────────────────────────────────────────────────────────────
//  🔥 FIREBASE CONFIG — Thay bằng config của bạn!
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

const CATS = [
  { id:'study',  name:'Học tập',  icon:'📖', color:'#185FA5', bg:'#E6F1FB', bar:'#378ADD' },
  { id:'memory', name:'Kỷ niệm', icon:'🌸', color:'#993556', bg:'#FBEAF0', bar:'#D4537E' },
  { id:'fun',    name:'Vui vẻ',   icon:'😄', color:'#854F0B', bg:'#FAEEDA', bar:'#EF9F27' },
  { id:'friend', name:'Tình bạn', icon:'🤝', color:'#0F6E56', bg:'#E1F5EE', bar:'#1D9E75' },
  { id:'love',   name:'Thổ lộ',   icon:'💌', color:'#A32D2D', bg:'#FCEBEB', bar:'#E24B4A' },
  { id:'other',  name:'Khác',     icon:'💬', color:'#534AB7', bg:'#EEEDFE', bar:'#7F77DD' },
];
const GC = id => CATS.find(c => c.id === id) || CATS[5];
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── State ────────────────────────────────────────────────────
let db, storage;
let posts = [];
let selTab = 'all';
let selCat = null;
let curDet = null;

// Image state
let rawImageDataUrl = null;   // original from file/camera
let finalImageDataUrl = null; // after filter applied
let currentFilter = 'none';

// Camera state
let camStream = null;
let camFilterActive = 'none';

// YouTube state
let ytPlayer = null;
let ytReady = false;
let pendingVideoId = null;

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  setNotice('connecting', '🔌 Đang kết nối database...');
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    setNotice('ok', '🌐 Đã kết nối! Bài đăng được chia sẻ với mọi người.');
    startRealtime();
    setupDragDrop();
  } catch (e) {
    console.error(e);
    setNotice('error', '❌ Lỗi kết nối Firebase. Kiểm tra lại config trong app.js.');
  }
}

// ── REALTIME ─────────────────────────────────────────────────
function startRealtime() {
  const q = query(collection(db, 'posts'), orderBy('time', 'desc'));
  onSnapshot(q, snap => {
    posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  }, err => {
    console.error(err);
    setNotice('error', '❌ Mất kết nối. Đang thử lại...');
    setTimeout(startRealtime, 5000);
  });
}

window.loadPosts = async (manual = false) => {
  if (!manual) return;
  try {
    const snap = await getDocs(query(collection(db, 'posts'), orderBy('time', 'desc')));
    posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
    showT('🔄 Đã tải lại!', 1500);
  } catch(e) { showT('Lỗi tải bài!'); }
};

// ── RENDER ───────────────────────────────────────────────────
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
  const tc = posts.reduce((s,p) => s + (p.comments?.length || 0), 0);
  const tl = posts.reduce((s,p) => s + (p.likes || 0), 0);
  document.getElementById('statsBar').innerHTML = `
    <div class="si">📝 <span class="sn">${posts.length}</span> bài viết</div>
    <div class="si">💬 <span class="sn">${tc}</span> bình luận</div>
    <div class="si">❤️ <span class="sn">${tl}</span> lượt thích</div>
    <div class="si" style="margin-left:auto;color:#1D9E75;font-weight:800;font-size:.72rem">🔴 Trực tiếp</div>`;
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
    .filter(p => !q || p.title?.toLowerCase().includes(q) || p.content?.toLowerCase().includes(q) || p.author?.toLowerCase().includes(q));
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
    const ex = (p.content || '').replace(/\n/g,' ').slice(0,112) + (p.content?.length > 112 ? '…' : '');
    const av = (p.author || 'AN').trim().slice(0,2).toUpperCase();
    const liked = localStorage.getItem('lk_' + p.id);
    const imgHtml = p.imageUrl ? `<img class="c-img" src="${esc(p.imageUrl)}" alt="ảnh bài" loading="lazy">` : '';
    const musicHtml = p.musicUrl ? `<div class="c-music"><div class="c-music-dot"></div>🎵 Có nhạc kèm theo</div>` : '';
    return `<div class="card" style="animation-delay:${i*.04}s" onclick="openDet('${p.id}')">
      <div class="cbar" style="background:${c.bar}"></div>
      ${imgHtml}
      ${p.pinned ? '<div class="pb">📌 Ghim</div>' : isNew ? '<div class="nb">Mới</div>' : ''}
      <div class="cbody">
        <div class="cmeta">
          <span class="badge" style="background:${c.bg};color:${c.color}">${c.icon} ${c.name}</span>
          <span class="cdate">${ago(ts)}</span>
        </div>
        <div class="ctitle">${esc(p.title || '')}</div>
        <div class="cex">${esc(ex)}</div>
        ${musicHtml}
      </div>
      <div class="cfoot">
        <div class="auth">
          <div class="av" style="background:${c.bg};color:${c.color}">${av}</div>
          <span class="an">${esc(p.author || 'Ẩn danh')}</span>
        </div>
        <div class="acts">
          <button class="ab" style="${liked?'color:#E24B4A':''}" onclick="doLike(event,'${p.id}')">❤️ ${p.likes||0}</button>
          <span class="ab" style="color:#378ADD">💬 ${p.comments?.length||0}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── LIKE ─────────────────────────────────────────────────────
window.doLike = async (e, id) => {
  e.stopPropagation();
  const k = 'lk_' + id;
  const already = localStorage.getItem(k);
  try {
    await updateDoc(doc(db, 'posts', id), { likes: increment(already ? -1 : 1) });
    already ? localStorage.removeItem(k) : localStorage.setItem(k,'1');
  } catch(err) { showT('Lỗi! Thử lại nhé.'); }
};

// ── DETAIL ───────────────────────────────────────────────────
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
  const av = (p.author || 'AN').trim().slice(0,2).toUpperCase();
  const cmts = (p.comments || []).map(cm => `
    <div class="ci2">
      <div class="av" style="background:${c.bg};color:${c.color};width:28px;height:28px;font-size:.66rem;flex-shrink:0">${(cm.author||'AN').slice(0,2).toUpperCase()}</div>
      <div class="cb">
        <div class="cau" style="color:${c.color}">${esc(cm.author||'Ẩn danh')}</div>
        <div class="ctx">${esc(cm.text||'')}</div>
        <div class="ctm">${ago(cm.time||0)}</div>
      </div>
    </div>`).join('');

  const imgHtml = p.imageUrl ? `
    <img src="${esc(p.imageUrl)}" class="d-img" alt="ảnh bài">
    <a class="dl-btn" href="${esc(p.imageUrl)}" download="goc-hoc-tro-anh.jpg" target="_blank">⬇️ Tải ảnh về</a>
  ` : '';

  const musicHtml = p.musicUrl ? `
    <div class="d-music">
      <div class="d-music-info">
        <div class="d-music-title">🎵 Nhạc kèm theo bài</div>
        <div class="d-music-sub">Nhấn để phát nhạc của bài này</div>
      </div>
      <button class="d-music-btn" onclick="playMusicFromPost('${esc(p.musicUrl)}')">▶ Phát</button>
    </div>
  ` : '';

  document.getElementById('detPanel').innerHTML = `
    <div class="dtop">
      <div class="dbar" style="background:${c.bar}"></div>
      <div class="dhd">
        <div class="dtit">${esc(p.title||'')}</div>
        <button class="xb" onclick="closeDet()">✕</button>
      </div>
      <div class="cmeta" style="margin-bottom:.65rem">
        <span class="badge" style="background:${c.bg};color:${c.color}">${c.icon} ${c.name}</span>
        <span class="cdate">${ago(ts)}</span>
      </div>
      <div class="auth" style="margin-bottom:.85rem">
        <div class="av" style="background:${c.bg};color:${c.color}">${av}</div>
        <span style="font-size:.82rem;font-weight:700">${esc(p.author||'Ẩn danh')}</span>
      </div>
    </div>
    ${imgHtml}
    <div class="dc">${esc(p.content||'')}</div>
    ${musicHtml}
    <div class="ddiv"></div>
    <div class="cs">
      <div class="cst">💬 Bình luận (${p.comments?.length||0})</div>
      <div id="cList">${cmts||'<div style="color:#888780;font-size:.82rem;text-align:center;padding:.8rem">Chưa có bình luận — hãy là người đầu tiên! 🌟</div>'}</div>
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
    await updateDoc(doc(db, 'posts', curDet), { comments: arrayUnion({ author, text, time: Date.now() }) });
    document.getElementById('cTx').value = '';
    showT('💬 Đã đăng bình luận!');
  } catch(e) { showT('Lỗi! Thử lại.'); }
  btn.disabled = false; btn.textContent = 'Gửi';
};

// ── NEW POST ──────────────────────────────────────────────────
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
  ['pT','pC','pA','pMusic'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('tc').textContent  = '0';
  document.getElementById('cc2').textContent = '0';
  selCat = null; buildCG();
  clearImg();
}
window.upC = (src, out, max) => {
  document.getElementById(out).textContent = document.getElementById(src).value.length;
};

window.doSubmit = async () => {
  const title   = document.getElementById('pT').value.trim();
  const content = document.getElementById('pC').value.trim();
  const author  = document.getElementById('pA').value.trim() || 'Ẩn danh';
  const musicUrl= document.getElementById('pMusic').value.trim();
  if (!title)   { showT('Vui lòng nhập tiêu đề!'); return; }
  if (!content) { showT('Vui lòng nhập nội dung!'); return; }
  if (!selCat)  { showT('Vui lòng chọn danh mục!'); return; }

  const btn = document.getElementById('subBtn');
  btn.disabled = true; btn.textContent = '⏳ Đang đăng...';

  let imageUrl = '';
  if (finalImageDataUrl) {
    try {
      btn.textContent = '⏳ Đang tải ảnh...';
      const imgRef = ref(storage, `posts/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
      await uploadString(imgRef, finalImageDataUrl, 'data_url');
      imageUrl = await getDownloadURL(imgRef);
    } catch(e) {
      console.warn('Lỗi upload ảnh, đăng không có ảnh:', e);
      showT('⚠️ Không upload được ảnh, đăng bài không ảnh.');
    }
  }

  try {
    await addDoc(collection(db, 'posts'), {
      title, content, author, cat: selCat,
      likes: 0, comments: [], pinned: false,
      imageUrl: imageUrl || '',
      musicUrl: musicUrl || '',
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

// ── IMAGE / CAMERA ────────────────────────────────────────────
function setupDragDrop() {
  const zone = document.getElementById('imgZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadImageFile(file);
  });
}

window.handleFileSelect = e => {
  const file = e.target.files[0];
  if (file) loadImageFile(file);
};

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    rawImageDataUrl = ev.target.result;
    finalImageDataUrl = rawImageDataUrl;
    currentFilter = 'none';
    showImgPreview(finalImageDataUrl);
  };
  reader.readAsDataURL(file);
}

function showImgPreview(url) {
  const prev = document.getElementById('imgPreview');
  const ph   = document.getElementById('izPlaceholder');
  prev.src = url; prev.style.display = 'block';
  ph.style.display = 'none';
  document.getElementById('filterBtn').style.display = '';
  document.getElementById('delImgBtn').style.display = '';
}

window.clearImg = () => {
  rawImageDataUrl = null; finalImageDataUrl = null; currentFilter = 'none';
  const prev = document.getElementById('imgPreview');
  prev.src = ''; prev.style.display = 'none';
  document.getElementById('izPlaceholder').style.display = '';
  document.getElementById('filterBtn').style.display = 'none';
  document.getElementById('delImgBtn').style.display = 'none';
  document.getElementById('fileInput').value = '';
};

// Camera
window.openCam = async () => {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
    document.getElementById('camVideo').srcObject = camStream;
    document.getElementById('camOv').classList.add('show');
    document.body.style.overflow = 'hidden';
  } catch(e) {
    showT('❌ Không truy cập được camera. Kiểm tra quyền trình duyệt.');
  }
};
window.closeCam = () => {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  document.getElementById('camOv').classList.remove('show');
  document.body.style.overflow = 'hidden'; // keep new post open
};

// Camera filter (CSS on video)
const camFilterCSS = {
  none:   'none',
  warm:   'sepia(.4) saturate(1.4) hue-rotate(-10deg)',
  cool:   'saturate(.8) hue-rotate(20deg) brightness(1.05)',
  dreamy: 'brightness(1.1) saturate(.7) contrast(.9)',
  retro:  'sepia(.6) contrast(1.1) saturate(.8)',
  bw:     'grayscale(1)'
};
window.setFilter = (btn, name) => {
  camFilterActive = name;
  document.getElementById('camVideo').style.filter = camFilterCSS[name] || 'none';
  document.querySelectorAll('.cf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.capturePhoto = () => {
  const video  = document.getElementById('camVideo');
  const canvas = document.getElementById('camCanvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.filter = camFilterCSS[camFilterActive] || 'none';
  ctx.drawImage(video, 0, 0);
  rawImageDataUrl = canvas.toDataURL('image/jpeg', .92);
  finalImageDataUrl = rawImageDataUrl;
  currentFilter = camFilterActive;
  closeCam();
  showImgPreview(finalImageDataUrl);
  showT('📸 Đã chụp! Bạn có thể thêm filter.');
};

// Filter modal (for images from file or camera)
window.openFilter = () => {
  if (!rawImageDataUrl) return;
  const canvas = document.getElementById('filterCanvas');
  applyFilterToCanvas(rawImageDataUrl, canvas, currentFilter, () => {
    renderFilterPreviews();
    document.getElementById('filterOv').classList.add('show');
  });
};
window.closeFilter = () => { document.getElementById('filterOv').classList.remove('show'); };

const FILTERS = {
  none:   img => img,
  warm:   (img, ctx, w, h) => { ctx.drawImage(img,0,0,w,h); const d=ctx.getImageData(0,0,w,h); for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.min(255,d.data[i]*1.15);d.data[i+2]=Math.max(0,d.data[i+2]*.85);} ctx.putImageData(d,0,0); },
  cool:   (img, ctx, w, h) => { ctx.drawImage(img,0,0,w,h); const d=ctx.getImageData(0,0,w,h); for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.max(0,d.data[i]*.88);d.data[i+2]=Math.min(255,d.data[i+2]*1.18);} ctx.putImageData(d,0,0); },
  dreamy: (img, ctx, w, h) => { ctx.drawImage(img,0,0,w,h); const d=ctx.getImageData(0,0,w,h); for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.min(255,(d.data[i]*0.85)+30);d.data[i+1]=Math.min(255,(d.data[i+1]*0.85)+20);d.data[i+2]=Math.min(255,(d.data[i+2]*0.9)+30);} ctx.putImageData(d,0,0); ctx.fillStyle='rgba(255,200,220,.18)'; ctx.fillRect(0,0,w,h); },
  retro:  (img, ctx, w, h) => { ctx.drawImage(img,0,0,w,h); const d=ctx.getImageData(0,0,w,h); for(let i=0;i<d.data.length;i+=4){const r=d.data[i],g=d.data[i+1],b=d.data[i+2];d.data[i]=Math.min(255,r*.393+g*.769+b*.189);d.data[i+1]=Math.min(255,r*.349+g*.686+b*.168);d.data[i+2]=Math.min(255,r*.272+g*.534+b*.131);} ctx.putImageData(d,0,0); ctx.fillStyle='rgba(180,130,60,.12)'; ctx.fillRect(0,0,w,h); },
  bw:     (img, ctx, w, h) => { ctx.drawImage(img,0,0,w,h); const d=ctx.getImageData(0,0,w,h); for(let i=0;i<d.data.length;i+=4){const g=d.data[i]*.3+d.data[i+1]*.59+d.data[i+2]*.11;d.data[i]=d.data[i+1]=d.data[i+2]=g;} ctx.putImageData(d,0,0); },
};

function applyFilterToCanvas(dataUrl, canvas, filterName, cb) {
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 600/img.width, 800/img.height);
    canvas.width  = img.width  * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const fn = FILTERS[filterName];
    if (fn && filterName !== 'none') fn(img, ctx, canvas.width, canvas.height);
    else ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (cb) cb();
  };
  img.src = dataUrl;
}

function renderFilterPreviews() {
  const names = ['none','warm','cool','dreamy','retro','bw'];
  names.forEach(name => {
    const el = document.getElementById('fp_'+name);
    if (!el) return;
    const c = document.createElement('canvas');
    c.width=60; c.height=45;
    const img = new Image();
    img.onload = () => {
      const ctx = c.getContext('2d');
      const fn = FILTERS[name];
      if (fn && name !== 'none') fn(img, ctx, 60, 45);
      else ctx.drawImage(img, 0, 0, 60, 45);
      el.style.backgroundImage = `url(${c.toDataURL()})`;
      el.style.backgroundSize = 'cover';
    };
    img.src = rawImageDataUrl;
  });
}

window.applyFilter = (btn, name) => {
  currentFilter = name;
  applyFilterToCanvas(rawImageDataUrl, document.getElementById('filterCanvas'), name, null);
  document.querySelectorAll('.fg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.confirmFilter = () => {
  const canvas = document.getElementById('filterCanvas');
  finalImageDataUrl = canvas.toDataURL('image/jpeg', .92);
  showImgPreview(finalImageDataUrl);
  closeFilter();
  showT('✨ Đã áp dụng filter!');
};

// ── YOUTUBE ───────────────────────────────────────────────────
window.onYouTubeIframeAPIReady = () => {
  ytReady = true;
  ytPlayer = new YT.Player('ytPlayer', {
    height:'1', width:'1',
    playerVars:{ autoplay:0, controls:0 },
    events:{
      onReady: () => {
        if (pendingVideoId) { ytPlayer.loadVideoById(pendingVideoId); pendingVideoId = null; }
      },
      onStateChange: e => {
        if (e.data === YT.PlayerState.PLAYING) {
          document.getElementById('ytStatus').textContent = '🎵 Đang phát...';
        } else if (e.data === YT.PlayerState.ENDED || e.data === YT.PlayerState.PAUSED) {
          document.getElementById('ytStatus').textContent = '';
        }
      }
    }
  });
};

function extractVideoId(url) {
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function playVideoId(videoId) {
  document.getElementById('ytEmbed').style.display = 'block';
  if (!ytPlayer || !ytReady) {
    pendingVideoId = videoId;
  } else {
    ytPlayer.loadVideoById(videoId);
  }
}

window.loadYT = () => {
  const url = document.getElementById('ytInput').value.trim();
  if (!url) { showT('Dán link YouTube vào nhé!'); return; }
  const id = extractVideoId(url);
  if (!id) { showT('Link YouTube không hợp lệ!'); return; }
  playVideoId(id);
  showT('🎵 Đang phát nhạc...', 2000);
};

window.stopYT = () => {
  if (ytPlayer && ytReady) {
    ytPlayer.stopVideo();
    document.getElementById('ytStatus').textContent = '';
    showT('⏹ Đã dừng nhạc.', 1500);
  }
};

window.playMusicFromPost = url => {
  const id = extractVideoId(url);
  if (!id) { showT('Link nhạc không hợp lệ!'); return; }
  // Open music bar and play
  const bar = document.getElementById('musicBar');
  bar.classList.add('open');
  document.getElementById('ytInput').value = url;
  playVideoId(id);
  showT('🎵 Đang phát nhạc từ bài này...', 2000);
};

window.openMusicBar = () => {
  document.getElementById('musicBar').classList.toggle('open');
};

// ── UTILS ─────────────────────────────────────────────────────
function setNotice(type, msg) {
  const el = document.getElementById('dbNotice');
  el.className = `notice ${type}`;
  el.textContent = msg;
}
function showT(msg, dur=2700) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), dur);
}
function ago(ts) {
  const ms = typeof ts === 'number' ? ts : (ts?.toMillis?.() || 0);
  const d = (Date.now() - ms) / 1000;
  if (d < 60)    return 'Vừa xong';
  if (d < 3600)  return Math.floor(d/60) + ' phút trước';
  if (d < 86400) return Math.floor(d/3600) + ' giờ trước';
  return Math.floor(d/86400) + ' ngày trước';
}

// Close modals on BG click
document.getElementById('newOv').onclick = e => { if (e.target===document.getElementById('newOv')) closeNew(); };
document.getElementById('camOv').onclick  = e => { if (e.target===document.getElementById('camOv'))  closeCam(); };
document.getElementById('filterOv').onclick = e => { if (e.target===document.getElementById('filterOv')) closeFilter(); };

// ── START ─────────────────────────────────────────────────────
init();