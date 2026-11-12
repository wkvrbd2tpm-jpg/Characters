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

  const exhibitNo = (i) => "No. " + String(i + 1).padStart(2, "0");

  function worksCard(p, idx) {
    const href = safeUrl(p.url);
    if (!href) return null;
    const svc = serviceOf(p);
    const img = el("img", { src: thumbSrc(p), alt: "", loading: "lazy" });
    img.addEventListener("error", () => img.remove());
    return el("a", { class: "exhibit-card", href, target: "_blank", rel: "noopener noreferrer" },
      el("div", { class: "exhibit-frame" },
        el("span", { class: "exhibit-no" }, exhibitNo(idx)),
        el("div", { class: "exhibit-img wide" },
          el("div", { class: "plot-thumb-fallback" }, svc.label),
          img,
          el("span", { class: "plot-badge " + svc.key }, svc.label))),
      el("div", { class: "exhibit-caption" },
        el("h3", { class: "exhibit-title" }, p.title || "（タイトルなし）"),
        p.author ? el("p", { class: "exhibit-meta" }, "作者：" + p.author) : null,
        p.comment ? el("p", { class: "exhibit-desc" }, p.comment) : null,
        el("span", { class: "exhibit-open" }, "プロットを開く →")));
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

  // 自プロットは「キャラ×サービス」のリンクごとに1展示にする（素敵な作品と表示を統一）
  function mineExhibits(chars) {
    const out = [];
    for (const c of chars) {
      const links = PLOT_APPS
        .map(([key, label, cls]) => ({ key, label, cls, href: safeUrl(c.plotUrls?.[key]) }))
        .filter((x) => x.href);
      if (!links.length) out.push({ c, link: null });
      else for (const link of links) out.push({ c, link });
    }
    return out;
  }

  function mineCard(item, idx) {
    const { c, link } = item;
    const frame = el("div", { class: "exhibit-frame" },
      el("span", { class: "exhibit-no" }, exhibitNo(idx)),
      el("div", { class: "exhibit-img tall" },
        c.images?.[0] ? el("img", { src: c.images[0], alt: c.name, loading: "lazy" }) : el("div", { class: "plot-thumb-fallback" }, c.name || ""),
        link ? el("span", { class: "plot-badge " + link.cls }, link.label) : null));
    if (!link) {
      return el("article", { class: "exhibit-card" }, frame,
        el("div", { class: "exhibit-caption" },
          el("h3", { class: "exhibit-title" }, c.name || "（名前なし）"),
          c.intro ? el("p", { class: "exhibit-desc" }, c.intro) : null,
          el("p", { class: "own-nolink" }, "リンクはまだ登録されていません")));
    }
    const manualTitle = (c.plotTitles && c.plotTitles[link.key] || "").trim();
    const titleEl = el("h3", { class: "exhibit-title" }, manualTitle || link.label + "のプロット");
    const a = el("a", { class: "exhibit-card", href: link.href, target: "_blank", rel: "noopener noreferrer" }, frame,
      el("div", { class: "exhibit-caption" },
        titleEl,
        el("p", { class: "exhibit-meta" }, "キャラ：", nameWithRuby(c)),
        c.intro ? el("p", { class: "exhibit-desc" }, c.intro) : null,
        el("span", { class: "exhibit-open" }, link.label + "で開く →")));
    if (!manualTitle) {
      fetchPlotMeta(link.href).then((meta) => {
        if (!meta || !meta.title) return;
        const t = meta.title.trim();
        if (t && t.toLowerCase() !== link.label.toLowerCase() && t.length >= 4) titleEl.textContent = t;
      });
    }
    return a;
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
    const cards = [];
    plots.forEach((p) => { const cd = worksCard(p, cards.length); if (cd) cards.push(cd); });
    const exhibits = mineExhibits(mine);
    tabBtns.forEach((b) => {
      const isWorks = b.dataset.ptab === "works";
      b.textContent = (isWorks ? "素敵な作品" : "自プロット") + "（" + (isWorks ? cards.length : exhibits.length) + "）";
    });
    if (!cards.length) {
      emptyEl.textContent = "まだ素敵な作品が登録されていません。";
      emptyEl.hidden = false;
    } else {
      grid.replaceChildren(...cards);
    }
    if (ownGrid) {
      if (!exhibits.length) { ownEmpty.hidden = false; }
      else ownGrid.replaceChildren(...exhibits.map((it, i) => mineCard(it, i)));
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
