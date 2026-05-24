// ============================================================
//  GÓC HỌC TRÒ — app.js  (fixed: ảnh base64 + nhạc iframe)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc,
  updateDoc, increment, orderBy, query, onSnapshot,
  serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🔥 FIREBASE CONFIG
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
const GC  = id => CATS.find(c => c.id === id) || CATS[5];
const esc = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── State
let db;
let posts = [];
let selTab = 'all';
let selCat = null;
let curDet = null;

// Image state
let rawImageDataUrl   = null;
let finalImageDataUrl = null;
let currentFilter     = 'none';

// Camera
let camStream       = null;
let camFilterActive = 'none';

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
async function init() {
  setNotice('connecting', '🔌 Đang kết nối database...');
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    setNotice('ok', '🌐 Đã kết nối! Bài đăng được chia sẻ với mọi người.');
    startRealtime();
    setupDragDrop();
  } catch (e) {
    console.error(e);
    setNotice('error', '❌ Lỗi kết nối Firebase. Kiểm tra lại config trong app.js.');
  }
}

// ── Realtime listener
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

// ══════════════════════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════════════════════
function renderAll() {
  renderStats(); renderTabs(); renderPosts();
  if (curDet && posts.find(p => p.id === curDet)) renderDet();
}

function renderStats() {
  const tc = posts.reduce((s,p)=>s+(p.comments?.length||0),0);
  const tl = posts.reduce((s,p)=>s+(p.likes||0),0);
  document.getElementById('statsBar').innerHTML = `
    <div class="si">📝 <span class="sn">${posts.length}</span> bài viết</div>
    <div class="si">💬 <span class="sn">${tc}</span> bình luận</div>
    <div class="si">❤️ <span class="sn">${tl}</span> lượt thích</div>
    <div class="si" style="margin-left:auto;color:#1D9E75;font-weight:800;font-size:.72rem">🔴 Trực tiếp</div>`;
}

function renderTabs() {
  const h = [`<button class="tab ${selTab==='all'?'active':''}" onclick="sTab('all')">Tất cả (${posts.length})</button>`];
  CATS.forEach(c => {
    const n = posts.filter(p=>p.cat===c.id).length;
    if (n) h.push(`<button class="tab ${selTab===c.id?'active':''}" onclick="sTab('${c.id}')">${c.icon} ${c.name} (${n})</button>`);
  });
  document.getElementById('tabsEl').innerHTML = h.join('');
}
window.sTab = id => { selTab = id; renderAll(); };

