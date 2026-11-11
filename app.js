(() => {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), chipsEl = $("#chips"), q = $("#q");
  const dlg = $("#dlg"), modal = $("#modal");
  let chars = [], activeTag = "", activeTab = "all";
  const tabBtns = [...document.querySelectorAll(".tab")];
  tabBtns.forEach((b) => b.addEventListener("click", () => {
    activeTab = b.dataset.tab;
    tabBtns.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    render();
  }));
  function updateTabCounts() {
    const counts = {
      all: chars.length,
      proxy: chars.filter((c) => (c.tags || []).includes("代理")).length,
      plot: chars.filter((c) => (c.tags || []).includes("プロット")).length,
    };
    const labels = { all: "すべて", proxy: "代理", plot: "プロット" };
    tabBtns.forEach((b) => (b.textContent = `${labels[b.dataset.tab]}（${counts[b.dataset.tab]}）`));
  }

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

  const roleClass = (r) => (r === "攻め" ? "seme" : r === "受け" ? "uke" : "rev");
  const roleBadge = (r) => el("span", { class: "role " + roleClass(r) }, r);

  async function load() {
    try {
      const res = await fetch("data/characters.json?t=" + Date.now());
      const data = await res.json();
      chars = data.characters || [];
      if (data.site) {
        if (data.site.title) { $("#site-title").textContent = data.site.title; document.title = data.site.title; }
        $("#site-lead").textContent = data.site.lead || "";
      }
    } catch (e) {
      grid.replaceChildren(el("p", { class: "empty" }, "データを読み込めませんでした。"));
      return;
    }
    buildChips();
    updateTabCounts();
    render();
    openFromHash();
  }

  function buildChips() {
    const roles = ["攻め", "受け", "リバ"].filter((r) => chars.some((c) => c.role === r));
    const tags = [...roles, ...new Set(chars.flatMap((c) => c.tags || []))];
    chipsEl.replaceChildren(
      ...tags.map((t) =>
        el("button", {
          class: "chip", type: "button", "aria-pressed": "false",
          onclick: (e) => {
            activeTag = activeTag === t ? "" : t;
            chipsEl.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === activeTag)));
            render();
          },
        }, t)
      )
    );
  }

  function render() {
    const kw = q.value.trim().toLowerCase();
    const list = chars.filter((c) => {
      if (activeTab === "proxy" && !(c.tags || []).includes("代理")) return false;
      if (activeTab === "plot" && !(c.tags || []).includes("プロット")) return false;
      if (activeTag && c.role !== activeTag && !(c.tags || []).includes(activeTag)) return false;
      if (!kw) return true;
      return [c.name, c.role, c.summary, c.features, ...(c.tags || [])].join(" ").toLowerCase().includes(kw);
    });
    if (!list.length) {
      grid.replaceChildren(el("p", { class: "empty" }, "該当するキャラクターがいません。"));
      return;
    }
    grid.replaceChildren(
      ...list.map((c) => {
        const tags = c.tags || [];
        const marks = [];
        if (tags.includes("プロット")) marks.push(el("span", { class: "mark plot" }, "プロット"));
        if (tags.includes("代理")) marks.push(el("span", { class: "mark proxy" }, "代理"));
        return el("button", {
          class: "card" + (tags.includes("プロット") ? " has-plot" : "") + (tags.includes("代理") ? " has-proxy" : ""),
          type: "button", onclick: () => open(c.id),
        },
          el("div", { class: "thumb" },
            c.images?.[0] ? el("img", { src: c.images[0], alt: c.name, loading: "lazy" }) : null,
            c.role ? roleBadge(c.role) : null,
            marks.length ? el("div", { class: "marks" }, marks) : null),
          el("div", { class: "meta" },
            el("div", { class: "name" }, c.name),
            el("div", { class: "sub" }, [c.age, tags[0]].filter(Boolean).join(" ・ "))
          )
        );
      })
    );
  }

  function open(id) {
    const c = chars.find((x) => x.id === id);
    if (!c) return;
    const imgs = c.images || [];
    const main = el("img", { src: imgs[0] || "", alt: c.name });
    const thumbs = el("div", { class: "thumbs" });
    if (imgs.length > 1) {
      imgs.forEach((src, i) => {
        const b = el("button", { type: "button", "aria-label": `画像 ${i + 1}`, "aria-current": String(i === 0),
          onclick: () => {
            main.src = src;
            thumbs.querySelectorAll("button").forEach((x, j) => x.setAttribute("aria-current", String(j === i)));
          } }, el("img", { src, alt: "" }));
        thumbs.append(b);
      });
    }
    const dl = el("dl");
    const add = (label, text) => { if (text) { dl.append(el("dt", {}, label), el("dd", {}, text)); } };
    add("特徴", c.features);
    if ((c.tags || []).includes("プロット")) add("プロット紹介", c.intro);
    add("服装", c.outfit);
    add("設定", c.notes);
    add("メインプロンプト", c.mainPrompt);
    add("服装プロンプト", c.outfitPrompt);

    modal.replaceChildren(
      el("div", { class: "gallery" }, el("div", { class: "main" }, imgs.length ? main : null), imgs.length > 1 ? thumbs : null),
      el("div", { class: "info" },
        c.role ? el("div", { class: "role-line" }, roleBadge(c.role)) : null,
        el("h2", {}, c.name),
        c.age ? el("div", { class: "age" }, c.age) : null,
        c.summary ? el("p", { class: "summary" }, c.summary) : null,
        dl,
        (c.tags || []).length ? el("div", { class: "tags" }, c.tags.map((t) => el("span", {}, t))) : null
      )
    );
    if (!dlg.open) dlg.showModal();
    history.replaceState(null, "", "#" + id);
  }

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) open(id);
  }

  /* ---------- roaming yorkie mascot ---------- */
  const mascot = document.createElement("div");
  mascot.className = "mascot";
  mascot.setAttribute("aria-hidden", "true");
  mascot.innerHTML = '<div class="bubble" hidden></div><span class="flipwrap"><svg class="dog"><use href="#yorkie-sit"/></svg></span>';
  document.body.append(mascot);
  const bubble = mascot.querySelector(".bubble");
  const flipwrap = mascot.querySelector(".flipwrap");
  const showBubble = (t, ms) => { bubble.textContent = t; bubble.hidden = false; setTimeout(() => (bubble.hidden = true), ms); };
  function spawnPoop(x, dir) {
    if (document.querySelector(".poop")) return;
    const p = document.createElement("div");
    p.className = "poop";
    p.setAttribute("aria-hidden", "true");
    p.innerHTML = '<svg><use href="#poop"/></svg>';
    p.style.left = Math.max(2, x + (dir > 0 ? -16 : 46)) + "px";
    document.body.append(p);
    setTimeout(() => p.classList.add("bye"), 5200);
    setTimeout(() => p.remove(), 6200);
  }
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mx = Math.max(0, Math.min(120, innerWidth - 90)), mdir = 1, mstate = "walk";
  let until = performance.now() + 9000;
  let poopAt = performance.now() + 22000 + Math.random() * 30000;
  function mascotStep(now) {
    const w = Math.max(0, innerWidth - 74);
    if (mstate === "walk") {
      mx += mdir * 0.45;
      if (mx > w) { mx = w; mdir = -1; }
      if (mx < 0) { mx = 0; mdir = 1; }
      if (now >= poopAt) { spawnPoop(mx, mdir); poopAt = now + 45000 + Math.random() * 60000; }
      if (now >= until) {
        mstate = "rest"; mascot.classList.add("resting");
        until = now + 2600 + Math.random() * 3200;
        const r = Math.random();
        if (r < 0.4) showBubble("💤", 2400);
        else if (r < 0.7) showBubble("わん！", 1500);
      }
    } else if (now >= until) {
      mstate = "walk"; mascot.classList.remove("resting");
      if (Math.random() < 0.5) mdir = -mdir;
      until = now + 7000 + Math.random() * 8000;
    }
    flipwrap.style.transform = mdir > 0 ? "" : "scaleX(-1)";
    mascot.style.transform = `translateX(${mx}px)`;
    requestAnimationFrame(mascotStep);
  }
  if (reducedMotion) mascot.style.transform = `translateX(${mx}px)`;
  else requestAnimationFrame(mascotStep);

  $("#close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));
  q.addEventListener("input", render);
  window.addEventListener("hashchange", openFromHash);
  load();
})();
