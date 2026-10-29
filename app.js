/* =========================================================
   我们的小屋 · 交互逻辑
   ========================================================= */
(function () {
  "use strict";

  const KEY = "our-room:v1";
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad = n => String(n).padStart(2, "0");
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = () => "m-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------------- 数据 ---------------- */
  const defaults = () => clone(window.ROOM_DEFAULTS);

  function normalize(s) {
    const d = defaults();
    const out = {};
    out.settings = Object.assign({}, d.settings, s && s.settings ? s.settings : {});
    const list = s && Array.isArray(s.memories) ? s.memories : d.memories;
    out.memories = list.map(m => ({
      id: m.id || uid(),
      date: m.date || d.settings.startDate,
      title: (m.title || "没有标题").slice(0, 40),
      place: m.place || "",
      note: m.note || "",
      photos: Array.isArray(m.photos) ? m.photos.filter(Boolean) : []
    }));
    return out;
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.memories)) return defaults();
      return normalize(parsed);
    } catch (e) {
      return defaults();
    }
  }

  let state = loadCache();
  let yearFilter = "all";
  let syncRev = null;        // 云端版本号
  let online = false;        // 是否连着云端
  let pendingConflict = null;

  function cacheLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* 本地缓存失败不影响云端保存 */
    }
  }

  function setSync(mode, when, message) {
    const el = $("#syncState");
    if (!el) return;
    if (mode === "local") el.textContent = "仅保存在本机（未连接云端）";
    else if (mode === "offline") el.textContent = "离线 · 仅保存在本机";
    else if (mode === "saving") el.textContent = "同步中…";
    else if (mode === "saved") {
      const t = when ? new Date(when) : new Date();
      el.textContent = "已同步云端 · " + pad(t.getHours()) + ":" + pad(t.getMinutes());
    } else if (mode === "error") el.textContent = "云端未同步" + (message ? "（" + message + "）" : "");
  }

  async function persist(force = false) {
    cacheLocal();
    if (!online) return true;
    setSync("saving");
    const r = await window.RoomAPI.save(state, syncRev, force);
    if (r.ok) {
      syncRev = r.rev;
      setSync("saved", r.updatedAt);
      return true;
    }
    if (r.conflict) {
      pendingConflict = r;
      $("#conflictModal").hidden = false;
      document.documentElement.style.overflow = "hidden";
      return false;
    }
    if (r.locked) {
      showGate("登录已失效，请重新输入暗号");
      return false;
    }
    setSync("error");
    toast("云端没保存成功：" + (r.message || "网络问题") + "（本机已存）");
    return false;
  }

  /* ---------------- 工具 ---------------- */
  function fmt(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${y}.${m}.${d}`;
  }
  function fmtShort(iso) {
    const [y, m, d] = iso.split("-");
    return { d, m: `${y} · ${m}` };
  }
  function daysSince(iso) {
    const s = new Date(iso + "T00:00:00");
    const now = new Date();
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((a - s) / 86400000) + 1);
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3200);
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------------- 照片墙自动排版 ---------------- */
  function layout(n) {
    const vw = window.innerWidth || 1440;
    const vh = window.innerHeight || 900;
    const aspect = vw / vh;                    // 1vw = aspect * vh
    const wallW = vw <= 900 ? 300 : 195;       // 与 CSS 里 .wall 宽度一致
    const projW = wallW * 0.5;                 // z=-1600, perspective=1600
    const visFrac = Math.min(1, 100 / projW);
    const vL = 50 - 50 * visFrac;
    const vR = 50 + 50 * visFrac;

    const isSmall = vw <= 900;
    const gapX = 2.6;
    const areaL = isSmall ? vL + 3 : 32;
    const areaR = isSmall ? vR - 3 : Math.min(96, vR - 2);
    const baseW = isSmall ? 18 : 14.4;
    const maxCols = isSmall ? 2 : 4;

    let cols = Math.max(1, Math.min(maxCols, Math.floor((areaR - areaL + gapX) / (baseW + gapX))));
    cols = Math.min(cols, Math.max(1, n));
    const w = Math.min(baseW, (areaR - areaL - (cols - 1) * gapX) / cols);

    const clusterW = cols * w + (cols - 1) * gapX;
    const centerX = isSmall ? 50 : (areaL + areaR) / 2;
    const startX = centerX - clusterW / 2;

    const photoWvw = wallW * w / 100;
    const phvw = (photoWvw - 1.7) * 0.75 + 0.85 + 3.2;
    const ph = phvw * aspect / 1.56;           // 单张照片占墙面高度的百分比
    const rows = Math.ceil(n / cols);
    const pitch = ph + 3.2;
    const totalH = rows * ph + (rows - 1) * 3.2;
    const top = Math.max(4, 42 - totalH / 2);
    return { cols, w, gapX, ph, pitch, top, rows, startX };
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }

  function slotOf(i, n, id) {
    const L = layout(n);
    const col = i % L.cols;
    const row = Math.floor(i / L.cols);
    const r = k => hash((id || "seed") + ":" + i + ":" + k);
    const dy = (r(1) - 0.5) * 3.4;
    const dx = (r(2) - 0.5) * 1.4;
    const rot = (r(3) - 0.5) * 4.4;
    const dw = (r(4) - 0.5) * 1.7;
    return {
      x: L.startX + col * (L.w + L.gapX) + dx,
      y: L.top + row * L.pitch + dy,
      w: L.w + dw,
      rot
    };
  }

  /* ---------------- 渲染：首屏 ---------------- */
  function renderBrand() {
    const s = state.settings;
    $("#brandTitle").textContent = s.title;
    $("#brandSub").textContent = s.subtitle;
    $("#brandSince").textContent = fmt(s.startDate);
    $("#archiveStart").textContent = fmt(s.startDate);
    document.title = s.title + " · 恋爱记事";
  }

  function renderStats() {
    const n = state.memories.length;
    const days = daysSince(state.settings.startDate);
    $("#daysTogether").textContent = days.toLocaleString("en-US");
    $("#statMoments").textContent = n + " 个瞬间";
    const years = new Set(state.memories.map(m => m.date.slice(0, 4)));
    $("#statYears").textContent = Math.max(1, years.size) + " 年";
    $("#archiveCount").textContent = n;
  }

  function renderWall() {
    const box = $("#wallPhotos");
    box.innerHTML = "";
    const list = state.memories.slice().sort((a, b) => (a.date < b.date ? -1 : 1));

    list.forEach((m, i) => {
      const base = slotOf(i, list.length, m.id);

      const el = document.createElement("div");
      el.className = "photo";
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${fmt(m.date)} ${m.title}`);
      el.dataset.id = m.id;
      el.style.cssText = `--x:${base.x};--y:${base.y};--w:${base.w};--rot:${base.rot}deg;--ry:${(i % 3 - 1) * 1.6}deg`;

      const cover = m.photos[0];
      el.innerHTML = `
        <img src="${cover || ""}" alt="${escapeAttr(m.title)}" ${cover ? "" : 'style="opacity:0"'} loading="lazy">
        <span class="cap">${fmt(m.date)}</span>
        <span class="photo-tools">
          <button type="button" data-act="edit" title="编辑">✎</button>
          <button type="button" data-act="del" title="删除">✕</button>
        </span>`;
      if (!cover) el.classList.add("no-photo");
      box.appendChild(el);
    });

    if (document.body.classList.contains("editing")) {
      const base = slotOf(list.length, Math.max(list.length + 1, 3), "add");
      const add = document.createElement("div");
      add.className = "photo add";
      add.id = "addTile";
      add.setAttribute("role", "button");
      add.tabIndex = 0;
      add.style.cssText = `--x:${base.x};--y:${base.y};--w:${base.w};--rot:1.2deg`;
      add.innerHTML = `<span class="plus">＋</span><span>新的回忆</span>`;
      add.addEventListener("click", () => openEditor(null));
      box.appendChild(add);
    }
  }

  /* ---------------- 渲染：时间线 ---------------- */
  function renderChips() {
    const years = Array.from(new Set(state.memories.map(m => m.date.slice(0, 4)))).sort().reverse();
    const box = $("#yearChips");
    if (years.length < 2) { box.innerHTML = ""; return; }
    box.innerHTML = `<button class="chip" type="button" data-year="all" aria-pressed="${yearFilter === "all"}">全部</button>` +
      years.map(y => `<button class="chip" type="button" data-year="${y}" aria-pressed="${yearFilter === y}">${y}</button>`).join("");
    $$(".chip", box).forEach(b => b.addEventListener("click", () => {
      yearFilter = b.dataset.year;
      renderChips();
      renderTimeline();
    }));
  }

  function renderTimeline() {
    const box = $("#timeline");
    const list = state.memories
      .filter(m => yearFilter === "all" || m.date.startsWith(yearFilter))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    box.innerHTML = list.map(m => {
      const { d, m: mm } = fmtShort(m.date);
      const cover = m.photos[0];
      return `
      <article class="entry ${cover ? "has-photo" : ""}" data-id="${m.id}" tabindex="0">
        <div class="entry-date">
          <span class="d">${d}</span>
          <span class="m">${mm}</span>
          <i class="dot"></i>
        </div>
        <div class="entry-body">
          ${cover ? `<div class="entry-media"><img src="${cover}" alt="${escapeAttr(m.title)}" loading="lazy"></div>` : ""}
          <div class="entry-text">
            ${m.place ? `<div class="entry-place">${escapeAttr(m.place)}</div>` : ""}
            <h3>${escapeAttr(m.title)}</h3>
            <p class="entry-note">${escapeAttr(m.note)}</p>
            <span class="entry-more">展开看看 →</span>
          </div>
        </div>
        <div class="entry-tools">
          <button type="button" data-act="edit">编辑</button>
          <button type="button" data-act="del">删除</button>
        </div>
      </article>`;
    }).join("");

    $("#archiveEmpty").hidden = list.length > 0;

    $$(".entry", box).forEach(el => {
      el.addEventListener("click", e => {
        const act = e.target.closest("[data-act]");
        if (act) {
          e.stopPropagation();
          if (act.dataset.act === "edit") openEditor(el.dataset.id);
          else confirmDelete(el.dataset.id);
          return;
        }
        openDetail(el.dataset.id);
      });
      el.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(el.dataset.id); }
      });
    });
  }

  /* ---------------- 详情弹窗 ---------------- */
  const detail = { id: null, idx: 0 };

  function openDetail(id, idx = 0) {
    const m = state.memories.find(x => x.id === id);
    if (!m) return;
    detail.id = id;
    detail.idx = Math.min(idx, Math.max(0, m.photos.length - 1));

    $("#detailDate").textContent = fmt(m.date);
    $("#detailTitle").textContent = m.title;
    $("#detailPlace").textContent = m.place || "";
    $("#detailNote").textContent = m.note || "（还没写什么）";

    const media = $(".detail-media");
    if (m.photos.length) {
      $("#detailImg").src = m.photos[detail.idx];
      media.style.display = "";
      $("#detailPrev").style.display = m.photos.length > 1 ? "" : "none";
      $("#detailNext").style.display = m.photos.length > 1 ? "" : "none";
      $("#detailDots").innerHTML = m.photos.length > 1
        ? m.photos.map((_, i) => `<i class="${i === detail.idx ? "on" : ""}"></i>`).join("")
        : "";
    } else {
      $("#detailImg").removeAttribute("src");
      media.style.display = "none";
    }
    $("#detailIndex").textContent = m.photos.length ? `${detail.idx + 1} / ${m.photos.length} 张` : "没有照片";
    $("#detailEdit").dataset.id = id;
    show("#detailModal");
  }

  function stepDetail(dir) {
    const m = state.memories.find(x => x.id === detail.id);
    if (!m || m.photos.length < 2) return;
    detail.idx = (detail.idx + dir + m.photos.length) % m.photos.length;
    openDetail(detail.id, detail.idx);
  }

  /* ---------------- 编辑弹窗 ---------------- */
  let draft = { id: null, photos: [] };

  function openEditor(id) {
    const form = $("#editorForm");
    form.reset();
    $("#thumbs").innerHTML = "";
    $("#btnDelete").hidden = true;

    if (id) {
      const m = state.memories.find(x => x.id === id);
      if (!m) return;
      draft = { id, photos: m.photos.slice() };
      $("#editorTitle").textContent = "修改这段回忆";
      form.elements.date.value = m.date;
      form.elements.title.value = m.title;
      form.elements.place.value = m.place;
      form.elements.note.value = m.note;
      $("#btnDelete").hidden = false;
    } else {
      const today = new Date();
      draft = { id: null, photos: [] };
      $("#editorTitle").textContent = "新的回忆";
      form.elements.date.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      form.elements.title.value = "";
      form.elements.place.value = "";
      form.elements.note.value = "";
    }
    renderThumbs();
    show("#editorModal");
    setTimeout(() => form.elements.title.focus(), 60);
  }

  function renderThumbs() {
    const box = $("#thumbs");
    box.innerHTML = draft.photos.map((src, i) => `
      <div class="thumb ${i === 0 ? "cover" : ""}" data-i="${i}">
        <img src="${src}" alt="">
        <button type="button" data-remove="${i}" aria-label="移除">✕</button>
      </div>`).join("");
    $$("[data-remove]", box).forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      draft.photos.splice(Number(b.dataset.remove), 1);
      renderThumbs();
    }));
  }

  function fileToDataURL(file, max = 1400, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error("not image"));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          const ctx = c.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg", quality));
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load fail")); };
      img.src = url;
    });
  }

  async function handleFiles(files) {
    const arr = Array.from(files).slice(0, 6);
    if (!arr.length) return;
    toast("正在压缩照片…");
    for (const f of arr) {
      try {
        const data = await fileToDataURL(f);
        draft.photos.push(data);
      } catch (e) {
        toast("有张照片读不出来：" + f.name);
      }
    }
    renderThumbs();
  }

  async function submitEditor(e) {
    e.preventDefault();
    const form = e.target;
    const snapshot = JSON.stringify(state);
    const data = {
      date: form.elements.date.value || "2022-10-01",
      title: (form.elements.title.value || "").trim() || "没有标题",
      place: (form.elements.place.value || "").trim(),
      note: (form.elements.note.value || "").trim()
    };
    if (draft.id) {
      const m = state.memories.find(x => x.id === draft.id);
      Object.assign(m, data, { photos: draft.photos.slice() });
      toast("已经改好了");
    } else {
      state.memories.push(Object.assign({ id: uid(), photos: draft.photos.slice() }, data));
      toast("记下来了");
    }
    cacheLocal();
    refresh();
    const ok = await persist();
    if (!ok && online && !pendingConflict) {
      state = JSON.parse(snapshot);
      refresh();
      return;
    }
    hide("#editorModal");
  }

  async function confirmDelete(id) {
    const m = state.memories.find(x => x.id === id);
    if (!m) return;
    if (!confirm(`删除「${m.title}」这条回忆？删掉就找不回来了。`)) return;
    const snapshot = JSON.stringify(state);
    state.memories = state.memories.filter(x => x.id !== id);
    cacheLocal();
    refresh();
    const ok = await persist();
    if (!ok && online && !pendingConflict) {
      state = JSON.parse(snapshot);
      refresh();
      return;
    }
    toast("已删除");
  }

  /* ---------------- 设置 ---------------- */
  function openSettings() {
    const f = $("#settingsForm");
    f.elements.title.value = state.settings.title;
    f.elements.subtitle.value = state.settings.subtitle;
    f.elements.startDate.value = state.settings.startDate;
    show("#settingsModal");
  }

  async function submitSettings(e) {
    e.preventDefault();
    const f = e.target;
    state.settings.title = (f.elements.title.value || "").trim() || "我们的小屋";
    state.settings.subtitle = (f.elements.subtitle.value || "").trim();
    state.settings.startDate = f.elements.startDate.value || state.settings.startDate;
    cacheLocal();
    refresh();
    hide("#settingsModal");
    await persist();
    toast("设置已保存");
  }

  /* ---------------- 备份 ---------------- */
  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `我们的小屋-备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("备份已下载");
  }

  function importJSON(file) {
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const parsed = JSON.parse(fr.result);
        if (!parsed || !Array.isArray(parsed.memories)) throw new Error("bad");
        state = normalize(parsed);
        yearFilter = "all";
        cacheLocal();
        refresh();
        await persist(true);
        toast("备份已导入");
      } catch (e) {
        toast("这个文件读不出来，确认是从本页导出的备份吗？");
      }
    };
    fr.readAsText(file);
  }

  /* ---------------- 弹窗控制 ---------------- */
  function show(sel) {
    const el = $(sel);
    el.hidden = false;
    document.documentElement.style.overflow = "hidden";
  }
  function hide(sel) {
    const el = $(sel);
    el.hidden = true;
    if (!$$(".modal:not([hidden])").length && $("#gate").hidden) document.documentElement.style.overflow = "";
  }

  function showGate(msg) {
    const g = $("#gate");
    g.hidden = false;
    $("#gateErr").textContent = msg || "";
    $("#gatePass").value = "";
    document.documentElement.style.overflow = "hidden";
    setTimeout(() => $("#gatePass").focus(), 120);
  }
  function hideGate() {
    $("#gate").hidden = true;
    document.documentElement.style.overflow = "";
  }

  /* ---------------- 视差 / 滚动 ---------------- */
  function initMotion() {
    const room = $("#room");
    const hero = $("#hero");
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function loop() {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      room.style.setProperty("--ry", (cx * 1.5).toFixed(3) + "deg");
      room.style.setProperty("--rx", (-cy * 0.9).toFixed(3) + "deg");
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = null;
      }
    }

    if (!reduce) {
      hero.addEventListener("mousemove", e => {
        const r = hero.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      hero.addEventListener("mouseleave", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
    }

    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const p = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
        room.style.setProperty("--dolly", (p * 320).toFixed(1) + "px");
        const hud = $(".hud-bottom");
        if (hud) hud.style.opacity = String(Math.max(0, 1 - p * 2.2));
        ticking = false;
      });
    }, { passive: true });
  }

  function initDust() {
    const box = $("#dust");
    if (!box) return;
    const n = 26;
    let html = "";
    for (let i = 0; i < n; i++) {
      const s = (0.15 + Math.random() * 0.35).toFixed(2);
      html += `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--y:${(30 + Math.random() * 60).toFixed(1)}%;
        --s:${s}vw;--dur:${(14 + Math.random() * 16).toFixed(1)}s;--delay:${(-Math.random() * 20).toFixed(1)}s;
        --o:${(0.2 + Math.random() * 0.5).toFixed(2)};--dx:${(Math.random() * 6 - 3).toFixed(1)}vw"></i>`;
    }
    box.innerHTML = html;
  }

  /* ---------------- 刷新 ---------------- */
  function refresh() {
    renderBrand();
    renderStats();
    renderWall();
    renderChips();
    renderTimeline();
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindUI() {
    $("#btnEdit").addEventListener("click", () => {
      const on = document.body.classList.toggle("editing");
      $("#btnEdit").setAttribute("aria-pressed", String(on));
      renderWall();
      if (on) toast("编辑模式已打开：点照片可修改，点虚线框添加新回忆");
    });
    $("#btnDone").addEventListener("click", () => {
      document.body.classList.remove("editing");
      $("#btnEdit").setAttribute("aria-pressed", "false");
      renderWall();
    });
    $("#btnAddTop").addEventListener("click", () => openEditor(null));
    $("#btnSettings").addEventListener("click", openSettings);

    $("#wallPhotos").addEventListener("click", e => {
      const tools = e.target.closest("[data-act]");
      const card = e.target.closest(".photo");
      if (!card || card.classList.contains("add")) return;
      const id = card.dataset.id;
      if (tools) {
        e.stopPropagation();
        if (tools.dataset.act === "edit") openEditor(id);
        else confirmDelete(id);
        return;
      }
      if (document.body.classList.contains("editing")) openEditor(id);
      else openDetail(id);
    });
    $("#wallPhotos").addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest(".photo");
      if (!card || card.classList.contains("add")) return;
      e.preventDefault();
      if (document.body.classList.contains("editing")) openEditor(card.dataset.id);
      else openDetail(card.dataset.id);
    });

    $("#detailModal").addEventListener("click", e => {
      if (e.target.closest("[data-close]")) hide("#detailModal");
    });
    $("#detailPrev").addEventListener("click", e => { e.stopPropagation(); stepDetail(-1); });
    $("#detailNext").addEventListener("click", e => { e.stopPropagation(); stepDetail(1); });
    $("#detailEdit").addEventListener("click", () => {
      hide("#detailModal");
      openEditor(detail.id);
    });

    $("#editorForm").addEventListener("submit", submitEditor);
    $("#editorForm").addEventListener("click", e => {
      if (e.target.closest("[data-close]")) hide("#editorModal");
    });
    $("#btnDelete").addEventListener("click", () => {
      hide("#editorModal");
      confirmDelete(draft.id);
    });

    const drop = $("#dropZone");
    const fileInput = $("#filePhotos");
    drop.addEventListener("click", e => {
      if (e.target.closest(".thumb")) return;
      fileInput.click();
    });
    fileInput.addEventListener("change", () => { handleFiles(fileInput.files); fileInput.value = ""; });
    ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => {
      e.preventDefault(); drop.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => {
      e.preventDefault(); drop.classList.remove("dragover");
    }));
    drop.addEventListener("drop", e => {
      if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });

    $("#settingsForm").addEventListener("submit", submitSettings);
    $("#settingsForm").addEventListener("click", e => {
      if (e.target.closest("[data-close]")) hide("#settingsModal");
    });
    $("#btnReset").addEventListener("click", async () => {
      if (!confirm("恢复成示例数据？现在的内容会被覆盖（建议先导出备份）。")) return;
      state = defaults();
      yearFilter = "all";
      cacheLocal();
      refresh();
      hide("#settingsModal");
      await persist(true);
      toast("已恢复示例数据");
    });

    $("#btnExport").addEventListener("click", exportJSON);
    $("#btnImport").addEventListener("click", () => $("#fileImport").click());
    $("#fileImport").addEventListener("change", e => {
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = "";
    });

    // 口令门
    $("#gateForm").addEventListener("submit", async e => {
      e.preventDefault();
      const p = $("#gatePass").value.trim();
      if (!p) return;
      const btn = e.target.querySelector("button");
      btn.disabled = true;
      btn.textContent = "验证中…";
      window.RoomAPI.setPass(p);
      const res = await window.RoomAPI.load();
      btn.disabled = false;
      btn.textContent = "进去";
      if (res.mode === "online") {
        online = true;
        syncRev = res.rev;
        if (res.data) {
          state = normalize(res.data);
          cacheLocal();
        } else {
          await persist();
        }
        refresh();
        hideGate();
        setSync("saved", res.updatedAt);
        toast("欢迎回来");
      } else {
        window.RoomAPI.setPass("");
        $("#gateErr").textContent =
          res.mode === "locked" ? "暗号不对，再试一次" : (res.message || "连不上云端，稍后再试");
      }
    });

    // 云端冲突
    $("#conflictRemote").addEventListener("click", () => {
      if (pendingConflict && pendingConflict.data) {
        state = normalize(pendingConflict.data);
        cacheLocal();
      }
      syncRev = pendingConflict ? pendingConflict.rev : null;
      pendingConflict = null;
      $("#conflictModal").hidden = true;
      document.documentElement.style.overflow = "";
      hide("#editorModal");
      refresh();
      setSync("saved", Date.now());
      toast("已换成云端的最新内容");
    });
    $("#conflictLocal").addEventListener("click", async () => {
      pendingConflict = null;
      $("#conflictModal").hidden = true;
      document.documentElement.style.overflow = "";
      hide("#editorModal");
      await persist(true);
      toast("已用本机内容覆盖云端");
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        if (!$("#editorModal").hidden) hide("#editorModal");
        else if (!$("#settingsModal").hidden) hide("#settingsModal");
        else hide("#detailModal");
      }
      if (!$("#detailModal").hidden) {
        if (e.key === "ArrowLeft") stepDetail(-1);
        if (e.key === "ArrowRight") stepDetail(1);
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    refresh();
    initMotion();
    initDust();
    bindUI();

    if (!window.RoomAPI) { setSync("local"); return; }

    const res = await window.RoomAPI.load();
    if (res.mode === "offline") { setSync("offline"); return; }
    if (res.mode === "locked") { showGate(); return; }
    if (res.mode === "error") {
      setSync("error", null, res.message);
      toast(res.message + "（先按本机模式用）");
      return;
    }

    online = true;
    syncRev = res.rev;
    if (res.data) {
      state = normalize(res.data);
      cacheLocal();
      refresh();
      setSync("saved", res.updatedAt);
    } else {
      // 云端还是空的：把当前内容推上去，作为初始版本
      await persist();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
