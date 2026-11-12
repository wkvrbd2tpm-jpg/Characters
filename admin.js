(() => {
  const $ = (s) => document.querySelector(s);
  const KEY = "char-site-admin";
  const DATA_PATH = "data/characters.json";
  let data = { site: {}, characters: [] };
  let editingId = null;
  let keepImages = [];
  let roleValue = "";
  const roleBtns = [...document.querySelectorAll(".role-btn")];
  function setRole(v) {
    roleValue = v || "";
    roleBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.role === roleValue)));
  }
  roleBtns.forEach((b) => b.addEventListener("click", () => setRole(roleValue === b.dataset.role ? "" : b.dataset.role)));

  /* ---------- tag suggestions ---------- */
  const FIXED_TAGS = ["プロット", "代理", "うちよそ"];
  const DEFAULT_TAGS = ["おじさん", "獣人", "メガネ", "無精ひげ", "長髪", "短髪", "スーツ", "タバコ", "獣耳", "強面", "優しい", "年上", "年下"];
  let tagBtns = [];
  function buildTagChips() {
    const counts = new Map();
    (data.characters || []).forEach((c) => (c.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    const rest = [...counts.keys()].filter((t) => !FIXED_TAGS.includes(t));
    rest.sort((a, b) => counts.get(b) - counts.get(a));
    DEFAULT_TAGS.forEach((t) => { if (!rest.includes(t)) rest.push(t); });
    const box = $("#tag-suggest");
    box.replaceChildren();
    tagBtns = [...FIXED_TAGS, ...rest].map((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip tag-suggest-btn" + (t === "プロット" ? " plot" : "") + (t === "うちよそ" ? " uchiyoso" : "");
      b.dataset.tag = t;
      b.setAttribute("aria-pressed", "false");
      b.textContent = t;
      b.addEventListener("click", () => {
        const cur = tagList();
        const i = cur.indexOf(t);
        if (i >= 0) cur.splice(i, 1); else cur.push(t);
        $("#f-tags").value = cur.join(", ");
        syncTagChips();
      });
      box.append(b);
      return b;
    });
    syncTagChips();
  }
  const tagList = () => $("#f-tags").value.split(/[,、]/).map((t) => t.trim()).filter(Boolean);
  function syncTagChips() {
    const cur = tagList();
    tagBtns.forEach((b) => b.setAttribute("aria-pressed", String(cur.includes(b.dataset.tag))));
    $("#intro-field").hidden = !cur.includes("プロット");
    $("#plot-url-field").hidden = !cur.includes("プロット");
    $("#index-flag-field").hidden = !cur.includes("プロット");
    $("#prompt-fields").hidden = !(cur.includes("代理") || cur.includes("うちよそ"));
  }
  buildTagChips();

  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };

  /* ---------- settings ---------- */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
    clear() { try { localStorage.removeItem(KEY); } catch {} },
  };
  const cfg = () => ({
    owner: $("#owner").value.trim(), repo: $("#repo").value.trim(),
    branch: $("#branch").value.trim() || "main", token: $("#token").value.trim(),
  });

  function prefill() {
    const s = store.get();
    let owner = s.owner, repo = s.repo;
    if (!owner && /\.github\.io$/.test(location.hostname)) {
      owner = location.hostname.split(".")[0];
      repo = location.pathname.split("/")[1] && !location.pathname.split("/")[1].endsWith(".html")
        ? location.pathname.split("/")[1] : location.hostname;
    }
    $("#owner").value = owner || ""; $("#repo").value = repo || "";
    $("#branch").value = s.branch || "main"; $("#token").value = s.token || "";
    if (s.token) { $("#conn").open = false; connect(true); } else { $("#conn").open = true; }
  }

  /* ---------- GitHub API ---------- */
  const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
  async function gh(path, opts = {}) {
    const c = cfg();
    const url = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${enc(path)}`
      + (opts.method && opts.method !== "GET" ? "" : `?ref=${encodeURIComponent(c.branch)}&t=${Date.now()}`);
    const res = await fetch(url, {
      ...opts,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + c.token,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      let msg = res.status + "";
      try { msg = (await res.json()).message || msg; } catch {}
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res.json();
  }
  const b64ToText = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (ch) => ch.charCodeAt(0)));
  const textToB64 = (t) => {
    const bytes = new TextEncoder().encode(t); let s = "";
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s);
  };

  async function fetchData() {
    const f = await gh(DATA_PATH);
    const d = JSON.parse(b64ToText(f.content));
    d.site = d.site || {}; d.characters = d.characters || []; d.plots = d.plots || [];
    return { data: d, sha: f.sha };
  }
  async function putData(next, message) {
    const cur = await gh(DATA_PATH); // 最新の sha を取り直す
    await gh(DATA_PATH, {
      method: "PUT",
      body: JSON.stringify({
        message, branch: cfg().branch, sha: cur.sha,
        content: textToB64(JSON.stringify(next, null, 2) + "\n"),
      }),
    });
    data = next;
  }
  async function putImage(path, base64) {
    await gh(path, { method: "PUT", body: JSON.stringify({ message: "画像を追加: " + path, branch: cfg().branch, content: base64 }) });
  }
  async function deleteFile(path) {
    try {
      const f = await gh(path);
      await gh(path, { method: "DELETE", body: JSON.stringify({ message: "画像を削除: " + path, branch: cfg().branch, sha: f.sha }) });
    } catch {}
  }

  /* ---------- image resize ---------- */
  function toWebp(file, max = 1400) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((blob) => {
          if (!blob) return reject(new Error("画像を変換できませんでした"));
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result.split(",")[1]);
          fr.readAsDataURL(blob);
        }, "image/webp", 0.84);
      };
      img.onerror = () => reject(new Error("画像を読み込めませんでした: " + file.name));
      img.src = url;
    });
  }

  /* ---------- UI ---------- */
  const setStatus = (id, msg, err) => { const s = $(id); s.textContent = msg; s.className = "status" + (err ? " err" : ""); };

  function explain(e) {
    if (e.status === 401) return "トークンが正しくないか、期限切れです。";
    if (e.status === 403) return "このトークンには書き込み権限がありません(Contents を Read and write にしてください)。";
    if (e.status === 404) return "リポジトリまたはファイルが見つかりません。ユーザー名・リポジトリ名・ブランチと、トークンの対象リポジトリを確認してください。";
    return "エラー: " + e.message;
  }

  async function connect(silent) {
    const c = cfg();
    if (!c.owner || !c.repo || !c.token) { setStatus("#conn-status", "すべて入力してください。", true); return; }
    setStatus("#conn-status", "読み込み中…");
    try {
      const r = await fetchData();
      data = r.data;
      store.set(c);
      setStatus("#conn-status", "接続しました。");
      $("#conn").open = false;
      ["#list-panel", "#form-panel", "#site-panel", "#plots-panel"].forEach((s) => ($(s).hidden = false));
      $("#s-title").value = data.site.title || ""; $("#s-lead").value = data.site.lead || "";
      renderList(); resetForm(); renderPlots(); resetPlotForm();
    } catch (e) {
      $("#conn").open = true;
      setStatus("#conn-status", explain(e), true);
    }
  }

  let listQuery = "";
  function renderList() {
    buildTagChips();
    const list = $("#list");
    if (!data.characters.length) { list.replaceChildren(el("p", { class: "note" }, "まだキャラクターがいません。")); return; }
    const items = data.characters
      .filter((c) => !listQuery || ((c.name || "") + " " + (c.reading || "")).toLowerCase().includes(listQuery));
    if (!items.length) { list.replaceChildren(el("p", { class: "note" }, "その名前のキャラクターはいません。")); return; }
    list.replaceChildren(...items.map((c) => {
      const card = el("div", { class: "acard" },
        c.images?.[0] ? el("img", { src: c.images[0], alt: "", loading: "lazy", draggable: "false" }) : el("div", { class: "aimg-empty" }),
        el("div", { class: "aname" }, c.name || "（名前なし）"),
        el("div", { class: "afoot" },
          el("button", { class: "btn ghost", type: "button", onclick: () => edit(c.id) }, "編集"),
          el("button", { class: "btn danger", type: "button", onclick: () => remove(c.id) }, "削除")
        )
      );
      card.dataset.id = c.id;
      card.addEventListener("click", (e) => {
        if (card.dataset.suppress) { delete card.dataset.suppress; return; }
        if (!e.target.closest("button")) edit(c.id);
      });
      if (!listQuery) attachDrag(card, list);
      return card;
    }));
  }

  let dragActive = false;
  document.addEventListener("touchmove", (e) => { if (dragActive) e.preventDefault(); }, { passive: false });

  function attachDrag(card, list) {
    let timer = null, dragging = false, sx = 0, sy = 0, ph = null, grabDX = 0, grabDY = 0;
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const move = (e) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimer();
        return;
      }
      e.preventDefault();
      card.style.left = `${e.clientX - grabDX}px`;
      card.style.top = `${e.clientY - grabDY}px`;
      const below = document.elementFromPoint(e.clientX, e.clientY);
      const t = below ? below.closest(".acard") : null;
      if (!t || t === card || !list.contains(t)) return;
      const r = t.getBoundingClientRect();
      const after = (e.clientY - r.top) / r.height + (e.clientX - r.left) / r.width > 1;
      list.insertBefore(ph, after ? t.nextSibling : t);
    };
    const end = () => {
      clearTimer();
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", end);
      card.removeEventListener("pointercancel", end);
      if (!dragging) return;
      dragging = false;
      dragActive = false;
      if (ph && ph.parentNode) ph.parentNode.replaceChild(card, ph);
      ph = null;
      card.classList.remove("dragging");
      card.style.cssText = "";
      const ids = [...list.querySelectorAll(".acard")].map((n) => n.dataset.id);
      data.characters.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      markOrderDirty();
    };
    card.addEventListener("contextmenu", (e) => e.preventDefault());
    card.addEventListener("pointerdown", (e) => {
      if (listQuery) return;
      if (e.target.closest("button")) return;
      sx = e.clientX; sy = e.clientY;
      timer = setTimeout(() => {
        dragging = true;
        dragActive = true;
        const r = card.getBoundingClientRect();
        grabDX = sx - r.left; grabDY = sy - r.top;
        ph = document.createElement("div");
        ph.className = "acard-ph";
        ph.style.width = `${r.width}px`;
        ph.style.height = `${r.height}px`;
        card.parentNode.insertBefore(ph, card);
        card.classList.add("dragging");
        card.style.cssText = `position:fixed; left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px; margin:0; z-index:80; pointer-events:none; touch-action:none;`;
        try { card.setPointerCapture(e.pointerId); } catch (_) {}
        if (navigator.vibrate) navigator.vibrate(10);
      }, 260);
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerup", end);
      card.addEventListener("pointercancel", end);
    });
  }

  let orderDirty = false;
  function markOrderDirty() {
    orderDirty = true;
    $("#order-save").hidden = false;
    setStatus("#order-status", "並び順が変わっています。「並び順を保存する」を押すと反映されます。");
  }
  function resetForm() {
    editingId = null; keepImages = [];
    $("#form").reset();
    setRole(""); syncTagChips();
    $("#form-title").textContent = "③ キャラクターを追加";
    renderCurImgs(); setStatus("#status", "");
  }

  function renderCurImgs() {
    const box = $("#cur-imgs");
    if (!keepImages.length) { box.replaceChildren(el("span", { class: "note" }, "なし")); return; }
    box.replaceChildren(...keepImages.map((it) => {
      const cb = el("input", { type: "checkbox", checked: "" });
      cb.checked = it.keep;
      cb.addEventListener("change", () => (it.keep = cb.checked));
      return el("figure", {}, el("img", { src: it.path, alt: "" }), el("label", {}, cb, " 残す"));
    }));
  }

  function edit(id) {
    const c = data.characters.find((x) => x.id === id); if (!c) return;
    editingId = id;
    keepImages = (c.images || []).map((p) => ({ path: p, keep: true }));
    $("#f-name").value = c.name || ""; $("#f-age").value = c.age || ""; $("#f-height").value = c.height || ""; $("#f-cv").value = c.imageCv || ""; $("#f-birthday").value = c.birthday || "";
    $("#f-reading").value = c.reading || "";
    setRole(c.role || "");
    $("#f-summary").value = c.summary || "";
    $("#f-notes").value = c.notes || "";
    $("#f-main-prompt").value = c.mainPrompt || ""; $("#f-outfit-prompt").value = c.outfitPrompt || ""; $("#f-body-prompt").value = c.bodyPrompt || "";
    $("#f-intro").value = c.intro || "";
    const plotUrls = c.plotUrls || {};
    $("#f-plot-zeta").value = plotUrls.zeta || "";
    $("#f-plot-chacha").value = plotUrls.chacha || "";
    $("#f-plot-moox").value = plotUrls.moox || "";
    const plotTitles = c.plotTitles || {};
    $("#f-ptitle-zeta").value = plotTitles.zeta || "";
    $("#f-ptitle-chacha").value = plotTitles.chacha || "";
    $("#f-ptitle-moox").value = plotTitles.moox || "";
    $("#f-show-index").checked = !!c.showInIndex;
    $("#f-tags").value = (c.tags || []).join(", ");
    syncTagChips();
    $("#f-files").value = "";
    $("#form-title").textContent = "③ 「" + c.name + "」を編集";
    renderCurImgs(); setStatus("#status", "");
    $("#form-panel").scrollIntoView({ behavior: "smooth" });
  }

  async function remove(id) {
    const c = data.characters.find((x) => x.id === id); if (!c) return;
    if (!confirm(`「${c.name}」を削除します。元に戻せません。よろしいですか?`)) return;
    try {
      const next = structuredClone(data);
      next.characters = next.characters.filter((x) => x.id !== id);
      await putData(next, "キャラクターを削除: " + c.name);
      for (const p of c.images || []) await deleteFile(p);
      renderList(); if (editingId === id) resetForm();
    } catch (e) { alert(explain(e)); }
  }

  $("#form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = $("#save"); btn.disabled = true;
    try {
      const id = editingId || "c" + Date.now().toString(36);
      const files = [...$("#f-files").files];
      const newPaths = [];
      for (let i = 0; i < files.length; i++) {
        setStatus("#status", `画像をアップロード中… (${i + 1}/${files.length})`);
        const path = `images/${id}-${Date.now().toString(36)}${i}.webp`;
        await putImage(path, await toWebp(files[i]));
        newPaths.push(path);
      }
      const kept = keepImages.filter((x) => x.keep).map((x) => x.path);
      const removed = keepImages.filter((x) => !x.keep).map((x) => x.path);
      const entry = {
        id,
        name: $("#f-name").value.trim(),
        reading: $("#f-reading").value.trim(),
        age: (() => {
          let v = $("#f-age").value.trim().replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
          if (/^\d+$/.test(v)) v += "歳";
          return v;
        })(),
        height: (() => {
          let v = $("#f-height").value.trim().replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
          if (/^\d+$/.test(v)) v += "cm";
          return v;
        })(),
        imageCv: $("#f-cv").value.trim(),
        birthday: $("#f-birthday").value.trim(),
        role: roleValue,
        summary: $("#f-summary").value.trim(),
        notes: $("#f-notes").value.trim(),
        mainPrompt: $("#f-main-prompt").value.trim(),
        outfitPrompt: $("#f-outfit-prompt").value.trim(),
        bodyPrompt: $("#f-body-prompt").value.trim(),
        intro: $("#f-intro").value.trim(),
        plotUrls: {
          zeta: $("#f-plot-zeta").value.trim(),
          chacha: $("#f-plot-chacha").value.trim(),
          moox: $("#f-plot-moox").value.trim(),
        },
        plotTitles: {
          zeta: $("#f-ptitle-zeta").value.trim(),
          chacha: $("#f-ptitle-chacha").value.trim(),
          moox: $("#f-ptitle-moox").value.trim(),
        },
        showInIndex: $("#f-show-index").checked,
        tags: $("#f-tags").value.split(/[,、]/).map((t) => t.trim()).filter(Boolean),
        images: [...kept, ...newPaths],
      };
      const next = structuredClone(data);
      const idx = next.characters.findIndex((x) => x.id === id);
      if (idx >= 0) next.characters[idx] = entry; else next.characters.push(entry);
      setStatus("#status", "保存中…");
      await putData(next, (idx >= 0 ? "キャラクターを更新: " : "キャラクターを追加: ") + entry.name);
      for (const p of removed) await deleteFile(p);
      renderList(); resetForm();
      setStatus("#status", "保存しました。サイトに反映されるまで1〜2分かかります。");
    } catch (e) {
      setStatus("#status", explain(e), true);
    } finally { btn.disabled = false; }
  });

  $("#new-btn").addEventListener("click", resetForm);
  $("#list-q").addEventListener("input", (e) => { listQuery = e.target.value.trim().toLowerCase(); renderList(); });
  $("#order-save").addEventListener("click", async () => {
    const btn = $("#order-save"); btn.disabled = true;
    try {
      setStatus("#order-status", "保存中…");
      await putData(structuredClone(data), "並び順を変更");
      orderDirty = false; btn.hidden = true;
      setStatus("#order-status", "保存しました。サイトに反映されるまで1〜2分かかります。");
    } catch (e) { setStatus("#order-status", explain(e), true); }
    finally { btn.disabled = false; }
  });
  $("#f-tags").addEventListener("input", syncTagChips);
  $("#connect").addEventListener("click", () => connect(false));
  $("#forget").addEventListener("click", () => { store.clear(); $("#token").value = ""; setStatus("#conn-status", "保存した情報を消しました。"); });

  $("#s-save").addEventListener("click", async () => {
    try {
      const next = structuredClone(data);
      next.site = { title: $("#s-title").value.trim(), lead: $("#s-lead").value.trim() };
      setStatus("#s-status", "保存中…");
      await putData(next, "サイト情報を更新");
      setStatus("#s-status", "保存しました。反映まで1〜2分かかります。");
    } catch (e) { setStatus("#s-status", explain(e), true); }
  });

  /* ---------- 推しプロット ---------- */
  let editingPlotId = null;
  let plotThumb = "";
  let plotThumbRemoved = false;

  function renderPlots() {
    const box = $("#plots-list");
    const plots = data.plots || [];
    if (!plots.length) { box.replaceChildren(el("p", { class: "note" }, "まだプロットが登録されていません。")); return; }
    box.replaceChildren(...plots.map((p) =>
      el("div", { class: "prow" },
        p.thumb ? el("img", { src: p.thumb, alt: "", loading: "lazy" }) : el("div", { class: "pthumb-empty" }, "自動表示"),
        el("div", { class: "ptitle" }, p.title || "（タイトルなし）"),
        el("button", { class: "btn ghost", type: "button", onclick: () => editPlot(p.id) }, "編集"),
        el("button", { class: "btn danger", type: "button", onclick: () => removePlot(p.id) }, "削除")
      )
    ));
  }

  function renderPlotThumb() {
    const box = $("#p-cur-thumb");
    if (!plotThumb) { box.replaceChildren(el("span", { class: "note" }, "なし（自動表示になります）")); return; }
    if (plotThumbRemoved) { box.replaceChildren(el("span", { class: "note" }, "保存すると削除されます")); return; }
    const cb = el("input", { type: "checkbox", checked: "" });
    cb.checked = true;
    cb.addEventListener("change", () => { plotThumbRemoved = !cb.checked; renderPlotThumb(); });
    box.replaceChildren(el("figure", {}, el("img", { src: plotThumb, alt: "" }), el("label", {}, cb, " 残す")));
  }

  function resetPlotForm() {
    editingPlotId = null; plotThumb = ""; plotThumbRemoved = false;
    $("#plot-form").reset();
    $("#plot-form-title").textContent = "プロットを追加";
    renderPlotThumb(); setStatus("#p-status", "");
  }

  function editPlot(id) {
    const p = (data.plots || []).find((x) => x.id === id); if (!p) return;
    editingPlotId = id; plotThumb = p.thumb || ""; plotThumbRemoved = false;
    $("#p-title").value = p.title || "";
    $("#p-url").value = p.url || "";
    $("#p-service").value = p.service || "";
    $("#p-comment").value = p.comment || "";
    $("#p-file").value = "";
    $("#plot-form-title").textContent = "「" + (p.title || "") + "」を編集";
    renderPlotThumb(); setStatus("#p-status", "");
    $("#plots-panel").scrollIntoView({ behavior: "smooth" });
  }

  async function removePlot(id) {
    const p = (data.plots || []).find((x) => x.id === id); if (!p) return;
    if (!confirm(`「${p.title}」を削除します。元に戻せません。よろしいですか?`)) return;
    try {
      const next = structuredClone(data);
      next.plots = (next.plots || []).filter((x) => x.id !== id);
      await putData(next, "プロットを削除: " + p.title);
      if (p.thumb) await deleteFile(p.thumb);
      renderPlots(); if (editingPlotId === id) resetPlotForm();
    } catch (e) { alert(explain(e)); }
  }

  $("#plot-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = $("#p-save"); btn.disabled = true;
    try {
      const id = editingPlotId || "p" + Date.now().toString(36);
      let thumb = plotThumbRemoved ? "" : plotThumb;
      let oldThumb = "";
      const file = $("#p-file").files[0];
      if (file) {
        setStatus("#p-status", "サムネ画像をアップロード中…");
        const path = `images/plot-${id}-${Date.now().toString(36)}.webp`;
        await putImage(path, await toWebp(file, 1000));
        oldThumb = thumb; thumb = path;
      } else if (plotThumbRemoved) {
        oldThumb = plotThumb;
      }
      const entry = {
        id,
        title: $("#p-title").value.trim(),
        url: $("#p-url").value.trim(),
        service: $("#p-service").value,
        comment: $("#p-comment").value.trim(),
        thumb,
      };
      const next = structuredClone(data);
      next.plots = next.plots || [];
      const idx = next.plots.findIndex((x) => x.id === id);
      if (idx >= 0) next.plots[idx] = entry; else next.plots.push(entry);
      setStatus("#p-status", "保存中…");
      await putData(next, (idx >= 0 ? "プロットを更新: " : "プロットを追加: ") + entry.title);
      if (oldThumb && oldThumb !== thumb) await deleteFile(oldThumb);
      renderPlots(); resetPlotForm();
      setStatus("#p-status", "保存しました。サイトに反映されるまで1〜2分かかります。");
    } catch (e) {
      setStatus("#p-status", explain(e), true);
    } finally { btn.disabled = false; }
  });
  $("#p-new").addEventListener("click", resetPlotForm);

  prefill();
})();
