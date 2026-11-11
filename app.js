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
    const tags = ["代理", "プロット", "うちよそ"].filter((t) => chars.some((c) => (c.tags || []).includes(t)));
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
      if (activeTab === "uchiyoso" && !(c.tags || []).includes("うちよそ")) return false;
      if (activeTag && c.role !== activeTag && !(c.tags || []).includes(activeTag)) return false;
      if (!kw) return true;
      return [c.name, c.reading, c.role, c.summary, ...(c.tags || [])].join(" ").toLowerCase().includes(kw);
    });
    if (!list.length) {
      grid.replaceChildren(el("p", { class: "empty" }, "該当するキャラクターがいません。"));
      return;
    }
    grid.replaceChildren(
      ...list.map((c) => {
        const tags = c.tags || [];
        const marks = [];
        if (tags.includes("代理")) marks.push(el("span", { class: "mark proxy" }, "代理"));
        if (tags.includes("プロット")) marks.push(el("span", { class: "mark plot" }, "プロット"));
        if (tags.includes("うちよそ")) marks.push(el("span", { class: "mark uchiyoso" }, "うちよそ"));
        const subTag = tags.find((t) => t !== "代理" && t !== "プロット");
        return el("button", {
          class: "card" + (tags.includes("プロット") ? " has-plot" : "") + (tags.includes("代理") ? " has-proxy" : "") + (tags.includes("うちよそ") ? " has-uchiyoso" : ""),
          type: "button", onclick: () => open(c.id),
        },
          el("div", { class: "thumb" },
            c.images?.[0] ? el("img", { src: c.images[0], alt: c.name, loading: "lazy" }) : null),
          el("div", { class: "meta" },
            el("div", { class: "name" }, nameWithRuby(c)),
            marks.length ? el("div", { class: "marks" }, marks) : null,
            el("div", { class: "sub" }, [c.age, c.height, subTag].filter(Boolean).join(" ・ "))
          )
        );
      })
    );
    fitCardNames();
  }

  function fitCardNames() {
    grid.querySelectorAll(".card .name").forEach((n) => {
      n.style.fontSize = "";
      let size = parseFloat(getComputedStyle(n).fontSize);
      while (n.scrollWidth > n.clientWidth && size > 10) { size -= 1; n.style.fontSize = size + "px"; }
    });
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
    add("イメージCV", c.imageCv);
    if ((c.tags || []).includes("プロット")) add("プロット紹介", c.intro);
    add("設定", c.notes);
    add("メインプロンプト", c.mainPrompt);
    add("服装プロンプト", c.outfitPrompt);

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
  q.addEventListener("input", render);
  window.addEventListener("hashchange", openFromHash);
  window.addEventListener("resize", fitCardNames);
  load();
})();
