/* ─────────────────────────────────────────────────────────
   연경 오피스 · 실시간 협업 데스크
   Firebase Realtime Database + Anonymous Auth
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ── Firebase 설정 ───────────────────────────── */
  const CFG = {
    apiKey: "AIzaSyAyvAyhe5B5rDEnWrSFCrrNyJs8SybsVzc",
    authDomain: "yeonkyung-office.firebaseapp.com",
    databaseURL: "https://yeonkyung-office-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "yeonkyung-office",
    storageBucket: "yeonkyung-office.firebasestorage.app",
    messagingSenderId: "173905251019",
    appId: "1:173905251019:web:2cdfec16c352350ec5694e"
  };

  firebase.initializeApp(CFG);
  const auth = firebase.auth();
  const db = firebase.database();
  const TS = firebase.database.ServerValue.TIMESTAMP;

  /* ── AI 자동응답 (Cloudflare Worker 프록시 → 무료 Gemini) ──
     API 키는 Worker 서버에만 있고 브라우저로 내려오지 않습니다. */
  const AI_ENGINE = {
    proxy: 'https://yk-gemini.yeonkyung-office.workers.dev/',
    contextSize: 14,      // 방에서 함께 보낼 최근 메시지 수
    maxPerMessage: 2,     // 한 메시지에 최대 몇 명까지 답할지
    timeoutMs: 45000,
    allGapMs: 600,        // 전원응답 시 AI 사이 호출 간격(429 방지)
    maxImages: 2          // 한 번에 AI에게 보여 줄 사진 장수
  };

  const APP_VERSION = '19';
  const DEFAULT_AI = 'hyuni';            // 멘션이 없을 때 먼저 답하는 기본 비서
  const ALL_RE = /@\s?(all|전체|모두|전원)/i;

  /* ── 첨부(사진·파일) 설정 ───────────────────── */
  const ATT = {
    maxEdge: 1280,        // 이미지 긴 쪽 최대 px
    quality: 0.8,         // JPEG 품질
    maxFileBytes: 2 * 1024 * 1024,   // 일반 파일 2MB까지
    maxItems: 6           // 한 메시지에 붙일 수 있는 개수
  };

  /* ── 고정 데이터 ─────────────────────────────── */
  const ROOMS = [
    { id: 'council', emoji: '🏛️', name: '대회의실', color: '#c08a3e', desc: '가게 · 법무 · 홍보 전원이 함께 보는 회의방' },
    { id: 'command', emoji: '💙', name: '지휘실',   color: '#3b6fd4', desc: '대표님 지시와 결재만 모아 두는 방' },
    { id: 'lounge',  emoji: '🟣', name: '라운지',   color: '#8b5cf6', desc: '편하게 이야기하는 자리' }
  ];
  const ROOM_MAP = {}; ROOMS.forEach(r => (ROOM_MAP[r.id] = r));

  const PALETTE = ['#c2603f', '#3b6fd4', '#2f9e63', '#8b5cf6', '#b8562f', '#2f8f9d', '#c08a3e', '#7a5cc0', '#d1653f', '#1e8a7a'];

  const DEFAULT_MEMBERS = [
    { id: 'yeonkyung', emoji: '👑', name: '연경 대표님', role: '대표님 · 총괄',        pin: '1221', color: '#b0641f', kind: 'human', order: 1 },
    { id: 'hyuni',     emoji: '🐰', name: '혀니',        role: '피클 AI · 메인 비서',  pin: '1004', color: '#d1653f', kind: 'ai',    order: 2 },
    { id: 'chatgpt',   emoji: '🤖', name: 'ChatGPT',     role: '기획 · 아이디어',      pin: '2401', color: '#0f9d76', kind: 'ai',    order: 3 },
    { id: 'gemini',    emoji: '✨', name: '제미나이',     role: '리서치 · 자료',        pin: '2402', color: '#3b6fd4', kind: 'ai',    order: 4 },
    { id: 'claude',    emoji: '🧠', name: '클로드',       role: '분석 · 문서',          pin: '2403', color: '#b8562f', kind: 'ai',    order: 5 },
    { id: 'metaai',    emoji: '🎨', name: 'Meta AI',     role: '이미지 · 시안',        pin: '2404', color: '#7a5cc0', kind: 'ai',    order: 6 },
    { id: 'dola',      emoji: '💬', name: 'Dola',        role: '일정 · 어시스턴트',    pin: '2405', color: '#2f8f9d', kind: 'ai',    order: 7 },
    { id: 'runyoung',  emoji: '⚡', name: 'Runyoung',     role: '스페셜 멤버',          pin: '2406', color: '#8d8377', kind: 'ai',    order: 8 }
  ];

  const SEEDS = {
    council: [
      {
        id: 'seed-c1', memberId: 'hyuni',
        text: '대표님, 연경 오피스 문 열었습니다. 🏛️\n여기서 가게 · 법무 · 홍보 일을 한자리에서 봅니다.\n급한 건은 @연경 대표님 처럼 @로 불러 주세요.',
        reactions: { '❤️': { gemini: true } }
      },
      {
        id: 'seed-c2', memberId: 'gemini',
        text: '자료 조사가 필요하면 @제미나이 로 불러 주세요. 찾은 내용은 출처와 함께 이 방에 정리해 두겠습니다.',
        replyTo: { id: 'seed-c1', memberId: 'hyuni', text: '대표님, 연경 오피스 문 열었습니다. 🏛️ 여기서 가게 · 법무 · 홍보 일을 한자리에서 봅니다.' }
      }
    ],
    command: [
      {
        id: 'seed-k1', memberId: 'hyuni',
        text: '지휘실은 대표님 지시와 결재만 모으는 방입니다. 💙\n매일 저녁, 오늘 처리한 일과 내일 할 일을 정리해 올리겠습니다.'
      },
      {
        id: 'seed-k2', memberId: 'claude',
        text: '계약서 · 서면 검토는 @클로드 에게 주세요. 초안을 이 방에 붙여 두겠습니다.',
        replyTo: { id: 'seed-k1', memberId: 'hyuni', text: '지휘실은 대표님 지시와 결재만 모으는 방입니다. 💙' }
      }
    ],
    lounge: [
      { id: 'seed-l1', memberId: 'hyuni', text: '라운지는 편하게 이야기하는 자리입니다. ☕\n가게 얘기, 가족 얘기, 아무 얘기나 좋습니다.' },
      { id: 'seed-l2', memberId: 'metaai', text: '시안 · 이미지가 필요하면 말씀 주세요. 🎨', reactions: { '👍': { hyuni: true } } }
    ]
  };

  const LS_ID = 'yk_office_id';
  const LS_SEEN = 'yk_office_seen';

  /* ── 상태 ─────────────────────────────────────── */
  const state = {
    members: {}, list: [], presence: {}, rooms: {}, typing: {},
    me: null, room: 'council', reply: null, pendingId: null,
    seen: {}, booted: false, connected: true,
    pending: [],            // 보내기 전에 붙여 둔 첨부
    fileCache: {},          // 첨부 id → data URL
    fileLoading: {}
  };
  window.__yk = state;

  /* ── 유틸 ─────────────────────────────────────── */
  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pad2 = n => (n < 10 ? '0' : '') + n;

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function dayLabel(ts) {
    const d = new Date(ts), now = new Date();
    const k = dayKey(ts), tk = dayKey(now.getTime());
    const y = new Date(now.getTime() - 86400000);
    if (k === tk) return '오늘';
    if (k === dayKey(y.getTime())) return '어제';
    const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + w + ')';
  }
  function fmtLastSeen(ts) {
    if (!ts) return '오프라인';
    const diff = Date.now() - ts;
    if (diff < 1000 * 60) return '방금 전';
    if (diff < 1000 * 60 * 60) return Math.floor(diff / 60000) + '분 전';
    if (diff < 1000 * 60 * 60 * 24) return Math.floor(diff / 3600000) + '시간 전';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + fmtTime(ts);
  }
  function initials(m) { return m && m.emoji ? m.emoji : '🙂'; }
  function memberById(id) { return state.members[id] || null; }
  function memberColor(id) { const m = memberById(id); return (m && m.color) || '#8d8377'; }
  function memberName(id) { const m = memberById(id); return m ? m.name : '알 수 없음'; }

  function isOnline(id) {
    const p = state.presence[id];
    if (!p) return false;
    const s = p.sessions || {};
    const now = Date.now();
    return Object.keys(s).some(k => s[k] && (!s[k].ts || now - s[k].ts < 180000));
  }

  function toast(msg) {
    const t = el('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function copyText(text, okMsg) {
    const done = () => toast(okMsg || '복사했습니다');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('복사에 실패했습니다. 길게 눌러 복사해 주세요.'); }
    document.body.removeChild(ta);
  }

  /* ── 첨부(사진·파일) 도우미 ─────────────────── */
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function normFiles(f) {
    if (!f) return [];
    if (Array.isArray(f)) return f.filter(Boolean);
    return Object.keys(f).map(k => f[k]).filter(Boolean);
  }
  function sizeLabel(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + 'B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + 'KB';
    return (n / (1024 * 1024)).toFixed(1) + 'MB';
  }
  function isImageFile(f) { return !!(f && /^image\//.test(f.type || '')); }
  function readAsDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result || ''));
      r.onerror = () => rej(r.error || new Error('read_failed'));
      r.readAsDataURL(file);
    });
  }
  function loadImageEl(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('decode_failed'));
      img.src = src;
    });
  }
  async function compressImage(file) {
    const raw = await readAsDataURL(file);
    const img = await loadImageEl(raw);
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error('no_size');
    const scale = Math.min(1, ATT.maxEdge / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    let out = cv.toDataURL('image/jpeg', ATT.quality);
    if (!out || out.length < 40) out = raw;
    return { data: out, w: w, h: h, type: 'image/jpeg' };
  }
  function dataUrlBytes(d) {
    const i = String(d || '').indexOf(',');
    if (i < 0) return String(d || '').length;
    return Math.floor((String(d).length - i - 1) * 0.75);
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    for (const f of files) {
      if (state.pending.length >= ATT.maxItems) { toast('첨부는 한 번에 ' + ATT.maxItems + '개까지입니다'); break; }
      const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      try {
        if (isImageFile(f)) {
          let c;
          try { c = await compressImage(f); }
          catch (e) {
            if (f.size > ATT.maxFileBytes) { toast('사진을 읽지 못했습니다: ' + f.name); continue; }
            c = { data: await readAsDataURL(f), w: 0, h: 0, type: f.type || 'image/*' };
          }
          state.pending.push({
            id: id, kind: 'image', name: f.name || ('사진-' + Date.now() + '.jpg'),
            type: c.type, size: dataUrlBytes(c.data), w: c.w, h: c.h, data: c.data
          });
        } else {
          if (f.size > ATT.maxFileBytes) { toast('파일은 2MB까지 올릴 수 있어요: ' + f.name); continue; }
          state.pending.push({
            id: id, kind: 'file', name: f.name || '파일', type: f.type || '',
            size: f.size, w: 0, h: 0, data: await readAsDataURL(f)
          });
        }
      } catch (e) {
        console.warn('attach fail', f && f.name, e);
        toast('첨부하지 못했습니다: ' + ((f && f.name) || '파일'));
      }
    }
    renderPending();
  }

  function fileIcon(name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📕';
    if (['doc', 'docx', 'hwp', 'hwpx', 'txt', 'rtf'].indexOf(ext) >= 0) return '📄';
    if (['xls', 'xlsx', 'csv'].indexOf(ext) >= 0) return '📊';
    if (['zip', 'rar', '7z'].indexOf(ext) >= 0) return '🗜️';
    if (['ppt', 'pptx'].indexOf(ext) >= 0) return '📽️';
    return '📎';
  }

  function renderPending() {
    const strip = el('attach-strip');
    const btn = el('btn-attach');
    strip.innerHTML = '';
    if (!state.pending.length) { strip.classList.add('hidden'); btn.classList.remove('has'); return; }
    strip.classList.remove('hidden'); btn.classList.add('has');
    state.pending.forEach((a, i) => {
      const chip = document.createElement('div');
      chip.className = 'att-chip';
      chip.innerHTML =
        (a.kind === 'image'
          ? '<img class="thumb" src="' + esc(a.data) + '" alt="">'
          : '<span class="fic">' + fileIcon(a.name) + '</span>') +
        '<span class="c-info"><span class="c-nm">' + esc(a.name) + '</span>' +
        '<span class="c-sz">' + esc(sizeLabel(a.size)) + '</span></span>' +
        '<button class="c-x" type="button" aria-label="빼기">✕</button>';
      chip.querySelector('.c-x').addEventListener('click', () => { state.pending.splice(i, 1); renderPending(); });
      strip.appendChild(chip);
    });
  }

  function getFileData(id) {
    if (!id) return Promise.resolve('');
    if (state.fileCache[id]) return Promise.resolve(state.fileCache[id]);
    if (state.fileLoading[id]) return state.fileLoading[id];
    const p = db.ref('files/' + id + '/data').once('value')
      .then(s => { const v = String(s.val() || ''); if (v) state.fileCache[id] = v; return v; })
      .catch(() => '')
      .then(v => { delete state.fileLoading[id]; return v; });
    state.fileLoading[id] = p;
    return p;
  }

  function dataUrlToBlob(d) {
    const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(d || ''));
    if (!m) return null;
    const mime = m[1] || 'application/octet-stream';
    const body = m[3] || '';
    try {
      if (m[2]) {
        const bin = atob(body);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
      }
      return new Blob([decodeURIComponent(body)], { type: mime });
    } catch (e) { return null; }
  }

  function downloadAttachment(att) {
    return getFileData(att.id).then(d => {
      if (!d) { toast('파일을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.'); return; }
      const blob = dataUrlToBlob(d);
      if (!blob) { toast('파일을 열지 못했어요.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = att.name || 'download';
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 5000);
    });
  }

  let lbAtt = null;
  function openLightbox(att) {
    lbAtt = att;
    el('lb-name').textContent = att.name || '사진';
    const img = el('lb-img');
    img.src = '';
    el('lightbox').classList.remove('hidden');
    getFileData(att.id).then(d => {
      if (!d) { toast('사진을 불러오지 못했어요.'); return; }
      img.src = d;
    });
  }
  function closeLightbox() {
    el('lightbox').classList.add('hidden');
    el('lb-img').src = '';
    lbAtt = null;
  }

  /* ── 텍스트 렌더링 (URL · 멘션) ─────────────────── */
  function renderRichText(raw) {
    let out = esc(raw);
    out = out.replace(/(https?:\/\/[^\s<]+)/g, u => '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>');
    out = out.replace(/@(all|전체)/gi, '<span class="mention">@$1</span>');
    const sorted = state.list.slice().sort((a, b) => b.name.length - a.name.length);
    sorted.forEach(m => {
      if (!m.name) return;
      const re = new RegExp('@' + escRe(esc(m.name)), 'g');
      const cls = 'mention' + (state.me && m.id === state.me.id ? ' me' : '');
      let replaced = false;
      out = out.replace(re, () => { replaced = true; return '<span class="' + cls + '">@' + esc(m.name) + '</span>'; });
      if (!replaced) return;
    });
    return out;
  }

  /* ── 화면 전환 ────────────────────────────────── */
  let screen = 'boot';
  const trace = (window.__ykTrace = []);
  window.addEventListener('error', e => trace.push('ERR ' + e.message));

  function hideAll() {
    ['boot', 'login', 'app'].forEach(k => el(k).classList.add('hidden'));
  }
  function showBoot(msg) {
    screen = 'boot'; hideAll(); el('boot').classList.remove('hidden');
    if (msg) el('boot-msg').textContent = msg;
  }
  function showLogin(preselect) {
    screen = 'login'; hideAll(); el('login').classList.remove('hidden');
    renderLoginGrid();
    if (preselect && state.members[preselect]) pickMember(preselect);
    else { state.pendingId = null; showStep('pick'); }
  }
  function showStep(which) {
    el('step-pick').classList.toggle('hidden', which !== 'pick');
    el('step-pin').classList.toggle('hidden', which !== 'pin');
  }

  /* ── 로그인 ───────────────────────────────────── */
  function renderLoginGrid() {
    const grid = el('login-grid');
    grid.innerHTML = '';
    state.list.forEach(m => {
      const b = document.createElement('button');
      b.className = 'member-pick';
      b.innerHTML =
        '<span class="avatar" style="--c:' + esc(m.color || '#8d8377') + '">' + esc(initials(m)) + '</span>' +
        '<span><span class="nm">' + esc(m.name) + '</span><span class="rl">' + esc(m.role || '') + '</span></span>';
      b.addEventListener('click', () => pickMember(m.id));
      grid.appendChild(b);
    });
  }

  function pickMember(id) {
    const m = state.members[id];
    if (!m) return;
    state.pendingId = id;
    el('pin-avatar').textContent = initials(m);
    el('pin-avatar').style.setProperty('--c', m.color || '#8d8377');
    el('pin-name').textContent = m.name;
    el('pin-role').textContent = m.role || '';
    const inp = el('pin-input');
    inp.value = ''; inp.classList.remove('err');
    el('pin-hint').textContent = 'PIN을 잊으시면 혀니에게 “내 PIN 알려줘”라고 하시면 됩니다.';
    showStep('pin');
    setTimeout(() => inp.focus(), 60);
  }

  function tryPin() {
    const m = state.members[state.pendingId];
    trace.push('tryPin ' + state.pendingId + ' ' + (m ? 'found' : 'missing'));
    if (!m) return showLogin();
    const val = (el('pin-input').value || '').trim();
    if (val === String(m.pin || '').trim()) {
      localStorage.setItem(LS_ID, m.id);
      enterApp(m.id);
    } else {
      const inp = el('pin-input');
      inp.classList.add('err'); inp.value = '';
      el('pin-hint').textContent = 'PIN이 맞지 않습니다. 다시 입력하시거나 혀니에게 물어봐 주세요.';
      setTimeout(() => inp.classList.remove('err'), 400);
    }
  }

  /* ── 입장 / 퇴장 ──────────────────────────────── */
  function enterApp(id) {
    const m = state.members[id];
    trace.push('enterApp ' + id + ' ' + (m ? 'ok' : 'missing'));
    if (!m || !m.id) return showLogin();
    if (state.me && state.me.id === id && screen === 'app') return;
    state.me = m;
    state.reply = null;
    screen = 'app'; hideAll(); el('app').classList.remove('hidden');
    renderAll(true);
    goRoom(state.room, true);
    startPresence();
    setTimeout(() => { el('input').focus(); }, 150);
  }

  function logout() {
    const m = state.me;
    if (m) {
      db.ref('presence/' + m.id + '/sessions/' + SESSION_ID).remove().catch(() => {});
      db.ref('typing/' + state.room + '/' + m.id).remove().catch(() => {});
    }
    localStorage.removeItem(LS_ID);
    state.me = null; screen = 'boot';
    const base = location.origin + location.pathname;
    location.replace(base);
  }

  /* ── Presence ─────────────────────────────────── */
  let presenceTimer = null;
  const SESSION_ID = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function startPresence() {
    const m = state.me; if (!m) return;
    trace.push('presence start ' + m.id);
    const root = db.ref('presence/' + m.id);
    const sess = root.child('sessions/' + SESSION_ID);
    sess.onDisconnect().remove();
    const beat = () => {
      sess.set({ ts: Date.now(), name: m.name }).catch(e => trace.push('presence fail ' + e.code));
      root.update({ lastSeen: Date.now() }).catch(() => {});
    };
    beat();
    clearInterval(presenceTimer);
    presenceTimer = setInterval(beat, 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
    window.addEventListener('pagehide', () => { try { sess.remove(); } catch (e) {} });
  }

  /* ── 입력 중 표시 ──────────────────────────────── */
  let typingClearTimer = null, lastTypingWrite = 0;
  function signalTyping() {
    const m = state.me; if (!m) return;
    const now = Date.now();
    if (now - lastTypingWrite > 1200) {
      lastTypingWrite = now;
      const r = db.ref('typing/' + state.room + '/' + m.id);
      r.set({ name: m.name, ts: Date.now() }).catch(() => {});
      r.onDisconnect().remove();
    }
    clearTimeout(typingClearTimer);
    typingClearTimer = setTimeout(() => {
      db.ref('typing/' + state.room + '/' + m.id).remove().catch(() => {});
      lastTypingWrite = 0;
    }, 6000);
  }

  /* ── 방 이동 ──────────────────────────────────── */
  function goRoom(id, silent) {
    if (!ROOM_MAP[id]) id = 'council';
    if (state.me && state.room && state.room !== id) {
      db.ref('typing/' + state.room + '/' + state.me.id).remove().catch(() => {});
    }
    state.room = id;
    state.reply = null;
    renderReply();
    state.seen[id] = Date.now();
    saveSeen();
    renderTabs(); renderChatHead(); renderMessages(true); renderTyping(); renderSidebar();
    if (!silent) closePeople();
  }

  function saveSeen() { try { localStorage.setItem(LS_SEEN, JSON.stringify(state.seen)); } catch (e) {} }
  function loadSeen() { try { state.seen = JSON.parse(localStorage.getItem(LS_SEEN) || '{}') || {}; } catch (e) { state.seen = {}; } }

  /* ── 렌더: 전체 ────────────────────────────────── */
  function renderAll(forceBottom) {
    renderHeader(); renderTabs(); renderChatHead(); renderMessages(forceBottom); renderSidebar(); renderTyping();
    renderReply();
    if (state.me) el('me-chip').textContent = initials(state.me) + ' ' + state.me.name;
    const vt = el('ver-tag');
    if (vt) { vt.textContent = 'v' + APP_VERSION; vt.title = '앱 버전 v' + APP_VERSION; }
  }

  function renderHeader() {
    el('brand-sub').textContent = state.list.length + '인 오피스 · 실시간 협업 데스크';
    const on = state.list.filter(m => isOnline(m.id)).length;
    const pill = el('status-pill');
    if (!state.connected) {
      pill.className = 'status-pill off';
      pill.innerHTML = '<span class="dot"></span> 연결 중…';
    } else {
      pill.className = 'status-pill';
      pill.innerHTML = '<span class="dot"></span> ON <b>' + on + '</b>명';
    }
  }

  function renderTabs() {
    const wrap = el('tabs');
    wrap.innerHTML = '';
    ROOMS.forEach(r => {
      const msgs = (state.rooms[r.id] && state.rooms[r.id].messages) || {};
      const count = Object.keys(msgs).length;
      const seen = state.seen[r.id] || 0;
      const unread = Object.keys(msgs).filter(id => (msgs[id].ts || 0) > seen).length;
      const b = document.createElement('button');
      b.className = 'tab' + (state.room === r.id ? ' active' : '');
      b.style.setProperty('--rc', r.color);
      b.innerHTML = esc(r.emoji) + ' <span>' + esc(r.name) + '</span>' +
        ' <span class="cnt">' + count + '</span>' +
        (unread > 0 && state.room !== r.id ? '<span class="newdot"></span>' : '');
      b.addEventListener('click', () => goRoom(r.id));
      wrap.appendChild(b);
    });
  }

  function renderChatHead() {
    const r = ROOM_MAP[state.room];
    const msgs = (state.rooms[state.room] && state.rooms[state.room].messages) || {};
    el('room-title').textContent = r.emoji + ' ' + r.name;
    el('room-desc').textContent = r.desc;
    el('room-count').textContent = Object.keys(msgs).length + '개 메시지';
    if (state.me) el('me-chip').textContent = initials(state.me) + ' ' + state.me.name;
  }

  /* ── 렌더: 메시지 ──────────────────────────────── */
  function renderMessages(forceBottom) {
    const box = el('messages');
    const r = state.rooms[state.room];
    const raw = (r && r.messages) || {};
    const list = Object.keys(raw).map(id => Object.assign({ id: id }, raw[id]))
      .sort((a, b) => (a.ts || Number.MAX_SAFE_INTEGER) - (b.ts || Number.MAX_SAFE_INTEGER));

    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    const prevTop = box.scrollTop;

    box.innerHTML = '';
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.innerHTML = '<div class="big">💬</div><div>아직 메시지가 없습니다.</div><div style="font-size:12px">첫 인사를 건네 보세요.</div>';
      box.appendChild(e);
    }

    let lastDay = null;
    list.forEach(msg => {
      const ts = msg.ts || Date.now();
      const dk = dayKey(ts);
      if (dk !== lastDay) {
        lastDay = dk;
        const sep = document.createElement('div');
        sep.className = 'day-sep';
        sep.innerHTML = '<span>' + esc(dayLabel(ts)) + '</span>';
        box.appendChild(sep);
      }
      box.appendChild(buildMessage(msg));
    });

    if (forceBottom || atBottom) box.scrollTop = box.scrollHeight;
    else box.scrollTop = prevTop;
  }

  function buildMessage(msg) {
    const m = memberById(msg.memberId) || { id: msg.memberId, name: msg.memberId || '알 수 없음', emoji: '🙂', role: '', color: '#8d8377' };
    const mine = state.me && msg.memberId === state.me.id;
    const wrap = document.createElement('div');
    wrap.className = 'msg' + (mine ? ' me' : '');
    wrap.dataset.id = msg.id;
    wrap.dataset.author = msg.memberId || '';

    const av = document.createElement('div');
    av.className = 'avatar';
    av.style.setProperty('--c', m.color || '#8d8377');
    av.textContent = initials(m);

    const body = document.createElement('div');
    body.className = 'msg-body';

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = '<span class="who">' + esc(m.name) + '</span>' +
      (m.role ? '<span class="role">' + esc(m.role) + '</span>' : '') +
      (msg.auto ? '<span class="auto-tag">자동응답</span>' : '') +
      '<span class="time">' + esc(fmtTime(msg.ts)) + '</span>';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (msg.replyTo && msg.replyTo.text) {
      const q = document.createElement('div');
      q.className = 'quote';
      q.innerHTML = '<span class="q-who">' + esc(memberName(msg.replyTo.memberId) || msg.replyTo.memberId || '') + '</span>' +
        '<span class="q-text">' + esc(String(msg.replyTo.text).slice(0, 160)) + '</span>';
      q.addEventListener('click', () => jumpTo(msg.replyTo.id));
      bubble.appendChild(q);
    }

    const attBlock = buildAttachmentBlock(msg);
    if (attBlock) bubble.appendChild(attBlock);

    if (String(msg.text || '').trim()) {
      const text = document.createElement('div');
      text.className = 'text';
      text.innerHTML = renderRichText(msg.text || '');
      bubble.appendChild(text);
    }

    const reactions = msg.reactions || {};
    const keys = Object.keys(reactions).filter(k => reactions[k] && Object.keys(reactions[k]).length);
    if (keys.length) {
      const re = document.createElement('div');
      re.className = 'reactions';
      keys.forEach(k => {
        const who = Object.keys(reactions[k] || {});
        const chip = document.createElement('button');
        chip.className = 'react' + (state.me && reactions[k][state.me.id] ? ' mine' : '');
        chip.innerHTML = '<span>' + esc(k) + '</span><b>' + who.length + '</b>';
        chip.title = who.map(memberName).join(', ');
        chip.addEventListener('click', e => { e.stopPropagation(); toggleReaction(msg.id, k); });
        re.appendChild(chip);
      });
      bubble.appendChild(re);
    }

    body.appendChild(meta);
    body.appendChild(bubble);
    body.appendChild(buildActions(msg, mine));
    wrap.appendChild(av);
    wrap.appendChild(body);

    if (isTouchy()) {
      bubble.addEventListener('click', e => {
        if (e.target.closest('a, .quote, .react')) return;
        e.stopPropagation();
        document.querySelectorAll('.msg.open').forEach(x => { if (x !== wrap) x.classList.remove('open'); });
        wrap.classList.toggle('open');
      });
    }
    return wrap;
  }

  function buildAttachmentBlock(msg) {
    const atts = normFiles(msg.files);
    if (!atts.length) return null;
    const wrap = document.createElement('div');
    wrap.className = 'att-wrap';
    const imgs = atts.filter(a => a.kind === 'image');
    const files = atts.filter(a => a.kind !== 'image');

    if (imgs.length) {
      const row = document.createElement('div');
      row.className = 'att-imgs';
      imgs.forEach(a => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'att-img-btn loading';
        btn.title = (a.name || '사진') + ' — 눌러서 크게 보기';
        const img = document.createElement('img');
        img.alt = a.name || '사진';
        btn.appendChild(img);
        btn.addEventListener('click', e => { e.stopPropagation(); openLightbox(a); });
        row.appendChild(btn);
        getFileData(a.id).then(d => {
          btn.classList.remove('loading');
          if (!d) { btn.title = '사진을 불러오지 못했습니다'; return; }
          img.src = d;
        });
      });
      wrap.appendChild(row);
    }

    files.forEach(a => {
      const card = document.createElement('div');
      card.className = 'att-file';
      card.innerHTML =
        '<span class="fic">' + fileIcon(a.name) + '</span>' +
        '<span class="f-info"><span class="f-nm">' + esc(a.name || '파일') + '</span>' +
        '<span class="f-sz">' + esc(sizeLabel(a.size)) + '</span></span>' +
        '<button class="f-dl" type="button">다운로드</button>';
      card.querySelector('.f-dl').addEventListener('click', e => { e.stopPropagation(); downloadAttachment(a); });
      wrap.appendChild(card);
    });

    return wrap;
  }

  function buildActions(msg, mine) {
    const bar = document.createElement('div');
    bar.className = 'msg-actions';
    const mk = (label, title, fn, cls) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.title = title;
      if (cls) b.className = cls;
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      return b;
    };
    bar.appendChild(mk('↩', '답글', () => setReply(msg)));
    const sep = document.createElement('span'); sep.className = 'sep'; bar.appendChild(sep);
    ['❤️', '👍', '😄'].forEach(em => {
      bar.appendChild(mk(em, em + ' 반응', () => toggleReaction(msg.id, em)));
    });
    if (mine) {
      const s2 = document.createElement('span'); s2.className = 'sep'; bar.appendChild(s2);
      bar.appendChild(mk('🗑', '삭제', () => deleteMessage(msg), 'del'));
    }
    return bar;
  }

  function jumpTo(id) {
    if (!id) return;
    const n = document.querySelector('.msg[data-id="' + CSS.escape(String(id)) + '"]');
    if (!n) return;
    n.scrollIntoView({ behavior: 'smooth', block: 'center' });
    n.style.transition = 'background .4s';
    n.style.background = 'rgba(194,96,63,.08)';
    setTimeout(() => { n.style.background = ''; }, 1200);
  }

  /* ── 답글 ─────────────────────────────────────── */
  function setReply(msg) {
    state.reply = { id: msg.id, memberId: msg.memberId, text: String(msg.text || '').slice(0, 200) };
    renderReply();
    el('input').focus();
  }
  function renderReply() {
    const box = el('reply-preview');
    if (!state.reply) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    el('rp-who').textContent = memberName(state.reply.memberId) || '';
    el('rp-text').textContent = state.reply.text.replace(/\s+/g, ' ');
  }

  /* ── 전송 ─────────────────────────────────────── */
  let sending = false;
  function send() {
    const ta = el('input');
    const text = (ta.value || '').replace(/\s+$/, '');
    const atts = state.pending.slice();
    if ((!text.trim() && !atts.length) || !state.me || sending) return;
    sending = true;
    el('send').disabled = true;
    const payload = {
      memberId: state.me.id,
      text: text.slice(0, 4000),
      ts: TS,
      replyTo: state.reply ? { id: state.reply.id, memberId: state.reply.memberId, text: state.reply.text } : null
    };
    if (atts.length) {
      payload.files = atts.map(a => ({
        id: a.id, name: a.name, size: a.size, type: a.type, kind: a.kind, w: a.w || 0, h: a.h || 0
      }));
    }
    const roomId = state.room;
    const finish = () => { sending = false; el('send').disabled = false; };

    // 1) 첨부 본문(files/<id>) 먼저 올리고 2) 메시지를 남긴다
    const uploads = atts.map(a => db.ref('files/' + a.id).set({
      name: a.name, type: a.type, size: a.size, kind: a.kind,
      w: a.w || 0, h: a.h || 0, data: a.data, ts: Date.now(), by: state.me.id
    }));

    Promise.all(uploads).then(() => {
      const ref = db.ref('rooms/' + roomId + '/messages').push(payload);
      const newId = ref.key;
      ref.then(() => {
        ta.value = ''; autoGrow(ta);
        state.pending = []; renderPending();
        state.reply = null; renderReply();
        db.ref('typing/' + roomId + '/' + state.me.id).remove().catch(() => {});
        scrollBottom(true);
        finish();
        callAiMembers(roomId, Object.assign({ id: newId }, payload), atts);
      }, err => {
        console.error(err);
        toast('전송하지 못했습니다. 연결을 확인해 주세요.');
        finish();
      });
    }).catch(err => {
      console.error('첨부 업로드 실패', err);
      toast('사진·파일을 올리지 못했습니다. 잠시 뒤 다시 보내 주세요.');
      finish();
    });
  }

  function scrollBottom(force) {
    const box = el('messages');
    if (force) { requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; }); }
  }

  /* ── AI 멤버 자동응답 ────────────────────────────
     · 사람이 보낸 메시지에서 AI 멤버 이름(@이름 또는 이름)을 찾아 그 멤버로 답글을 남깁니다.
     · AI가 쓴 답글은 auto:true 로 기록되고, auto 메시지는 다시 AI를 부르지 않습니다(무한 반복 방지).
     · AI 이름으로 로그인한 화면에서는 자동응답이 돌지 않습니다. */
  const aiBusy = {};

  function findAiTargets(text, senderId) {
    const src = String(text || '');
    const hits = [];
    state.list.forEach(m => {
      if (!m || m.kind !== 'ai' || m.id === senderId) return;
      const name = String(m.name || '').trim();
      if (!name) return;
      if (src.indexOf('@' + name) !== -1) { hits.push({ m: m, rank: 0 }); return; }
      // 이름만 있어도 부르는 것으로 본다 (조사·호격이 붙어도 인식: 혀니야 / 제미나이한테 / 클로드는 …)
      const re = new RegExp('(^|[^가-힣A-Za-z0-9_])' + escRe(name) +
        '($|[^가-힣A-Za-z0-9_]|야|아|님|한테|에게|한테서|께|이랑|랑|와|과|은|는|이|가|을|를|도|만|부터|까지)');
      if (re.test(src)) hits.push({ m: m, rank: 1 });
    });
    hits.sort((a, b) => a.rank - b.rank || (a.m.order || 99) - (b.m.order || 99));
    return hits.slice(0, AI_ENGINE.maxPerMessage).map(h => h.m);
  }

  /* 누가 답할지 정한다.
     · @all / @전체   → AI 전원
     · @이름 / 이름   → 그 AI (최대 2명)
     · 아무도 안 부름  → 기본 비서(혀니). 답글을 단 상대가 AI면 그 AI. */
  function planReplies(text, senderId, replyTo) {
    const src = String(text || '');
    const ais = state.list.filter(m => m && m.kind === 'ai' && m.id !== senderId);
    if (ALL_RE.test(src)) {
      return { targets: ais.slice().sort((a, b) => (a.order || 99) - (b.order || 99)), all: true };
    }
    const hits = findAiTargets(src, senderId);
    if (hits.length) return { targets: hits, all: false };

    if (replyTo && replyTo.memberId) {
      const t = state.members[replyTo.memberId];
      if (t && t.kind === 'ai' && t.id !== senderId) return { targets: [t], all: false, fallback: true };
    }
    const def = state.members[DEFAULT_AI] || ais[0];
    if (def && def.kind === 'ai' && def.id !== senderId) return { targets: [def], all: false, fallback: true };
    return { targets: [], all: false };
  }

  /* 여러 창이 켜져 있어도 한 메시지에 한 AI는 한 번만 답하도록 선점한다. */
  function claimReply(triggerId, memberId) {
    if (!triggerId) return Promise.resolve(true);
    return db.ref('claims/' + triggerId + '/' + memberId)
      .transaction(cur => (cur === null ? { ts: Date.now(), by: SESSION_ID } : undefined))
      .then(res => !!(res && res.committed))
      .catch(() => true);
  }

  function callAiMembers(roomId, trigger, localAtts) {
    if (!state.me || state.me.kind === 'ai') return;
    if (trigger.auto) return;
    const plan = planReplies(trigger.text, state.me.id, trigger.replyTo);
    if (!plan.targets.length) return;
    const total = plan.targets.length;
    (async () => {
      let ok = 0;
      for (let i = 0; i < plan.targets.length; i++) {
        const m = plan.targets[i];
        if (await claimReply(trigger.id, m.id)) {
          const done = await aiReply(roomId, m, trigger, { all: plan.all, idx: i, total: total }, localAtts);
          if (done) ok++;
        }
        if (i < plan.targets.length - 1) await sleep(AI_ENGINE.allGapMs);
      }
      if (plan.all && ok < total && state.room === roomId) {
        toast('전원응답 ' + ok + '/' + total + '명이 답했습니다 — 못한 멤버는 다시 불러 주세요');
      }
    })().catch(e => console.warn('AI 순차 응답 오류', e));
  }

  function attachNote(m) {
    const fs = normFiles(m && m.files);
    if (!fs.length) return '';
    const imgs = fs.filter(f => f.kind === 'image').length;
    const others = fs.length - imgs;
    const parts = [];
    if (imgs) parts.push('사진 ' + imgs + '장');
    if (others) parts.push('파일 ' + others + '개');
    return ' [' + parts.join(', ') + ' 첨부]';
  }

  function aiContext(roomId, trigger) {
    const raw = (state.rooms[roomId] || {}).messages || {};
    const list = Object.keys(raw).map(id => Object.assign({ id: id }, raw[id]))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .slice(-AI_ENGINE.contextSize)
      .map(m => ({
        name: memberName(m.memberId),
        ai: (memberById(m.memberId) || {}).kind === 'ai',
        text: (String(m.text || '') + attachNote(m)).trim().slice(0, 700)
      }));
    // 방금 보낸 메시지가 아직 목록에 반영되지 않았을 수 있으니 마지막에 확실히 붙인다
    if (trigger && (trigger.text || normFiles(trigger.files).length)) {
      const t = (String(trigger.text || '') + attachNote(trigger)).trim().slice(0, 700);
      const last = list[list.length - 1];
      if (!last || last.text !== t) {
        list.push({ name: memberName(trigger.memberId), ai: false, text: t });
      }
    }
    return list;
  }

  function imagesForTrigger(trigger, localAtts) {
    const metas = normFiles(trigger && trigger.files).filter(f => f.kind === 'image').slice(0, AI_ENGINE.maxImages);
    if (!metas.length) return Promise.resolve([]);
    const local = {};
    (localAtts || []).forEach(a => { if (a && a.id && a.data) local[a.id] = a.data; });
    return Promise.all(metas.map(f => {
      const p = local[f.id] ? Promise.resolve(local[f.id]) : getFileData(f.id);
      return p.then(d => {
        const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(d || '');
        return m ? { mimeType: m[1], data: m[2] } : null;
      }).catch(() => null);
    })).then(list => list.filter(Boolean));
  }

  function postEngine(body, attempt) {
    const ctrl = window.AbortController ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), AI_ENGINE.timeoutMs) : null;
    return fetch(AI_ENGINE.proxy, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(res => res.json().catch(() => null).then(data => {
      if (timer) clearTimeout(timer);
      if (!res.ok || !data || !data.ok) {
        throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
      }
      return String(data.text || '').trim();
    })).catch(err => {
      if (timer) clearTimeout(timer);
      const msg = String((err && err.message) || '');
      // 무료 등급 분당 제한(429/RESOURCE_EXHAUSTED)이면 잠시 쉬었다 한 번 더
      if (attempt < 2 && /429|resource_exhausted|quota|rate.?limit|overloaded/i.test(msg)) {
        return sleep(2500).then(() => postEngine(body, attempt + 1));
      }
      throw err;
    });
  }

  function askAiEngine(roomId, member, trigger, meta, localAtts) {
    return imagesForTrigger(trigger, localAtts).then(images => {
      const body = {
        memberId: member.id,
        memberName: member.name,
        memberRole: member.role || '',
        room: roomId,
        all: !!(meta && meta.all),
        index: meta && meta.total > 1 ? meta.idx + 1 : 0,
        total: (meta && meta.total) || 1,
        messages: aiContext(roomId, trigger)
      };
      if (images.length) body.images = images;
      return postEngine(body, 0);
    });
  }

  function aiReply(roomId, member, trigger, meta, localAtts) {
    const key = roomId + '/' + member.id;
    if (aiBusy[key]) return Promise.resolve(false);
    aiBusy[key] = true;
    const typingRef = db.ref('typing/' + roomId + '/' + member.id);
    const beatTyping = () => typingRef.set({ name: member.name, ts: Date.now() }).catch(() => {});
    beatTyping();
    const beat = setInterval(beatTyping, 3500);
    return askAiEngine(roomId, member, trigger, meta, localAtts).then(text => {
      if (!text) return false;
      return db.ref('rooms/' + roomId + '/messages').push({
        memberId: member.id,
        text: text.slice(0, 1200),
        ts: TS,
        auto: true,
        replyTo: {
          id: trigger.id,
          memberId: trigger.memberId,
          text: String(trigger.text || '').slice(0, 200) || (normFiles(trigger.files).length ? '📎 사진·파일' : '')
        }
      }).then(() => true);
    }).catch(err => {
      console.warn('AI 응답 실패', member.name, err);
      // 실패한 답글은 선점을 풀어 다시 부를 수 있게 한다
      db.ref('claims/' + trigger.id + '/' + member.id).remove().catch(() => {});
      if (state.room === roomId && !(meta && meta.all)) {
        toast(member.name + ' 연결이 잠시 막혔어요. 조금 뒤에 다시 불러 주세요.');
      }
      return false;
    }).then(ok => {
      clearInterval(beat);
      typingRef.remove().catch(() => {});
      delete aiBusy[key];
      return ok === true;
    });
  }

  function toggleReaction(msgId, emoji) {
    if (!state.me) return;
    const r = db.ref('rooms/' + state.room + '/messages/' + msgId + '/reactions/' + emoji + '/' + state.me.id);
    const msg = ((state.rooms[state.room] || {}).messages || {})[msgId] || {};
    const mine = msg.reactions && msg.reactions[emoji] && msg.reactions[emoji][state.me.id];
    r.set(mine ? null : true).catch(() => toast('반응을 저장하지 못했습니다.'));
  }

  function deleteMessage(msg) {
    if (!state.me || msg.memberId !== state.me.id) return;
    if (!confirm('이 메시지를 삭제할까요?')) return;
    const roomId = state.room;
    db.ref('rooms/' + roomId + '/messages/' + msg.id).remove().catch(() => toast('삭제하지 못했습니다.'));
    normFiles(msg.files).forEach(a => { if (a && a.id) db.ref('files/' + a.id).remove().catch(() => {}); });
    db.ref('claims/' + msg.id).remove().catch(() => {});
  }

  /* ── 렌더: 사이드바(멤버) ──────────────────────── */
  function renderSidebar() {
    el('member-count').textContent = state.list.length + '명';
    const list = el('member-list');
    list.innerHTML = '';
    state.list.forEach(m => {
      const p = state.presence[m.id] || {};
      const online = isOnline(m.id);
      const row = document.createElement('div');
      row.className = 'member-row' + (online ? ' online' : '');
      const meTag = state.me && state.me.id === m.id ? '<span class="me-tag">나</span>' : '';
      const statusText = online ? '온라인' : fmtLastSeen(p.lastSeen);
      row.innerHTML =
        '<span class="avatar" style="--c:' + esc(m.color || '#8d8377') + '">' + esc(initials(m)) + '</span>' +
        '<span class="info"><span class="nm">' + esc(m.name) + meTag + '</span>' +
        '<span class="rl">' + esc(m.role || '') + '</span></span>' +
        '<span class="st"><span class="d"></span>' + esc(statusText) + '</span>';
      list.appendChild(row);
    });
  }

  function renderTyping() {
    const box = el('typing-line');
    const t = state.typing[state.room] || {};
    const now = Date.now();
    const names = Object.keys(t)
      .filter(id => !state.me || id !== state.me.id)
      .filter(id => t[id] && t[id].ts && now - t[id].ts < 12000)
      .map(id => (t[id].name || memberName(id)));
    box.textContent = names.length ? (names.slice(0, 3).join(', ') + '님이 입력 중…') : '';
  }

  /* ── 멘션 자동완성 ─────────────────────────────── */
  let mentionSel = 0, mentionItems = [];
  const ALL_ITEM = { id: '__all', name: 'all', role: 'AI 7명 전원에게', emoji: '📣', color: '#c2603f', kind: 'all' };

  function updateMentionPop() {
    const ta = el('input');
    const caret = ta.selectionStart || 0;
    const before = ta.value.slice(0, caret);
    const mm = before.match(/(^|[\s\n])@([^\s@]{0,12})$/);
    const pop = el('mention-pop');
    if (!mm) { pop.classList.add('hidden'); mentionItems = []; return; }
    const q = mm[2].replace(/\s/g, '').toLowerCase();
    mentionItems = [];
    if (!q || 'all'.indexOf(q) === 0 || '전체'.indexOf(q) === 0 || '전원'.indexOf(q) === 0) {
      mentionItems.push(ALL_ITEM);
    }
    mentionItems = mentionItems.concat(
      state.list.filter(m => m.name.replace(/\s/g, '').toLowerCase().includes(q)).slice(0, 8)
    );
    if (!mentionItems.length) { pop.classList.add('hidden'); return; }
    mentionSel = 0;
    pop.innerHTML = '';
    mentionItems.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mention-item' + (i === 0 ? ' sel' : '');
      b.innerHTML = '<span class="avatar sm" style="--c:' + esc(m.color || '#8d8377') + '">' + esc(initials(m)) + '</span>' +
        '<span>' + esc(m.name) + '</span><span class="rl">' + esc(m.role || '') + '</span>';
      b.addEventListener('mousedown', e => { e.preventDefault(); insertMention(m); });
      pop.appendChild(b);
    });
    pop.classList.remove('hidden');
  }

  function insertMention(m) {
    const ta = el('input');
    const caret = ta.selectionStart || 0;
    const before = ta.value.slice(0, caret);
    const after = ta.value.slice(caret);
    const mm = before.match(/(^|[\s\n])@([^\s@]{0,12})$/);
    if (!mm) return;
    const start = before.length - mm[0].length + mm[1].length;
    ta.value = before.slice(0, start) + '@' + m.name + ' ' + after;
    const pos = start + m.name.length + 2;
    ta.setSelectionRange(pos, pos);
    el('mention-pop').classList.add('hidden');
    ta.focus(); autoGrow(ta);
    signalTyping();
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 170) + 'px';
  }

  /* ── 모달: 접속 안내 ───────────────────────────── */
  function baseUrl() { return location.origin + location.pathname; }
  function linkFor(m) { return baseUrl() + '?m=' + encodeURIComponent(m.id) + '&pin=' + encodeURIComponent(m.pin || ''); }

  function openInvite() {
    const hero = el('invite-hero');
    const boss = state.list.find(m => m.id === 'yeonkyung') || state.list[0];
    if (boss) {
      hero.innerHTML =
        '<div class="h-top"><span class="avatar sm" style="--c:' + esc(boss.color || '#b0641f') + '">' + esc(initials(boss)) + '</span>' +
        '<span>' + esc(boss.name) + ' · 내 링크</span></div>' +
        '<code>' + esc(linkFor(boss)) + '</code>' +
        '<div class="h-btns"><button class="btn tiny" id="hero-copy">링크 복사</button>' +
        '<button class="btn tiny" id="hero-open">새 창에서 열기</button></div>';
      el('hero-copy').addEventListener('click', () => copyText(linkFor(boss), '내 접속 링크를 복사했습니다'));
      el('hero-open').addEventListener('click', () => window.open(linkFor(boss), '_blank'));
    } else hero.innerHTML = '';

    const list = el('invite-list');
    list.innerHTML = '';
    state.list.forEach(m => {
      const row = document.createElement('div');
      row.className = 'invite-row';
      row.innerHTML =
        '<span class="avatar sm" style="--c:' + esc(m.color || '#8d8377') + '">' + esc(initials(m)) + '</span>' +
        '<span class="info"><span class="nm">' + esc(m.name) + '</span>' +
        '<span class="pin">PIN <b>' + esc(m.pin || '----') + '</b> · ' + esc(m.role || '') + '</span></span>' +
        '<button class="btn tiny">링크 복사</button>';
      row.querySelector('button').addEventListener('click', () => copyText(linkFor(m), m.name + ' 접속 링크를 복사했습니다'));
      list.appendChild(row);
    });
    showModal('modal-invite');
  }

  function copyAllInvites() {
    const lines = ['[연경 오피스] 멤버별 접속 정보', baseUrl(), ''];
    state.list.forEach(m => {
      lines.push('• ' + m.name + ' (' + (m.role || '') + ') — PIN ' + (m.pin || ''));
      lines.push('  ' + linkFor(m));
    });
    lines.push('', '· 링크를 열면 그 멤버 이름으로 바로 입장합니다.');
    lines.push('· AI 멤버(ChatGPT·제미나이·클로드·Meta AI·Dola)는 스스로 접속하지 못하니, 그 AI의 답변을 해당 이름으로 붙여넣어 기록해 두시면 됩니다.');
    copyText(lines.join('\n'), '전체 접속 정보를 복사했습니다');
  }

  /* ── 모달: 멤버 관리 ───────────────────────────── */
  let editingId = null;

  function openMembers() { editingId = null; renderMemberEditor(); showModal('modal-members'); }

  function renderMemberEditor() {
    const wrap = el('edit-list');
    wrap.innerHTML = '';
    state.list.forEach(m => {
      const row = document.createElement('div');
      row.className = 'edit-row';
      if (editingId === m.id) {
        row.innerHTML =
          '<div class="editing" style="grid-column:1/-1">' +
          '<input class="inp" data-f="emoji" maxlength="4" value="' + esc(m.emoji || '') + '">' +
          '<input class="inp" data-f="name" value="' + esc(m.name || '') + '" placeholder="이름">' +
          '<input class="inp" data-f="role" value="' + esc(m.role || '') + '" placeholder="역할">' +
          '<input class="inp" data-f="pin" maxlength="4" inputmode="numeric" value="' + esc(m.pin || '') + '" placeholder="PIN">' +
          '</div>' +
          '<div class="edit-actions" style="grid-column:1/-1">' +
          '<button class="btn tiny primary" data-act="save">저장</button>' +
          '<button class="btn tiny" data-act="cancel">취소</button>' +
          '<button class="btn tiny" data-act="del">삭제</button>' +
          '</div>';
        row.querySelector('[data-act="save"]').addEventListener('click', () => saveMember(m.id, row));
        row.querySelector('[data-act="cancel"]').addEventListener('click', () => { editingId = null; renderMemberEditor(); });
        row.querySelector('[data-act="del"]').addEventListener('click', () => deleteMember(m));
      } else {
        row.innerHTML =
          '<span class="avatar sm" style="--c:' + esc(m.color || '#8d8377') + '">' + esc(initials(m)) + '</span>' +
          '<span class="info"><span class="nm">' + esc(m.name) + '</span>' +
          '<span class="rl">' + esc(m.role || '') + ' · PIN ' + esc(m.pin || '----') + '</span></span>' +
          '<span class="btns"><button class="icon-btn" title="수정">✏️</button></span>';
        row.querySelector('button').addEventListener('click', () => { editingId = m.id; renderMemberEditor(); });
      }
      wrap.appendChild(row);
    });
  }

  function saveMember(id, row) {
    const get = f => (row.querySelector('[data-f="' + f + '"]').value || '').trim();
    const name = get('name');
    const pin = get('pin');
    if (!name) return toast('이름을 입력해 주세요');
    if (!/^\d{2,6}$/.test(pin)) return toast('PIN은 숫자 2~6자리로 정해 주세요');
    const patch = { name: name, role: get('role'), emoji: get('emoji') || '🙂', pin: pin };
    db.ref('members/' + id).update(patch).then(() => {
      editingId = null;
      if (state.me && state.me.id === id) { Object.assign(state.me, patch); }
      renderAll();
      toast('저장했습니다');
    }).catch(() => toast('저장하지 못했습니다'));
  }

  function deleteMember(m) {
    if (!confirm('“' + m.name + '” 멤버를 삭제할까요?\n지난 대화는 그대로 남습니다.')) return;
    db.ref('members/' + m.id).remove().then(() => {
      if (state.me && state.me.id === m.id) return logout();
      editingId = null; renderMemberEditor();
      toast('삭제했습니다');
    }).catch(() => toast('삭제하지 못했습니다'));
  }

  function addMember() {
    const name = (el('new-name').value || '').trim();
    const role = (el('new-role').value || '').trim();
    const emoji = (el('new-emoji').value || '').trim() || '🙂';
    let pin = (el('new-pin').value || '').trim();
    if (!name) return toast('이름을 입력해 주세요');
    if (!/^\d{2,6}$/.test(pin)) pin = String(Math.floor(1000 + Math.random() * 9000));
    const id = 'm' + Date.now().toString(36);
    const order = state.list.reduce((n, x) => Math.max(n, x.order || 0), 0) + 1;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    db.ref('members/' + id).set({ name: name, role: role, emoji: emoji, pin: pin, color: color, kind: 'ai', order: order })
      .then(() => {
        el('new-name').value = ''; el('new-role').value = ''; el('new-pin').value = ''; el('new-emoji').value = '🙂';
        toast(name + ' 멤버를 추가했습니다 · PIN ' + pin);
      }).catch(() => toast('추가하지 못했습니다'));
  }

  /* ── 모달 공통 ────────────────────────────────── */
  function showModal(id) { el(id).classList.remove('hidden'); }
  function closeModal(id) { el(id).classList.add('hidden'); }

  function openPeople() { el('sidebar').classList.add('open'); el('scrim').classList.add('show'); }
  function closePeople() { el('sidebar').classList.remove('open'); el('scrim').classList.remove('show'); }

  /* ── 데이터 구독 ───────────────────────────────── */
  function sortMembers(obj) {
    return Object.keys(obj).map(id => Object.assign({ id: id }, obj[id]))
      .sort((a, b) => (a.order || 99) - (b.order || 99) || String(a.name).localeCompare(String(b.name), 'ko'));
  }

  async function ensureSeed() {
    const snap = await db.ref('meta/seed').once('value');
    if (snap.val()) return;
    const upd = {};
    DEFAULT_MEMBERS.forEach(m => {
      upd['members/' + m.id] = { name: m.name, role: m.role, emoji: m.emoji, pin: m.pin, color: m.color, kind: m.kind, order: m.order };
    });
    const now = Date.now();
    Object.keys(SEEDS).forEach(room => {
      SEEDS[room].forEach((s, i) => {
        upd['rooms/' + room + '/messages/' + s.id] = {
          memberId: s.memberId, text: s.text, ts: now + i * 90000,
          replyTo: s.replyTo || null, reactions: s.reactions || null
        };
      });
    });
    upd['meta/seed'] = now;
    await db.ref().update(upd);
  }

  function attachListeners() {
    db.ref('.info/connected').on('value', s => {
      state.connected = !!s.val();
      renderHeader();
    });

    db.ref('members').on('value', snap => {
      const obj = snap.val() || {};
      const list = sortMembers(obj);
      const byId = {};
      list.forEach(mm => { byId[mm.id] = mm; });
      state.members = byId;
      state.list = list;
      trace.push('members ' + state.list.length + ' screen=' + screen);
      if (!state.list.length) return;

      if (screen === 'app' && state.me) {
        const fresh = state.members[state.me.id];
        if (!fresh) { logout(); return; }
        state.me = fresh;
        renderAll();
        renderMemberEditorIfOpen();
        return;
      }
      if (!state.booted) { resolveInitialScreen(); return; }
      if (screen === 'login') {
        const keep = state.pendingId;
        renderLoginGrid();
        renderMemberEditorIfOpen();
        if (keep && state.members[keep]) { state.pendingId = keep; showStep('pin'); }
        else { state.pendingId = null; showStep('pick'); }
      }
    });

    db.ref('presence').on('value', snap => {
      state.presence = snap.val() || {};
      renderHeader(); renderSidebar();
    });

    db.ref('typing').on('value', snap => { state.typing = snap.val() || {}; renderTyping(); });

    db.ref('rooms').on('value', snap => {
      state.rooms = snap.val() || {};
      if (!state.me) return;
      state.seen[state.room] = Date.now(); saveSeen();
      const msgs = (state.rooms[state.room] || {}).messages || {};
      const box = el('messages');
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
      renderTabs(); renderChatHead(); renderMessages(atBottom);
      if (atBottom) scrollBottom(true);
    });
  }

  function resolveInitialScreen() {
    if (state.booted) return;
    state.booted = true;
    const params = new URLSearchParams(location.search);
    const urlM = params.get('m'), urlPin = params.get('pin');
    const stored = localStorage.getItem(LS_ID);
    if (urlM && state.members[urlM] && urlPin != null && String(state.members[urlM].pin) === String(urlPin)) {
      localStorage.setItem(LS_ID, urlM);
      enterApp(urlM);
      return;
    }
    if (stored && state.members[stored]) { enterApp(stored); return; }
    showLogin(urlM && state.members[urlM] ? urlM : null);
  }

  function renderMemberEditorIfOpen() {
    if (!el('modal-members').classList.contains('hidden')) renderMemberEditor();
  }

  /* ── 부팅 ─────────────────────────────────────── */
  function boot() {
    loadSeen();
    showBoot('연결하는 중…');
    auth.signInAnonymously().catch(err => {
      console.error('auth', err);
      el('boot-msg').innerHTML = '연결에 실패했습니다.<br><span style="font-size:12px">인터넷 연결을 확인한 뒤 새로고침해 주세요.</span>';
      el('boot').querySelector('.spinner').classList.add('hidden');
    });

    auth.onAuthStateChanged(user => {
      if (!user) return;
      el('boot-msg').textContent = '대화방을 여는 중…';
      ensureSeed().then(attachListeners).catch(err => {
        console.error('seed', err);
        // 씨앗 생성이 막혀도 구독은 계속
        attachListeners();
      });
    });
  }

  /* ── 화면 크기 · 입력 힌트 ─────────────────────── */
  function isTouchy() {
    return window.matchMedia('(hover: none)').matches || window.innerWidth < 860;
  }
  function syncPlaceholder() {
    el('input').placeholder = isTouchy()
      ? '메시지를 입력하세요'
      : '메시지를 입력하세요  ·  Enter 전송 / Shift+Enter 줄바꿈';
  }

  /* ── 이벤트 연결 ───────────────────────────────── */
  function bind() {
    syncPlaceholder();
    window.addEventListener('resize', syncPlaceholder);
    el('pin-back').addEventListener('click', () => { state.pendingId = null; showStep('pick'); });
    el('pin-submit').addEventListener('click', tryPin);
    el('pin-input').addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
      if (e.target.value.length === 4) tryPin();
    });
    el('pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); });

    el('btn-invite').addEventListener('click', openInvite);
    el('btn-logout').addEventListener('click', () => {
      if (state.me && confirm(state.me.name + '으로 로그아웃할까요?')) logout();
    });
    el('btn-manage').addEventListener('click', openMembers);
    el('btn-people').addEventListener('click', openPeople);
    el('btn-close-people').addEventListener('click', closePeople);
    el('scrim').addEventListener('click', closePeople);

    el('btn-copy-all').addEventListener('click', copyAllInvites);
    el('btn-add-member').addEventListener('click', addMember);

    const aiHint = el('ai-hint');
    if (localStorage.getItem('yk_ai_hint') === 'off') aiHint.classList.add('hidden');
    el('ai-hint-close').addEventListener('click', () => {
      aiHint.classList.add('hidden');
      try { localStorage.setItem('yk_ai_hint', 'off'); } catch (e) {}
    });

    document.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => closeModal(b.getAttribute('data-close')));
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
    });

    const emojis = ['🙂', '👑', '🐰', '🤖', '✨', '🧠', '🎨', '💬', '⚡', '📣', '🧾', '🍖', '🎬', '💼', '🌸', '🦊'];
    const q = el('emoji-quick');
    emojis.forEach(e => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = e;
      b.addEventListener('click', () => { el('new-emoji').value = e; });
      q.appendChild(b);
    });

    el('input').addEventListener('input', e => {
      autoGrow(e.target);
      updateMentionPop();
      signalTyping();
    });
    el('input').addEventListener('keydown', e => {
      const pop = el('mention-pop');
      if (!pop.classList.contains('hidden') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        mentionSel = (mentionSel + (e.key === 'ArrowDown' ? 1 : -1) + mentionItems.length) % mentionItems.length;
        Array.from(pop.children).forEach((c, i) => c.classList.toggle('sel', i === mentionSel));
        return;
      }
      if (!pop.classList.contains('hidden') && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (mentionItems[mentionSel]) insertMention(mentionItems[mentionSel]);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    el('input').addEventListener('blur', () => setTimeout(() => el('mention-pop').classList.add('hidden'), 120));

    el('send').addEventListener('click', send);

    // ── 사진·파일 첨부 ──
    el('btn-attach').addEventListener('click', () => el('file-input').click());
    el('file-input').addEventListener('change', e => {
      addFiles(e.target.files);
      e.target.value = '';
    });
    el('input').addEventListener('paste', e => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      const picked = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') { const f = items[i].getAsFile(); if (f) picked.push(f); }
      }
      if (picked.length) { e.preventDefault(); addFiles(picked); }
    });

    const chatEl = document.querySelector('.chat');
    let dragDepth = 0;
    const showDrop = v => el('drop-overlay').classList.toggle('hidden', !v);
    const hasFiles = dt => !!(dt && Array.prototype.indexOf.call(dt.types || [], 'Files') >= 0);
    if (chatEl) {
      chatEl.addEventListener('dragenter', e => {
        if (!hasFiles(e.dataTransfer)) return;
        e.preventDefault(); dragDepth++; showDrop(true);
      });
      chatEl.addEventListener('dragover', e => {
        if (!hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'copy'; } catch (err) {}
        showDrop(true);
      });
      chatEl.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) showDrop(false); });
      chatEl.addEventListener('drop', e => {
        if (!e.dataTransfer) return;
        e.preventDefault(); dragDepth = 0; showDrop(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      });
    }

    el('lb-close').addEventListener('click', closeLightbox);
    el('lb-save').addEventListener('click', () => { if (lbAtt) downloadAttachment(lbAtt); });
    el('lightbox').addEventListener('click', e => {
      if (e.target === el('lightbox') || e.target === el('lb-stage')) closeLightbox();
    });

    el('rp-cancel').addEventListener('click', () => { state.reply = null; renderReply(); });

    el('messages').addEventListener('scroll', () => {
      document.querySelectorAll('.msg.open').forEach(x => x.classList.remove('open'));
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!el('lightbox').classList.contains('hidden')) { closeLightbox(); return; }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        closePeople();
      }
    });
  }

  window.addEventListener('DOMContentLoaded', () => { bind(); boot(); });
})();