function getFiltered() {
  const q = (document.getElementById('si')?.value||'').toLowerCase();
  return posts
    .filter(p => selTab==='all' || p.cat===selTab)
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
  g.innerHTML = list.map((p,i) => {
    const c   = GC(p.cat);
    const ts  = p.time?.toMillis ? p.time.toMillis() : (p.time||0);
    const isNew = now - ts < 3_600_000 * 3;
    const ex  = (p.content||'').replace(/\n/g,' ').slice(0,112) + (p.content?.length>112?'…':'');
    const av  = (p.author||'AN').trim().slice(0,2).toUpperCase();
    const liked = localStorage.getItem('lk_'+p.id);
    const imgHtml   = p.imageUrl ? `<img class="c-img" src="${esc(p.imageUrl)}" alt="ảnh" loading="lazy">` : '';
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
        <div class="ctitle">${esc(p.title||'')}</div>
        <div class="cex">${esc(ex)}</div>
        ${musicHtml}
      </div>
      <div class="cfoot">
        <div class="auth">
          <div class="av" style="background:${c.bg};color:${c.color}">${av}</div>
          <span class="an">${esc(p.author||'Ẩn danh')}</span>
        </div>
        <div class="acts">
          <button class="ab" style="${liked?'color:#E24B4A':''}" onclick="doLike(event,'${p.id}')">❤️ ${p.likes||0}</button>
          <span class="ab" style="color:#378ADD">💬 ${p.comments?.length||0}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Like
window.doLike = async (e, id) => {
  e.stopPropagation();
  const k = 'lk_'+id, already = localStorage.getItem(k);
  try {
    await updateDoc(doc(db,'posts',id), { likes: increment(already?-1:1) });
    already ? localStorage.removeItem(k) : localStorage.setItem(k,'1');
  } catch(err) { showT('Lỗi! Thử lại nhé.'); }
};

// ══════════════════════════════════════════════════════════════
//  DETAIL
// ══════════════════════════════════════════════════════════════
window.openDet = id => {
  curDet = id; renderDet();
  document.getElementById('detOv').classList.add('show');
  document.body.style.overflow = 'hidden';
};
window.closeDet = () => {
  // stop embedded music iframe when closing
  const fr = document.getElementById('detMusicFrame');
  if (fr) fr.src = fr.src; // reset
  document.getElementById('detOv').classList.remove('show');
  document.body.style.overflow = '';
  curDet = null;
};
window.cDOut = e => { if (e.target===document.getElementById('detOv')) closeDet(); };

function renderDet() {
  const p = posts.find(x=>x.id===curDet);
  if (!p) return;
  const c  = GC(p.cat);
  const ts = p.time?.toMillis ? p.time.toMillis() : (p.time||0);
  const av = (p.author||'AN').trim().slice(0,2).toUpperCase();

  const cmts = (p.comments||[]).map(cm=>`
    <div class="ci2">
      <div class="av" style="background:${c.bg};color:${c.color};width:28px;height:28px;font-size:.66rem;flex-shrink:0">${(cm.author||'AN').slice(0,2).toUpperCase()}</div>
      <div class="cb">
        <div class="cau" style="color:${c.color}">${esc(cm.author||'Ẩn danh')}</div>
        <div class="ctx">${esc(cm.text||'')}</div>
        <div class="ctm">${ago(cm.time||0)}</div>
      </div>
    </div>`).join('');

  // Image block with download button
  const imgHtml = p.imageUrl ? `
    <img src="${esc(p.imageUrl)}" class="d-img" alt="ảnh bài">
    <div style="padding:0 1.3rem .6rem">
      <button class="dl-btn" onclick="downloadImage('${esc(p.imageUrl)}')">⬇️ Tải ảnh về</button>
    </div>` : '';

  // Music block — dùng iframe embed thay vì YT API
  let musicHtml = '';
  if (p.musicUrl) {
    const vid = extractVideoId(p.musicUrl);
    if (vid) {
      musicHtml = `
        <div class="d-music">
          <div class="d-music-info">
            <div class="d-music-title">🎵 Nhạc kèm theo bài</div>
            <div class="d-music-sub">Nhấn ▶ để phát nhạc</div>
          </div>
          <button class="d-music-btn" onclick="toggleDetMusic('${vid}',this)">▶ Phát</button>
        </div>
        <div id="detMusicContainer" style="display:none;padding:0 1.3rem .8rem">
          <iframe id="detMusicFrame"
            width="100%" height="80"
            src=""
            frameborder="0"
            allow="autoplay; encrypted-media"
            allowfullscreen
            style="border-radius:10px;display:block">
          </iframe>
        </div>`;
    }
  }

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

// Toggle music in detail panel — multi source
window.toggleDetMusic = (rawUrl, btn) => {
  const container = document.getElementById('detMusicContainer');
  const frame     = document.getElementById('detMusicFrame');
  if (container.style.display === 'none') {
    const type = detectMusicType(rawUrl);
    if (type === 'soundcloud') {
      const encoded = encodeURIComponent(rawUrl);
      frame.src = `https://w.soundcloud.com/player/?url=${encoded}&color=%237F77DD&auto_play=true&hide_related=true&show_comments=false&show_user=false`;
    } else {
      // YouTube or fallback
      const vid = extractVideoId(rawUrl);
      if (vid) {
        frame.src = `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1`;
      } else {
        showT('❌ Không nhận ra link nhạc này!'); return;
      }
    }
    container.style.display = 'block';
    btn.textContent = '⏹ Dừng';
  } else {
    frame.src = '';
    container.style.display = 'none';
    btn.textContent = '▶ Phát';
  }
};

// Download image — fetch as blob to trigger real download
window.downloadImage = async (url) => {
  try {
    showT('⏳ Đang tải ảnh...', 2000);
    const res  = await fetch(url);
    const blob = await res.blob();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'goc-hoc-tro-anh.jpg';
    a.click();
    URL.revokeObjectURL(a.href);
    showT('✅ Đã tải ảnh về!', 2000);
  } catch(e) {
    // fallback: open in new tab
    window.open(url, '_blank');
  }
};

window.doCmt = async () => {
  const author = document.getElementById('cA')?.value.trim()||'';
  const text   = document.getElementById('cTx')?.value.trim()||'';
  if (!author||!text) { showT('Nhập tên và bình luận nhé!'); return; }
  const btn = document.getElementById('cBtn');
  btn.disabled=true; btn.textContent='...';
  try {
    await updateDoc(doc(db,'posts',curDet), { comments: arrayUnion({ author, text, time:Date.now() }) });
    document.getElementById('cTx').value='';
    showT('💬 Đã đăng bình luận!');
  } catch(e) { showT('Lỗi! Thử lại.'); }
  btn.disabled=false; btn.textContent='Gửi';
};

// ══════════════════════════════════════════════════════════════
//  NEW POST
// ══════════════════════════════════════════════════════════════
function buildCG() {
  document.getElementById('catGrid').innerHTML = CATS.map(c=>`
    <div class="co ${selCat===c.id?'sel':''}" onclick="pCat('${c.id}')">
      <div class="ci">${c.icon}</div>
      <div class="cn">${c.name}</div>
    </div>`).join('');
}
window.pCat = id => { selCat=id; buildCG(); };

window.openNew = () => {
  if (!db) { showT('⚠️ Chưa kết nối Firebase!'); return; }
  selCat=null; buildCG();
  document.getElementById('newOv').classList.add('show');
  document.body.style.overflow='hidden';
};
window.closeNew = () => {
  document.getElementById('newOv').classList.remove('show');
  document.body.style.overflow='';
  resetForm();
};
function resetForm() {
  ['pT','pC','pA','pMusic'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('tc').textContent='0';
  document.getElementById('cc2').textContent='0';
  selCat=null; buildCG();
  clearImg();
}
window.upC = (src,out) => {
  document.getElementById(out).textContent = document.getElementById(src).value.length;
};

window.doSubmit = async () => {
  const title    = document.getElementById('pT').value.trim();
  const content  = document.getElementById('pC').value.trim();
  const author   = document.getElementById('pA').value.trim() || 'Ẩn danh';
  const musicUrl = document.getElementById('pMusic').value.trim();
  if (!title)   { showT('Vui lòng nhập tiêu đề!'); return; }
  if (!content) { showT('Vui lòng nhập nội dung!'); return; }
  if (!selCat)  { showT('Vui lòng chọn danh mục!'); return; }

  // Validate music URL
  if (musicUrl && !extractVideoId(musicUrl)) {
    showT('⚠️ Link nhạc không hợp lệ! Phải là link YouTube.'); return;
  }

  const btn = document.getElementById('subBtn');
  btn.disabled=true; btn.textContent='⏳ Đang đăng...';

  // ── Ảnh: lưu base64 đã compress thẳng vào Firestore
  //    (tránh phụ thuộc Storage rules / CORS)
  let imageUrl = '';
  if (finalImageDataUrl) {
    // Compress xuống ~400px để vừa giới hạn Firestore (1MB/doc)
    imageUrl = await compressToBase64(finalImageDataUrl, 480, 0.75);
  }

  try {
    await addDoc(collection(db,'posts'), {
      title, content, author, cat: selCat,
      likes:0, comments:[], pinned:false,
      imageUrl: imageUrl || '',
      musicUrl: musicUrl || '',
      time: serverTimestamp()
    });
    closeNew();
    showT('🎉 Đã đăng bài! Mọi người đều thấy rồi!', 3000);
  } catch(e) {
    console.error(e);
    if (e.message?.includes('exceeds')) {
      showT('❌ Ảnh quá lớn! Thử ảnh nhỏ hơn.');
    } else {
      showT('❌ Lỗi đăng bài. Kiểm tra kết nối và Firestore rules.');
    }
  }
  btn.disabled=false; btn.textContent='📌 Đăng bài ngay';
};

// Compress image to base64 with max width
function compressToBase64(dataUrl, maxW, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale  = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

// ══════════════════════════════════════════════════════════════
//  IMAGE / CAMERA
// ══════════════════════════════════════════════════════════════
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
  // Warn if too big
  if (file.size > 10 * 1024 * 1024) { showT('⚠️ Ảnh quá lớn (>10MB)! Chọn ảnh nhỏ hơn.'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    rawImageDataUrl   = ev.target.result;
    finalImageDataUrl = rawImageDataUrl;
    currentFilter     = 'none';
    showImgPreview(finalImageDataUrl);
    showT('✅ Đã chọn ảnh! Bấm ✨ Filter để chỉnh.');
  };
  reader.readAsDataURL(file);
}

function showImgPreview(url) {
  const prev = document.getElementById('imgPreview');
  const ph   = document.getElementById('izPlaceholder');
  prev.src = url; prev.style.display = 'block';
  if (ph) ph.style.display = 'none';
  document.getElementById('filterBtn').style.display = '';
  document.getElementById('delImgBtn').style.display = '';
}

window.clearImg = () => {
  rawImageDataUrl=null; finalImageDataUrl=null; currentFilter='none';
  const prev = document.getElementById('imgPreview');
  if (prev) { prev.src=''; prev.style.display='none'; }
  const ph = document.getElementById('izPlaceholder');
  if (ph) ph.style.display='';
  const fb = document.getElementById('filterBtn');
  if (fb) fb.style.display='none';
  const db2 = document.getElementById('delImgBtn');
  if (db2) db2.style.display='none';
  const fi = document.getElementById('fileInput');
  if (fi) fi.value='';
};

// ── Camera
window.openCam = async () => {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:{ideal:640} } });
    document.getElementById('camVideo').srcObject = camStream;
    camFilterActive = 'none';
    document.getElementById('camVideo').style.filter = 'none';
    document.querySelectorAll('.cf-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
    document.getElementById('camOv').classList.add('show');
  } catch(e) {
    console.error(e);
    showT('❌ Không truy cập được camera. Kiểm tra quyền trình duyệt.');
  }
};
window.closeCam = () => {
  if (camStream) { camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
  document.getElementById('camVideo').srcObject = null;
  document.getElementById('camOv').classList.remove('show');
};

const CAM_FILTER_CSS = {
  none:   'none',
  warm:   'sepia(.4) saturate(1.4) hue-rotate(-10deg)',
  cool:   'saturate(.8) hue-rotate(20deg) brightness(1.05)',
  dreamy: 'brightness(1.1) saturate(.7) contrast(.9)',
  retro:  'sepia(.6) contrast(1.1) saturate(.8)',
  bw:     'grayscale(1)'
};
window.setFilter = (btn, name) => {
  camFilterActive = name;
  document.getElementById('camVideo').style.filter = CAM_FILTER_CSS[name]||'none';
  document.querySelectorAll('.cf-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
};

window.capturePhoto = () => {
  const video = document.getElementById('camVideo');
  if (!video.srcObject) { showT('Camera chưa sẵn sàng!'); return; }
  const canvas = document.getElementById('camCanvas');
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  // Apply CSS filter via canvas filter
  ctx.filter = CAM_FILTER_CSS[camFilterActive] || 'none';
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  rawImageDataUrl   = canvas.toDataURL('image/jpeg', .92);
  finalImageDataUrl = rawImageDataUrl;
  currentFilter     = camFilterActive;
  closeCam();
  showImgPreview(finalImageDataUrl);
  showT('📸 Đã chụp! Bạn có thể thêm filter.');
};

// ── Filter modal
window.openFilter = () => {
  if (!rawImageDataUrl) return;
  const canvas = document.getElementById('filterCanvas');
  _drawFiltered(rawImageDataUrl, canvas, currentFilter, () => {
    _renderFilterPreviews();
    // Highlight active btn
    document.querySelectorAll('.fg-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('onclick').includes(`'${currentFilter}'`));
    });
    document.getElementById('filterOv').classList.add('show');
  });
};
window.closeFilter = () => { document.getElementById('filterOv').classList.remove('show'); };

// Filter implementations (pixel-level on canvas)
const FILTER_FNS = {
  none:   (img,ctx,w,h) => { ctx.drawImage(img,0,0,w,h); },
  warm:   (img,ctx,w,h) => {
    ctx.drawImage(img,0,0,w,h);
    const d=ctx.getImageData(0,0,w,h);
    for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.min(255,d.data[i]*1.15);d.data[i+2]=Math.max(0,d.data[i+2]*.85);}
    ctx.putImageData(d,0,0);
  },
  cool:   (img,ctx,w,h) => {
    ctx.drawImage(img,0,0,w,h);
    const d=ctx.getImageData(0,0,w,h);
    for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.max(0,d.data[i]*.88);d.data[i+2]=Math.min(255,d.data[i+2]*1.18);}
    ctx.putImageData(d,0,0);
  },
  dreamy: (img,ctx,w,h) => {
    ctx.drawImage(img,0,0,w,h);
    const d=ctx.getImageData(0,0,w,h);
    for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.min(255,d.data[i]*.85+30);d.data[i+1]=Math.min(255,d.data[i+1]*.85+20);d.data[i+2]=Math.min(255,d.data[i+2]*.9+30);}
    ctx.putImageData(d,0,0);
    ctx.fillStyle='rgba(255,200,220,.18)'; ctx.fillRect(0,0,w,h);
  },
  retro:  (img,ctx,w,h) => {
    ctx.drawImage(img,0,0,w,h);
    const d=ctx.getImageData(0,0,w,h);
    for(let i=0;i<d.data.length;i+=4){
      const r=d.data[i],g=d.data[i+1],b=d.data[i+2];
      d.data[i]  =Math.min(255,r*.393+g*.769+b*.189);
      d.data[i+1]=Math.min(255,r*.349+g*.686+b*.168);
      d.data[i+2]=Math.min(255,r*.272+g*.534+b*.131);
    }
    ctx.putImageData(d,0,0);
    ctx.fillStyle='rgba(180,130,60,.12)'; ctx.fillRect(0,0,w,h);
  },
  bw:     (img,ctx,w,h) => {
    ctx.drawImage(img,0,0,w,h);
    const d=ctx.getImageData(0,0,w,h);
    for(let i=0;i<d.data.length;i+=4){const g=d.data[i]*.3+d.data[i+1]*.59+d.data[i+2]*.11;d.data[i]=d.data[i+1]=d.data[i+2]=g;}
    ctx.putImageData(d,0,0);
  },
};

function _drawFiltered(dataUrl, canvas, filterName, cb) {
  const img = new Image();
  img.onload = () => {
    const scale   = Math.min(1, 560/img.width, 700/img.height);
    canvas.width  = Math.round(img.width  * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    (FILTER_FNS[filterName] || FILTER_FNS.none)(img, ctx, canvas.width, canvas.height);
    if (cb) cb();
  };
  img.src = dataUrl;
}

function _renderFilterPreviews() {
  Object.keys(FILTER_FNS).forEach(name => {
    const el = document.getElementById('fp_'+name);
    if (!el) return;
    const c2 = document.createElement('canvas');
    c2.width=60; c2.height=45;
    const img = new Image();
    img.onload = () => {
      const ctx = c2.getContext('2d');
      (FILTER_FNS[name]||FILTER_FNS.none)(img, ctx, 60, 45);
      el.style.backgroundImage = `url(${c2.toDataURL()})`;
      el.style.backgroundSize  = 'cover';
      el.style.backgroundPosition = 'center';
    };
    img.src = rawImageDataUrl;
  });
}

window.applyFilter = (btn, name) => {
  currentFilter = name;
  _drawFiltered(rawImageDataUrl, document.getElementById('filterCanvas'), name, null);
  document.querySelectorAll('.fg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
};

window.confirmFilter = () => {
  const canvas = document.getElementById('filterCanvas');
  finalImageDataUrl = canvas.toDataURL('image/jpeg', .92);
  showImgPreview(finalImageDataUrl);
  closeFilter();
  showT('✨ Đã áp dụng filter!');
};

// ══════════════════════════════════════════════════════════════
//  MUSIC — multi-source player (MP3 / SoundCloud / YouTube)
// ══════════════════════════════════════════════════════════════
window.openMusicBar = () => {
  document.getElementById('musicBar').classList.toggle('open');
};
window.toggleMusicHelp = () => {
  const el = document.getElementById('musicHelp');
  el.style.display = el.style.display === 'none' ? '' : 'none';
};

// Detect URL type
function detectMusicType(url) {
  if (!url) return null;
  if (/soundcloud\.com\//i.test(url))  return 'soundcloud';
  if (/youtu\.be\/|youtube\.com\//i.test(url)) return 'youtube';
  if (/\.(mp3|ogg|wav|aac|m4a)(\?|$)/i.test(url)) return 'mp3';
  // Google Drive / Dropbox direct links
  if (/drive\.google\.com|dropbox\.com|githubusercontent\.com/i.test(url)) return 'mp3';
  return null;
}

function extractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

function stopAllMusic() {
  // Stop HTML5 audio
  const audio = document.getElementById('audioPlayer');
  if (audio) { audio.pause(); audio.src = ''; }
  // Stop SoundCloud
  const scFrame = document.getElementById('scFrame');
  if (scFrame) { scFrame.src = ''; document.getElementById('scContainer').style.display = 'none'; }
  // Stop YouTube hidden
  const yt = document.getElementById('ytHidden');
  if (yt) yt.innerHTML = '';
}

window.loadMusic = () => {
  const raw = document.getElementById('musicInput').value.trim();
  if (!raw) { showT('Dán link nhạc vào nhé!'); return; }
  const type = detectMusicType(raw);

  stopAllMusic();

  if (type === 'mp3') {
    // Convert known drive/dropbox links to direct
    let src = raw;
    // Google Drive: /file/d/ID/view → /uc?export=download&id=ID
    src = src.replace(/drive\.google\.com\/file\/d\/([^/]+)\/.*/, 'drive.google.com/uc?export=download&id=$1');
    // Dropbox: ?dl=0 → ?raw=1
    src = src.replace('dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0','').replace('?dl=1','');

    const audio = document.getElementById('audioPlayer');
    audio.src  = src;
    audio.loop = true;
    audio.play().then(() => {
      showT('🎵 Đang phát nhạc MP3!', 2000);
    }).catch(() => {
      showT('❌ Không phát được! Link phải là file MP3 trực tiếp.');
    });

  } else if (type === 'soundcloud') {
    const encoded = encodeURIComponent(raw);
    const scSrc = `https://w.soundcloud.com/player/?url=${encoded}&color=%237F77DD&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false`;
    document.getElementById('scFrame').src = scSrc;
    document.getElementById('scContainer').style.display = '';
    showT('🎵 Đang phát SoundCloud!', 2000);

  } else if (type === 'youtube') {
    const vid = extractVideoId(raw);
    if (!vid) { showT('❌ Không lấy được ID video YouTube!'); return; }
    // Dùng youtube-nocookie để giảm tracking, nhưng vẫn có thể có quảng cáo
    document.getElementById('ytHidden').innerHTML =
      `<iframe src="https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&loop=1&playlist=${vid}&rel=0&modestbranding=1"
        width="1" height="1" frameborder="0" allow="autoplay;encrypted-media"></iframe>`;
    showT('🎵 Phát YouTube (có thể có quảng cáo)', 3000);

  } else {
    showT('❌ Link không hợp lệ! Thử link MP3 hoặc SoundCloud.');
  }
};

window.stopMusic = () => {
  stopAllMusic();
  showT('⏹ Đã dừng nhạc.', 1500);
};

// Play music triggered from post detail
window.playMusicFromPost = (url) => {
  document.getElementById('musicInput').value = url;
  document.getElementById('musicBar').classList.add('open');
  loadMusic();
};

// ══════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════
function setNotice(type, msg) {
  const el = document.getElementById('dbNotice');
  el.className = `notice ${type}`;
  el.textContent = msg;
}
function showT(msg, dur=2700) {
  const t = document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.classList.remove('show'), dur);
}
function ago(ts) {
  const ms = typeof ts==='number' ? ts : (ts?.toMillis?.()||0);
  const d  = (Date.now()-ms)/1000;
  if (d<60)    return 'Vừa xong';
  if (d<3600)  return Math.floor(d/60)+' phút trước';
  if (d<86400) return Math.floor(d/3600)+' giờ trước';
  return Math.floor(d/86400)+' ngày trước';
}

// Modal backdrop clicks
document.getElementById('newOv').onclick    = e => { if(e.target===document.getElementById('newOv'))    closeNew(); };
document.getElementById('camOv').onclick    = e => { if(e.target===document.getElementById('camOv'))    closeCam(); };
document.getElementById('filterOv').onclick = e => { if(e.target===document.getElementById('filterOv')) closeFilter(); };

init();