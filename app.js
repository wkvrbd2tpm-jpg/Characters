(() => {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), chipsEl = $("#chips"), q = $("#q");
  const dlg = $("#dlg"), modal = $("#modal");
  let chars = [], activeTag = "";

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

  $("#close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));
  q.addEventListener("input", render);
  window.addEventListener("hashchange", openFromHash);
  load();
})();
