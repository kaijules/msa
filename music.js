/* Spark Music - player + library logic (vanilla JS, no build step) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const GENRES = ['Pop', 'Lofi', 'EDM', 'Acoustic', 'Rock'];
  const SEED = [
    ['Đêm Sao Lặng', 'Lam Anh', 'Pop', 184200], ['Hoàng Hôn Phố Cũ', 'Hải Đăng', 'Lofi', 152300],
    ['Chạy Về Phía Mặt Trời', 'Sao Băng', 'EDM', 241900], ['Mưa Qua Hiên', 'Nắng Mai', 'Acoustic', 98700],
    ['Bản Nhạc Cho Em', 'Lam Anh', 'Pop', 176400], ['Gió Đông', 'Gió Đông', 'Rock', 87500],
    ['Ngày Mây Trắng', 'Mây Trắng', 'Lofi', 129800], ['Neon Lúc Nửa Đêm', 'Sao Băng', 'EDM', 203100],
    ['Cà Phê Sáng', 'Mây Trắng', 'Lofi', 111200], ['Về Nhà', 'Nắng Mai', 'Acoustic', 76400],
    ['Lửa Trong Tim', 'Gió Đông', 'Rock', 92600], ['Khoảng Trời Riêng', 'Hải Đăng', 'Pop', 143500]
  ];
  // Demo audio streamed from SoundHelix (needs internet). Uploaded files live in `uploads` for the session.
  const TRACKS = SEED.map((t, i) => ({
    id: 't' + (i + 1), title: t[0], artist: t[1], genre: t[2], plays: t[3],
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-' + (i + 1) + '.mp3'
  }));
  const uploads = [];
  const all = () => TRACKS.concat(uploads);
  const find = id => all().find(t => t.id === id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = s => isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
  const cover = t => '<span class="song-cover g' + Math.max(0, GENRES.indexOf(t.genre)) + '"><i class="bi bi-music-note-beamed"></i></span>';

  let liked = new Set(store.get('sm_liked', []));
  let history = store.get('sm_history', ['t1', 't2', 't3', 't4']);
  let playlists = store.get('sm_playlists', [{ name: 'Chill cuối tuần', ids: ['t2', 't7', 't9'] }]);
  let queue = TRACKS.map(t => t.id), cur = null, shuffle = false, repeat = 0, seeking = false;
  const audio = new Audio();
  audio.preload = 'metadata';

  /* ---------- Player bar ---------- */
  const bar = document.createElement('div');
  bar.className = 'player-bar';
  bar.innerHTML =
    '<div class="pl-track"><span class="song-cover g1" id="pl-cover"><i class="bi bi-music-note-beamed"></i></span>' +
    '<div class="pl-meta"><div class="pl-title" id="pl-title">Chưa chọn bài hát</div><div class="pl-artist" id="pl-artist">Chọn một bài để bắt đầu</div></div>' +
    '<button class="pl-btn" id="pl-like" aria-label="Yêu thích"><i class="bi bi-heart"></i></button></div>' +
    '<div class="pl-center"><div class="pl-controls">' +
    '<button class="pl-btn" id="pl-shuffle" aria-label="Ngẫu nhiên"><i class="bi bi-shuffle"></i></button>' +
    '<button class="pl-btn" id="pl-prev" aria-label="Bài trước"><i class="bi bi-skip-start-fill"></i></button>' +
    '<button class="pl-btn pl-play" id="pl-play" aria-label="Phát/Tạm dừng"><i class="bi bi-play-fill"></i></button>' +
    '<button class="pl-btn" id="pl-next" aria-label="Bài sau"><i class="bi bi-skip-end-fill"></i></button>' +
    '<button class="pl-btn" id="pl-repeat" aria-label="Lặp lại"><i class="bi bi-repeat"></i></button></div>' +
    '<div class="pl-seek"><span id="pl-cur">0:00</span><input type="range" id="pl-range" min="0" max="1000" value="0" aria-label="Tua"><span id="pl-dur">0:00</span></div></div>' +
    '<div class="pl-vol"><i class="bi bi-volume-up-fill"></i><input type="range" id="pl-vol" min="0" max="100" value="80" aria-label="Âm lượng"></div>';
  document.body.appendChild(bar);
  document.body.classList.add('has-player');
  audio.volume = store.get('sm_vol', 80) / 100;
  $('#pl-vol').value = audio.volume * 100;

  function sync() {
    const t = find(cur);
    $('#pl-title').textContent = t ? t.title : 'Chưa chọn bài hát';
    $('#pl-artist').textContent = t ? t.artist + ' • ' + t.genre : 'Chọn một bài để bắt đầu';
    $('#pl-cover').className = 'song-cover g' + (t ? Math.max(0, GENRES.indexOf(t.genre)) : 1);
    $('#pl-like i').className = 'bi ' + (t && liked.has(t.id) ? 'bi-heart-fill' : 'bi-heart');
    $('#pl-like').classList.toggle('active', !!(t && liked.has(t.id)));
    $('#pl-play i').className = 'bi ' + (audio.paused ? 'bi-play-fill' : 'bi-pause-fill');
    $('#pl-shuffle').classList.toggle('active', shuffle);
    $('#pl-repeat').classList.toggle('active', repeat > 0);
    $('#pl-repeat i').className = 'bi ' + (repeat === 2 ? 'bi-repeat-1' : 'bi-repeat');
    document.querySelectorAll('[data-id]').forEach(el => el.classList.toggle('is-playing', el.dataset.id === cur));
    document.querySelectorAll('[data-play]').forEach(b => {
      const on = b.dataset.play === cur && !audio.paused;
      const i = b.querySelector('i'); if (i) i.className = 'bi ' + (on ? 'bi-pause-fill' : 'bi-play-fill');
    });
  }

  function load(id, autoplay, ctx) {
    const t = find(id); if (!t) return;
    if (ctx && ctx.length) queue = ctx.slice();
    cur = id; audio.src = t.src;
    history = [id].concat(history.filter(x => x !== id)).slice(0, 8);
    store.set('sm_history', history);
    if (autoplay) audio.play().catch(() => sync());
    sync(); renderRecent();
  }
  function toggle() {
    if (!cur) { load(queue[0], true); return; }
    audio.paused ? audio.play().catch(() => { }) : audio.pause();
  }
  function step(dir) {
    const q = queue.length ? queue : all().map(t => t.id);
    let i = q.indexOf(cur);
    i = shuffle && q.length > 1 ? (i + 1 + Math.floor(Math.random() * (q.length - 1))) % q.length : (i + dir + q.length) % q.length;
    load(q[i], true);
  }
  function playList(ids, rnd) {
    ids = ids.filter(find); if (!ids.length) return;
    shuffle = !!rnd; queue = ids.slice();
    load(rnd ? ids[Math.floor(Math.random() * ids.length)] : ids[0], true);
  }

  $('#pl-play').onclick = toggle;
  $('#pl-next').onclick = () => step(1);
  $('#pl-prev').onclick = () => audio.currentTime > 3 ? (audio.currentTime = 0) : step(-1);
  $('#pl-shuffle').onclick = () => { shuffle = !shuffle; sync(); };
  $('#pl-repeat').onclick = () => { repeat = (repeat + 1) % 3; sync(); };
  $('#pl-like').onclick = () => cur && toggleLike(cur);
  $('#pl-vol').oninput = e => { audio.volume = e.target.value / 100; store.set('sm_vol', +e.target.value); };
  const range = $('#pl-range');
  range.oninput = () => { seeking = true; $('#pl-cur').textContent = fmt(range.value / 1000 * audio.duration); };
  range.onchange = () => { if (isFinite(audio.duration)) audio.currentTime = range.value / 1000 * audio.duration; seeking = false; };
  audio.addEventListener('play', sync);
  audio.addEventListener('pause', sync);
  audio.addEventListener('loadedmetadata', () => { $('#pl-dur').textContent = fmt(audio.duration); });
  audio.addEventListener('timeupdate', () => {
    if (seeking) return;
    $('#pl-cur').textContent = fmt(audio.currentTime);
    range.value = audio.duration ? audio.currentTime / audio.duration * 1000 : 0;
  });
  audio.addEventListener('ended', () => {
    const q = queue, last = q.indexOf(cur) === q.length - 1;
    if (repeat === 2) { audio.currentTime = 0; audio.play(); }
    else if (!last || repeat === 1 || shuffle) step(1);
    else sync();
  });
  window.addEventListener('beforeunload', () => store.set('sm_state', { id: cur, t: audio.currentTime, playing: !audio.paused, q: queue }));

  /* ---------- Likes ---------- */
  function toggleLike(id) {
    liked.has(id) ? liked.delete(id) : liked.add(id);
    store.set('sm_liked', [...liked]);
    sync(); renderTable();
  }

  /* ---------- Home: recent list ---------- */
  function renderRecent() {
    const el = $('#recent-list'); if (!el) return;
    el.innerHTML = history.map(find).filter(Boolean).slice(0, 4).map(t =>
      '<div class="transaction-item song-item" data-id="' + t.id + '" data-play="' + t.id + '" data-ctx="all">' +
      '<div class="transaction-icon bg-forest-light text-lime"><i class="bi bi-play-fill"></i></div>' +
      '<div class="transaction-info"><div class="transaction-name">' + esc(t.title) + '</div>' +
      '<div class="transaction-date">' + esc(t.artist) + ' • ' + esc(t.genre) + '</div></div>' +
      '<div class="transaction-amount text-main">' + t.plays.toLocaleString('vi-VN') + '</div></div>').join('');
    sync();
  }

  /* ---------- Library table ---------- */
  const view = { genre: '', q: new URLSearchParams(location.search).get('q') || '' };
  function filtered() {
    const q = view.q.trim().toLowerCase();
    return all().filter(t => (!view.genre || t.genre === view.genre) &&
      (!q || (t.title + ' ' + t.artist + ' ' + t.genre).toLowerCase().includes(q)));
  }
  function renderTable() {
    const body = $('#song-tbody'); if (!body) return;
    const rows = filtered();
    body.innerHTML = rows.map((t, i) =>
      '<tr data-id="' + t.id + '"><td class="table-order-id">' + String(i + 1).padStart(2, '0') + '</td>' +
      '<td><div class="table-user-cell">' + cover(t) + '<div><div class="table-user-name">' + esc(t.title) +
      '</div><div class="table-user-sub">' + esc(t.artist) + '</div></div></div></td>' +
      '<td>' + esc(t.genre) + '</td><td class="table-amount">' + t.plays.toLocaleString('vi-VN') + '</td>' +
      '<td>' + (liked.has(t.id) ? '<span class="badge-table success">Đã thích</span>' : '<span class="text-muted-green">—</span>') + '</td>' +
      '<td><div class="d-flex justify-content-center gap-1">' +
      '<a href="#" class="table-btn-action" data-play="' + t.id + '" title="Phát"><i class="bi bi-play-fill"></i></a>' +
      '<a href="#" class="table-btn-action" data-like="' + t.id + '" title="Yêu thích"><i class="bi ' + (liked.has(t.id) ? 'bi-heart-fill' : 'bi-heart') + '"></i></a>' +
      '</div></td></tr>').join('') || '<tr><td colspan="6" class="text-center text-muted-green py-4">Không tìm thấy bài hát nào.</td></tr>';
    const n = $('#song-count'); if (n) n.textContent = 'Hiển thị ' + rows.length + ' / ' + all().length + ' bài hát';
    sync();
  }

  /* ---------- Playlists (upload page) ---------- */
  function renderPlaylists() {
    const el = $('#playlist-list'); if (!el) return;
    el.innerHTML = playlists.map((p, i) =>
      '<div class="transaction-item"><div class="transaction-icon bg-forest-light text-lime"><i class="bi bi-music-note-list"></i></div>' +
      '<div class="transaction-info"><div class="transaction-name">' + esc(p.name) + '</div><div class="transaction-date">' + p.ids.filter(find).length + ' bài hát</div></div>' +
      '<div class="d-flex gap-1 ms-2"><a href="#" class="table-btn-action" data-pl-play="' + i + '" title="Phát"><i class="bi bi-play-fill"></i></a>' +
      '<a href="#" class="table-btn-action" data-pl-add="' + i + '" title="Thêm bài đang phát"><i class="bi bi-plus-lg"></i></a>' +
      '<a href="#" class="table-btn-action delete" data-pl-del="' + i + '" title="Xóa"><i class="bi bi-trash"></i></a></div></div>').join('') ||
      '<p class="text-muted-green mb-0">Chưa có playlist nào.</p>';
  }

  /* ---------- Event delegation ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-play],[data-like],[data-pl-play],[data-pl-add],[data-pl-del],[data-genre]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.play) {
      const id = a.dataset.play;
      if (id === cur) toggle();
      else load(id, true, $('#song-tbody') ? filtered().map(t => t.id) : all().map(t => t.id));
    } else if (a.dataset.like) toggleLike(a.dataset.like);
    else if (a.dataset.genre !== undefined) { view.genre = a.dataset.genre; renderTable(); }
    else {
      const i = +(a.dataset.plPlay ?? a.dataset.plAdd ?? a.dataset.plDel), p = playlists[i];
      if (!p) return;
      if (a.dataset.plPlay !== undefined) playList(p.ids);
      else if (a.dataset.plAdd !== undefined) { if (cur && !p.ids.includes(cur)) p.ids.push(cur); }
      else playlists.splice(i, 1);
      store.set('sm_playlists', playlists); renderPlaylists();
    }
  });

  /* ---------- Page wiring ---------- */
  const search = $('.table-search-input'); if (search) { search.value = view.q; search.oninput = () => { view.q = search.value; renderTable(); }; }
  const main = $('#main-search');
  if (main) main.addEventListener('keydown', e => { if (e.key === 'Enter') location.href = 'tables-basic.html?q=' + encodeURIComponent(main.value); });
  const bind = (sel, fn) => { const el = $(sel); if (el) el.addEventListener('click', e => { e.preventDefault(); fn(); }); };
  bind('#btn-shuffle-all', () => playList(all().map(t => t.id), true));
  bind('#btn-play-all', () => playList(filtered().map(t => t.id)));
  bind('#alert-link-statistics', () => playList(['t3', 't8', 't1']));
  bind('#btn-promo-action', () => playList(all().map(t => t.id), true));

  const upForm = $('#upload-form');
  if (upForm) upForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = $('#up-file').files[0]; if (!f) return;
    const t = { id: 'u' + (uploads.length + 1), title: $('#up-title').value.trim(), artist: $('#up-artist').value.trim() || 'Không rõ', genre: $('#up-genre').value, plays: 0, src: URL.createObjectURL(f) };
    uploads.push(t); upForm.reset();
    $('#up-msg').textContent = 'Đã thêm "' + t.title + '". Xem trong mục Bài hát hoặc phát ngay bên dưới.';
    load(t.id, true, all().map(x => x.id));
  });
  const plForm = $('#playlist-form');
  if (plForm) plForm.addEventListener('submit', e => {
    e.preventDefault();
    const n = $('#pl-name').value.trim(); if (!n) return;
    playlists.push({ name: n, ids: [] }); store.set('sm_playlists', playlists); plForm.reset(); renderPlaylists();
  });

  renderRecent(); renderTable(); renderPlaylists();
  // Resume where the last page left off (paused; browsers block autoplay across page loads)
  const st = store.get('sm_state', null);
  if (st && find(st.id)) {
    load(st.id, false, st.q);
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = st.t || 0; }, { once: true });
    if (st.playing) audio.play().catch(() => { });
  }
  sync();
})();
