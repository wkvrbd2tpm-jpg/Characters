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
  const tagBtns = [...document.querySelectorAll(".tag-suggest-btn")];
  const tagList = () => $("#f-tags").value.split(/[,、]/).map((t) => t.trim()).filter(Boolean);
  function syncTagChips() {
    const cur = tagList();
    tagBtns.forEach((b) => b.setAttribute("aria-pressed", String(cur.includes(b.dataset.tag))));
    $("#intro-field").hidden = !cur.includes("プロット");
    $("#plot-url-field").hidden = !cur.includes("プロット");
  }
  tagBtns.forEach((b) => b.addEventListener("click", () => {
    const cur = tagList();
    const i = cur.indexOf(b.dataset.tag);
    if (i >= 0) cur.splice(i, 1); else cur.push(b.dataset.tag);
    $("#f-tags").value = cur.join(", ");
    syncTagChips();
  }));

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
    d.site = d.site || {}; d.characters = d.characters || [];
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
      ["#list-panel", "#form-panel", "#site-panel"].forEach((s) => ($(s).hidden = false));
      $("#s-title").value = data.site.title || ""; $("#s-lead").value = data.site.lead || "";
      renderList(); resetForm();
    } catch (e) {
      $("#conn").open = true;
      setStatus("#conn-status", explain(e), true);
    }
  }

  let listQuery = "";
  function renderList() {
    const list = $("#list");
    if (!data.characters.length) { list.replaceChildren(el("p", { class: "note" }, "まだキャラクターがいません。")); return; }
    const items = data.characters.map((c, i) => [c, i])
      .filter(([c]) => !listQuery || ((c.name || "") + " " + (c.reading || "")).toLowerCase().includes(listQuery));
    if (!items.length) { list.replaceChildren(el("p", { class: "note" }, "その名前のキャラクターはいません。")); return; }
    list.replaceChildren(...items.map(([c, i]) =>
      el("div", { class: "item" },
        c.images?.[0] ? el("img", { src: c.images[0], alt: "" }) : el("div"),
        el("div", { class: "t" }, c.name + (c.reading ? `（${c.reading}）` : ""), el("small", {}, [c.role, c.age].filter(Boolean).join(" ・ "))),
        el("button", { class: "btn ghost", type: "button", "aria-label": "一番上へ", onclick: () => moveTo(i, 0) }, "⤒"),
        el("button", { class: "btn ghost", type: "button", "aria-label": "上へ", onclick: () => move(i, -1) }, "↑"),
        el("button", { class: "btn ghost", type: "button", "aria-label": "下へ", onclick: () => move(i, 1) }, "↓"),
        el("button", { class: "btn ghost", type: "button", "aria-label": "一番下へ", onclick: () => moveTo(i, data.characters.length - 1) }, "⤓"),
        el("button", { class: "btn ghost", type: "button", onclick: () => edit(c.id) }, "編集"),
        el("button", { class: "btn danger", type: "button", onclick: () => remove(c.id) }, "削除")
      )
    ));
  }

  let orderDirty = false;
  function markOrderDirty() {
    orderDirty = true;
    $("#order-save").hidden = false;
    setStatus("#order-status", "並び順が変わっています。「並び順を保存する」を押すと反映されます。");
  }
  function move(i, d) { moveTo(i, i + d); }
  function moveTo(i, j) {
    if (i === j || j < 0 || j >= data.characters.length) return;
    const [c] = data.characters.splice(i, 1);
    data.characters.splice(j, 0, c);
    renderList(); markOrderDirty();
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
    $("#f-name").value = c.name || ""; $("#f-age").value = c.age || "";
    $("#f-reading").value = c.reading || "";
    setRole(c.role || "");
    $("#f-summary").value = c.summary || ""; $("#f-features").value = c.features || "";
    $("#f-outfit").value = c.outfit || ""; $("#f-notes").value = c.notes || "";
    $("#f-main-prompt").value = c.mainPrompt || ""; $("#f-outfit-prompt").value = c.outfitPrompt || "";
    $("#f-intro").value = c.intro || "";
    const plotUrls = c.plotUrls || {};
    $("#f-plot-zeta").value = plotUrls.zeta || "";
    $("#f-plot-chacha").value = plotUrls.chacha || "";
    $("#f-plot-moox").value = plotUrls.moox || "";
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
        age: $("#f-age").value.trim(),
        role: roleValue,
        summary: $("#f-summary").value.trim(),
        features: $("#f-features").value.trim(),
        outfit: $("#f-outfit").value.trim(),
        notes: $("#f-notes").value.trim(),
        mainPrompt: $("#f-main-prompt").value.trim(),
        outfitPrompt: $("#f-outfit-prompt").value.trim(),
        intro: $("#f-intro").value.trim(),
        plotUrls: {
          zeta: $("#f-plot-zeta").value.trim(),
          chacha: $("#f-plot-chacha").value.trim(),
          moox: $("#f-plot-moox").value.trim(),
        },
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

  prefill();
})();
