(() => {
  const grid = document.getElementById("plot-grid");
  const emptyEl = document.getElementById("plot-empty");
  const ownGrid = document.getElementById("own-grid");
  const ownEmpty = document.getElementById("own-empty");
  const tabBtns = [...document.querySelectorAll(".ptab")];

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

  const safeUrl = (u) => {
    try {
      const x = new URL(u);
      return ["http:", "https:"].includes(x.protocol) ? x.href : "";
    } catch { return ""; }
  };

  const SERVICES = {
    zeta: { label: "Zeta", test: (u) => /zeta/i.test(u) },
    chacha: { label: "チャチャ", test: (u) => /chacha/i.test(u) },
    moox: { label: "MooX", test: (u) => /moox/i.test(u) },
  };
  const serviceOf = (p) => {
    const byName = { "Zeta": "zeta", "チャチャ": "chacha", "MooX": "moox", "その他": "other" };
    if (p.service && byName[p.service]) return { key: byName[p.service], label: p.service };
    for (const [key, s] of Object.entries(SERVICES)) if (s.test(p.url || "")) return { key, label: s.label };
    return { key: "other", label: "リンク" };
  };

  const thumbSrc = (p) => {
    if (p.thumb) return p.thumb;
    return "https://s0.wordpress.com/mshots/v1/" + encodeURIComponent(p.url) + "?w=800";
  };

  function card(p) {
    const href = safeUrl(p.url);
    if (!href) return null;
    const svc = serviceOf(p);
    const img = el("img", { src: thumbSrc(p), alt: "", loading: "lazy" });
    img.addEventListener("error", () => img.remove());
    return el("a", { class: "plot-card", href, target: "_blank", rel: "noopener noreferrer" },
      el("div", { class: "plot-thumb" },
        el("div", { class: "plot-thumb-fallback" }, svc.label),
        img,
        el("span", { class: "plot-badge " + svc.key }, svc.label)
      ),
      el("div", { class: "plot-meta" },
        el("h3", {}, p.title || "（タイトルなし）"),
        p.comment ? el("p", { class: "plot-comment" }, p.comment) : null,
        el("span", { class: "plot-open" }, "プロットを開く →")
      )
    );
  }

  const PLOT_APPS = [
    ["zeta", "Zeta", "zeta"],
    ["chacha", "チャチャ", "chacha"],
    ["moox", "MooX", "moox"],
  ];
  const plotMetaCache = new Map();
  async function fetchPlotMeta(href) {
    if (plotMetaCache.has(href)) return plotMetaCache.get(href);
    let meta = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch("https://api.microlink.io?url=" + encodeURIComponent(href), { signal: ctrl.signal });
      clearTimeout(timer);
      const json = await res.json();
      if (json && json.data) meta = { title: json.data.title || "" };
    } catch { meta = null; }
    plotMetaCache.set(href, meta);
    return meta;
  }
  const nameWithRuby = (c) => (c.reading ? el("ruby", {}, c.name, el("rt", {}, c.reading)) : c.name);

  function richLink(c, key, label, cls) {
    const href = safeUrl(c.plotUrls?.[key]);
    if (!href) return null;
    const shot = el("img", { src: "https://s0.wordpress.com/mshots/v1/" + encodeURIComponent(href) + "?w=400", alt: "", loading: "lazy" });
    shot.addEventListener("error", () => shot.remove());
    const manualTitle = (c.plotTitles && c.plotTitles[key] || "").trim();
    const titleEl = el("div", { class: "plot-rich-title" }, manualTitle || label + "のプロット");
    const a = el("a", { class: "plot-rich-card " + cls, href, target: "_blank", rel: "noopener noreferrer" },
      el("div", { class: "plot-rich-thumb" },
        el("div", { class: "plot-thumb-fallback" }, label),
        shot),
      el("div", { class: "plot-rich-meta" },
        titleEl,
        el("div", { class: "plot-rich-svc" }, label + "で開く →")));
    if (!manualTitle) {
      fetchPlotMeta(href).then((meta) => {
        if (!meta || !meta.title) return;
        const t = meta.title.trim();
        if (t && t.toLowerCase() !== label.toLowerCase() && t.length >= 4) titleEl.textContent = t;
      });
    }
    return a;
  }

  function ownCard(c) {
    const links = PLOT_APPS.map(([k, l, cls]) => richLink(c, k, l, cls)).filter(Boolean);
    return el("article", { class: "own-card" },
      el("div", { class: "own-thumb" }, c.images?.[0] ? el("img", { src: c.images[0], alt: c.name, loading: "lazy" }) : null),
      el("div", { class: "own-body" },
        el("div", { class: "own-name" }, nameWithRuby(c)),
        c.intro ? el("p", { class: "own-intro" }, c.intro) : null,
        links.length ? el("div", { class: "own-links" }, links) : el("p", { class: "own-nolink" }, "リンクはまだ登録されていません")
      )
    );
  }

  // タブ切り替え（最初に開くのは「素敵な作品」）
  function selectTab(name) {
    tabBtns.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.ptab === name)));
    const works = document.getElementById("panel-works");
    const mine = document.getElementById("panel-mine");
    if (works) works.hidden = name !== "works";
    if (mine) mine.hidden = name !== "mine";
  }
  tabBtns.forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.ptab)));

  async function load() {
    let plots = [], mine = [];
    try {
      const res = await fetch("data/characters.json?t=" + Date.now());
      const data = await res.json();
      plots = data.plots || [];
      // 自プロット: プロットタグあり・代理タグなし・図鑑表示チェックなしのキャラ（図鑑には出ない組）
      mine = (data.characters || []).filter((c) => {
        const t = c.tags || [];
        return t.includes("プロット") && !t.includes("代理") && !c.showInIndex;
      });
    } catch (e) {
      emptyEl.textContent = "データを読み込めませんでした。";
      emptyEl.hidden = false;
      if (ownEmpty) { ownEmpty.textContent = "データを読み込めませんでした。"; ownEmpty.hidden = false; }
      return;
    }
    const cards = plots.map(card).filter(Boolean);
    tabBtns.forEach((b) => {
      const isWorks = b.dataset.ptab === "works";
      b.textContent = (isWorks ? "素敵な作品" : "自プロット") + "（" + (isWorks ? cards.length : mine.length) + "）";
    });
    if (!cards.length) {
      emptyEl.textContent = "まだ素敵な作品が登録されていません。";
      emptyEl.hidden = false;
    } else {
      grid.replaceChildren(...cards);
    }
    if (ownGrid) {
      if (!mine.length) { ownEmpty.hidden = false; }
      else ownGrid.replaceChildren(...mine.map(ownCard));
    }
  }

  load();
})();

// タイトルが見切れないよう、幅に合わせて自動縮小する（Rangeで実際の文字幅を測る）
const heroTitle = document.querySelector(".hero-sub h1");
function fitPlotsTitle() {
  if (!heroTitle) return;
  heroTitle.style.fontSize = "";
  try {
    const range = document.createRange();
    range.selectNodeContents(heroTitle);
    const textW = range.getBoundingClientRect().width;
    const boxW = heroTitle.clientWidth;
    if (textW > boxW && textW > 0) {
      const size = parseFloat(getComputedStyle(heroTitle).fontSize);
      heroTitle.style.fontSize = Math.max(18, Math.floor(size * (boxW / textW) * 0.98)) + "px";
      return;
    }
    if (textW > 0) return;
  } catch { /* 測れない環境では下の方法に切り替える */ }
  let size = parseFloat(getComputedStyle(heroTitle).fontSize);
  while (heroTitle.scrollWidth > heroTitle.clientWidth && size > 18) {
    size -= 1;
    heroTitle.style.fontSize = size + "px";
  }
}
fitPlotsTitle();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPlotsTitle);
addEventListener("resize", fitPlotsTitle);
