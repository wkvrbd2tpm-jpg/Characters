(() => {
  const grid = document.getElementById("plot-grid");
  const emptyEl = document.getElementById("plot-empty");

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

  async function load() {
    let plots = [];
    try {
      const res = await fetch("data/characters.json?t=" + Date.now());
      const data = await res.json();
      plots = data.plots || [];
    } catch (e) {
      emptyEl.textContent = "データを読み込めませんでした。";
      emptyEl.hidden = false;
      return;
    }
    const cards = plots.map(card).filter(Boolean);
    if (!cards.length) {
      emptyEl.textContent = "まだ推しプロットが登録されていません。";
      emptyEl.hidden = false;
      return;
    }
    grid.replaceChildren(...cards);
  }

  load();
})();

// タイトルが見切れないよう、幅に合わせて自動縮小する
const heroTitle = document.querySelector(".hero-sub h1");
function fitPlotsTitle() {
  if (!heroTitle) return;
  heroTitle.style.fontSize = "";
  let size = parseFloat(getComputedStyle(heroTitle).fontSize);
  while (heroTitle.scrollWidth > heroTitle.clientWidth && size > 18) {
    size -= 1;
    heroTitle.style.fontSize = size + "px";
  }
}
fitPlotsTitle();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPlotsTitle);
addEventListener("resize", fitPlotsTitle);
