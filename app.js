(() => {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), chipsEl = $("#chips"), q = $("#q");
  const dlg = $("#dlg"), modal = $("#modal");
  let chars = [], activeTag = "", activeTab = "all";
  let page = 0, lastTotal = 0, pageAnimating = false, fullGridH = 0;
  const PAGE_SIZE = 12;
  const tabBtns = [...document.querySelectorAll(".tab")];
  tabBtns.forEach((b) => b.addEventListener("click", () => {
    activeTab = b.dataset.tab;
    page = 0;
    tabBtns.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    render();
  }));
  function updateTabCounts() {
    const counts = {
      all: chars.length,
      proxy: chars.filter((c) => (c.tags || []).includes("代理")).length,
      plot: chars.filter((c) => (c.tags || []).includes("プロット")).length,
      uchiyoso: chars.filter((c) => (c.tags || []).includes("うちよそ")).length,
    };
    const labels = { all: "すべて", proxy: "代理", plot: "プロット", uchiyoso: "うちよそ" };
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
  const nameWithRuby = (c) => (c.reading ? el("ruby", {}, c.name, el("rt", {}, c.reading)) : c.name);
  const PLOT_APPS = [
    ["zeta", "Zeta", "zeta"],
    ["chacha", "チャチャ", "chacha"],
    ["moox", "MooX", "moox"],
  ];
  const safeUrl = (u) => {
    try {
      const x = new URL(u);
      return ["http:", "https:"].includes(x.protocol) ? x.href : "";
    } catch { return ""; }
  };
  const plotLinks = (c) => {
    if (!(c.tags || []).includes("プロット")) return null;
    const links = PLOT_APPS.map(([key, label, cls]) => {
      const href = safeUrl(c.plotUrls?.[key]);
      return href ? el("a", { class: "plot-link " + cls, href, target: "_blank", rel: "noopener noreferrer" }, label + "で開く") : null;
    }).filter(Boolean);
    return links.length ? el("div", { class: "plot-links" },
      el("div", { class: "plot-links-title" }, "プロットを開く"),
      el("div", { class: "plot-link-buttons" }, links)) : null;
  };

  const loaderShownAt = Date.now();
  let loaderHidden = false;

  // --- ローディング進捗バー（バー＋％＋上を走るキャラ） ---
  const fillEl = $("#loader-fill");
  const pctEl = $("#loader-pct");
  const runnerEl = $("#loader-runner");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let loadProgress = 0;
  let progressDone = false;
  let progressTimer = null;
  function setProgress(v) {
    loadProgress = v;
    const s = Math.floor(v) + "%";
    if (fillEl) fillEl.style.width = s;
    if (pctEl) pctEl.textContent = s;
    if (runnerEl) runnerEl.style.left = s;
  }
  if (!reducedMotion) {
    progressTimer = setInterval(() => {
      if (progressDone) return;
      let next = loadProgress + (90 - loadProgress) * 0.055 + Math.random() * 0.7;
      if (next > 90) next = 90;
      setProgress(next);
    }, 100);
  }
  function finishProgress() {
    if (progressDone) return;
    progressDone = true;
    if (progressTimer) clearInterval(progressTimer);
    setProgress(100);
  }

  function hideLoader() {
    if (loaderHidden) return;
    loaderHidden = true;
    finishProgress();
    const l = $("#loader");
    if (!l) return;
    const reduced = reducedMotion;
    const wait = reduced ? 0 : Math.max(0, 1000 - (Date.now() - loaderShownAt)) + 280;
    setTimeout(() => {
      l.classList.add("done");
      setTimeout(() => l.remove(), reduced ? 60 : 550);
    }, wait);
  }

  async function load() {
    try {
      const res = await fetch("data/characters.json?t=" + Date.now());
      const data = await res.json();
      chars = data.characters || [];
      if (data.site) {
        if (data.site.title) { $("#site-title").textContent = data.site.title; document.title = data.site.title; fitTitle(); }
        $("#site-lead").textContent = data.site.lead || "";
      }
    } catch (e) {
      grid.replaceChildren(el("p", { class: "empty" }, "データを読み込めませんでした。"));
      hideLoader();
      return;
    }
    buildChips();
    updateTabCounts();
    render();
    openFromHash();
    hideLoader();
  }

  function buildChips() {
    const tags = ["代理", "プロット", "うちよそ"].filter((t) => chars.some((c) => (c.tags || []).includes(t)));
    chipsEl.replaceChildren(
      ...tags.map((t) =>
        el("button", {
          class: "chip", type: "button", "aria-pressed": "false",
          onclick: (e) => {
            activeTag = activeTag === t ? "" : t;
            page = 0;
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
      if (activeTab === "uchiyoso" && !(c.tags || []).includes("うちよそ")) return false;
      if (activeTag && c.role !== activeTag && !(c.tags || []).includes(activeTag)) return false;
      if (!kw) return true;
      return [c.name, c.reading, c.role, c.summary, ...(c.tags || [])].join(" ").toLowerCase().includes(kw);
    });
    lastTotal = list.length;
    updatePager();
    if (!list.length) {
      grid.style.minHeight = "";
      grid.replaceChildren(el("p", { class: "empty" }, "該当するキャラクターがいません。"));
      return;
    }
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (page >= pages) page = pages - 1;
    if (page < 0) page = 0;
    const pageList = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    grid.replaceChildren(
      ...pageList.map((c) => {
        const tags = c.tags || [];
        const marks = [];
        if (tags.includes("代理")) marks.push(el("span", { class: "mark proxy" }, "代理"));
        if (tags.includes("プロット")) marks.push(el("span", { class: "mark plot" }, "プロット"));
        if (tags.includes("うちよそ")) marks.push(el("span", { class: "mark uchiyoso" }, "うちよそ"));
        return el("button", {
          class: "card" + (tags.includes("プロット") ? " has-plot" : "") + (tags.includes("代理") ? " has-proxy" : "") + (tags.includes("うちよそ") ? " has-uchiyoso" : ""),
          type: "button", onclick: () => open(c.id),
        },
          el("div", { class: "thumb" },
            c.images?.[0] ? el("img", { src: c.images[0], alt: c.name, loading: "lazy" }) : null),
          el("div", { class: "meta" },
            el("div", { class: "name" }, nameWithRuby(c)),
            marks.length ? el("div", { class: "marks" }, marks) : null
          )
        );
      })
    );
    fitCardNames();
    // ページごとにボタンの位置が動かないよう、満杯ページの高さを確保する
    if (pageList.length === PAGE_SIZE) { fullGridH = grid.offsetHeight; grid.style.minHeight = ""; }
    else if (fullGridH) { grid.style.minHeight = fullGridH + "px"; }
  }

  function updatePager() {
    const pages = Math.ceil(lastTotal / PAGE_SIZE);
    const pager = $("#pager");
    if (pages <= 1) { pager.hidden = true; return; }
    pager.hidden = false;
    $("#page-info").textContent = `${page + 1} / ${pages}`;
    $("#page-prev").style.visibility = page > 0 ? "visible" : "hidden";
    $("#page-next").style.visibility = page < pages - 1 ? "visible" : "hidden";
  }
  function scrollToGrid() {
    // 画面外にいるときだけ、切り替えの最初に一瞬で合わせる（アニメーション中のスクロールをなくして滑らかに）
    const r = grid.getBoundingClientRect();
    if (r.top < 90 && r.top > -80) return;
    const y = r.top + window.scrollY - 90;
    window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
  }
  function gotoPage(d) {
    const pages = Math.ceil(lastTotal / PAGE_SIZE);
    const next = Math.min(Math.max(page + d, 0), pages - 1);
    if (next === page || pageAnimating) return;
    scrollToGrid();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { page = next; render(); return; }
    pageAnimating = true;
    grid.classList.add(d > 0 ? "page-out-next" : "page-out-prev");
    setTimeout(() => {
      grid.classList.remove("page-out-next", "page-out-prev");
      page = next;
      render();
      grid.classList.add(d > 0 ? "page-in-next" : "page-in-prev");
      setTimeout(() => { grid.classList.remove("page-in-next", "page-in-prev"); pageAnimating = false; }, 340);
    }, 220);
  }
  $("#page-prev").addEventListener("click", () => gotoPage(-1));
  $("#page-next").addEventListener("click", () => gotoPage(1));

  // スワイプでもページ切り替え（画面のどこでも、大きくスワイプしたときだけ）
  let swipeX = null, swipeY = null, suppressClick = false;
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { swipeX = swipeY = null; return; }
    if (e.target.closest("dialog, input, textarea, select")) { swipeX = swipeY = null; return; }
    swipeX = e.touches[0].clientX; swipeY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (swipeX == null) return;
    const dx = e.changedTouches[0].clientX - swipeX;
    const dy = e.changedTouches[0].clientY - swipeY;
    swipeX = swipeY = null;
    const threshold = Math.min(170, Math.max(110, window.innerWidth * 0.3));
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.5) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 350);
      gotoPage(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
  document.addEventListener("click", (e) => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; }
  }, true);

  function fitCardNames() {
    grid.querySelectorAll(".card .name").forEach((n) => {
      n.style.fontSize = "";
      let size = parseFloat(getComputedStyle(n).fontSize);
      while (n.scrollWidth > n.clientWidth && size > 10) { size -= 1; n.style.fontSize = size + "px"; }
    });
  }

  function fitTitle() {
    const t = $("#site-title");
    if (!t) return;
    t.style.fontSize = "";
    let size = parseFloat(getComputedStyle(t).fontSize);
    while (t.scrollWidth > t.clientWidth && size > 18) { size -= 1; t.style.fontSize = size + "px"; }
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
    const copyBtn = (text) => {
      const b = el("button", { type: "button", class: "copy-btn" }, "コピー");
      b.addEventListener("click", async () => {
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; }
        catch {
          const ta = document.createElement("textarea");
          ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.append(ta); ta.select();
          try { ok = document.execCommand("copy"); } catch { ok = false; }
          ta.remove();
        }
        b.textContent = ok ? "コピーした！" : "コピーできなかった";
        setTimeout(() => { b.textContent = "コピー"; }, 1600);
      });
      return b;
    };
    const addPrompt = (label, text) => {
      if (text) dl.append(el("dt", {}, label), el("dd", {}, el("div", { class: "prompt-text" }, text), copyBtn(text)));
    };
    add("イメージCV", c.imageCv);
    add("誕生日", c.birthday);
    if ((c.tags || []).includes("プロット")) add("プロット紹介", c.intro);
    add("設定", c.notes);
    if ((c.tags || []).includes("代理") || (c.tags || []).includes("うちよそ")) {
      addPrompt("メインプロンプト", c.mainPrompt);
      addPrompt("服装プロンプト", c.outfitPrompt);
      if (c.bodyPrompt) {
        const secret = el("span", { class: "secret", title: "タップで表示／隠す" }, c.bodyPrompt);
        secret.addEventListener("click", () => {
          secret.classList.toggle("revealed");
          hint.textContent = secret.classList.contains("revealed") ? "タップで隠す" : "タップで表示";
        });
        const hint = el("span", { class: "secret-hint" }, "タップで表示");
        dl.append(el("dt", {}, "身体的特徴プロンプト"), el("dd", {}, secret, hint, copyBtn(c.bodyPrompt)));
      }
    }

    modal.replaceChildren(
      el("div", { class: "gallery" }, el("div", { class: "main" }, imgs.length ? main : null), imgs.length > 1 ? thumbs : null),
      el("div", { class: "info" },
        c.role ? el("div", { class: "role-line" }, roleBadge(c.role)) : null,
        el("h2", {}, nameWithRuby(c)),
        [c.age, c.height].filter(Boolean).length ? el("div", { class: "age" }, [c.age, c.height].filter(Boolean).join(" ・ ")) : null,
        c.summary ? el("p", { class: "summary" }, c.summary) : null,
        plotLinks(c),
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

  $("#close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));
  q.addEventListener("input", () => { page = 0; render(); });
  window.addEventListener("hashchange", openFromHash);
  window.addEventListener("resize", () => { fullGridH = 0; render(); fitTitle(); });
  setTimeout(hideLoader, 5000);
  load();
})();
