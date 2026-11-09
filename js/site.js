/* George Chambers — site behaviour. Everything is read from the page itself (the
   cards, the record pages), so it works the same on the static site and once the
   site is imported and its work is in Listings. The light box is js/lightbox.js. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const LB = window.Lightbox;
  const BASE = document.baseURI;   // fixed now: the address bar changes while the light box is open
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const pad = n => String(n).padStart(2, "0");
  const text = n => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const abs = u => new URL(u, BASE).href;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  /* ---------- clocks ---------- */
  const fmts = {};
  function tick() {
    const now = new Date();
    $$("[data-clock]").forEach(t => {
      const tz = t.dataset.clock;
      fmts[tz] = fmts[tz] || new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
      t.textContent = fmts[tz].format(now);
    });
  }
  tick();
  setInterval(tick, 15000);

  /* ---------- header ---------- */
  const hdr = $("[data-hdr]");
  const bar = $("[data-bar]");
  let lastY = scrollY;
  function onScroll() {
    const y = scrollY;
    hdr.classList.toggle("is-scrolled", y > 8);
    if (Math.abs(y - lastY) > 6) { root.classList.toggle("hdr-away", y > lastY && y > 320); lastY = y; }
    if (bar) bar.classList.toggle("is-stuck", bar.getBoundingClientRect().top <= (root.classList.contains("hdr-away") ? 0 : hdr.offsetHeight) + 1);
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // the header's links are written from the site root (/#work), so the header is
  // the same markup on every page; on the home page they only scroll
  const home = document.body.classList.contains("page-home");
  if (home) {
    $$('a[href^="/#"]').forEach(a => a.setAttribute("href", a.getAttribute("href").slice(1)));
    const navLinks = $$(".nav a");
    const spy = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) navLinks.forEach(a => a.classList.toggle("is-here", a.getAttribute("href") === "#" + en.target.id));
    }), { rootMargin: "-45% 0px -50% 0px" });
    ["work", "photography", "about", "contact"].forEach(id => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }
  $$("[data-top]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); scrollTo({ top: 0, behavior: reduce() ? "auto" : "smooth" }); }));

  /* ---------- menu (phones) ---------- */
  const menu = $("#menu");
  if (menu) {
    $("[data-menu-open]").addEventListener("click", () => { menu.showModal(); root.classList.add("menu-open"); });
    $("[data-menu-close]").addEventListener("click", () => menu.close());
    menu.addEventListener("close", () => root.classList.remove("menu-open"));
    $$("[data-menu-link]", menu).forEach(a => a.addEventListener("click", e => {
      const id = a.getAttribute("href").replace(/^\/?/, "");
      const t = home && id.startsWith("#") ? $(id) : null;
      menu.close();
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: reduce() ? "auto" : "smooth" }); }
    }));
  }

  /* ---------- reveal on scroll ---------- */
  const reveal = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add("in"); reveal.unobserve(en.target); }
  }), { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
  $$("[data-reveal]").forEach(el => reveal.observe(el));

  /* ---------- the footer's name fills its width; copy the address ---------- */
  const word = $("[data-fit]");
  function fitWord() {
    if (!word) return;
    word.style.fontSize = "100px";
    const w = word.scrollWidth;
    if (w) word.style.fontSize = (100 * word.clientWidth / w * 0.995) + "px";
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fitWord);
  addEventListener("resize", fitWord);
  $$("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = "Copied"; b.classList.add("is-done");
      setTimeout(() => { b.textContent = "Copy"; b.classList.remove("is-done"); }, 1800);
    } catch (e) { location.href = "mailto:" + b.dataset.copy; }
  }));

  /* ---------- what opens in the light box ---------- */
  // Each list is the run of records the light box steps through: the index's
  // cards as they stand (filtered or not), or the photo sets.
  const cards = $$(".card");
  const photoCards = $$(".ph");
  const entry = (li, kind, n) => ({
    url: abs($("a", li).getAttribute("href")),
    title: text($("h3", li)),
    img: () => { const im = $("img", li); return im ? (im.currentSrc || im.src) : ""; },
    el: $("a", li), li, kind, n,
    sector: li.dataset.sector || ""
  });
  const allWork = cards.map((li, i) => entry(li, "work", i + 1));
  const allPhotos = photoCards.map((li, i) => entry(li, "photo", i + 1));
  let visibleWork = allWork.slice();
  const findEntry = url => allWork.find(x => x.url === url) || allPhotos.find(x => x.url === url);

  function listFor(item, from) {
    if (item.kind === "photo") return { list: allPhotos, label: "Off the clock" };
    if (from && from.closest(".grid") && visibleWork.includes(item) && visibleWork.length < allWork.length) return { list: visibleWork, label: "Your filter" };
    return { list: allWork, label: "All work" };
  }
  function optsFor(set, run, i, extra) {
    const { list, label } = run;
    const item = list[i];
    const nb = d => list[(i + d + list.length) % list.length];
    const go = d => { const j = (i + d + list.length) % list.length; show(list[j], run, j, { dir: d }); };
    return Object.assign({
      history: true,
      kicker: item.kind === "photo" ? ["Off the clock", `${set.media.length} frames`] : [`No. ${pad(item.n)}`, item.sector],
      where: `${pad(i + 1)} / ${pad(list.length)} · ${label}`,
      next: list.length > 1 ? { title: nb(1).title, img: nb(1).img(), go } : null,
      prev: list.length > 1 ? { title: nb(-1).title, img: nb(-1).img(), go } : null,
      nextLabel: item.kind === "photo" ? "Next set" : "Next project",
      pageLabel: item.kind === "photo" ? "Open the set as a page" : "Open the project page",
      returnTo: () => (item.el.getBoundingClientRect().height ? item.el : null)
    }, extra);
  }
  async function show(item, run, i, extra) {
    let set;
    try { set = await LB.load(item.url); } catch (e) { location.href = item.url; return; }
    LB.open(set, optsFor(set, run, i, extra));
    const n = run.list[(i + 1) % run.list.length];
    if (n) LB.load(n.url).catch(() => {});   // the next one, ready before it is asked for
  }
  if (LB) {
    document.addEventListener("click", e => {
      const a = e.target.closest("[data-open]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      const item = findEntry(abs(a.getAttribute("href")));
      if (!item) return;
      e.preventDefault();
      const run = listFor(item, a);
      show(item, run, run.list.indexOf(item), { from: a });
    });
    // a record page is fetched the moment a pointer heads for it
    const warm = e => { const a = e.target.closest && e.target.closest("[data-open]"); if (a) LB.load(abs(a.getAttribute("href"))).catch(() => {}); };
    document.addEventListener("pointerover", warm, { passive: true });
    document.addEventListener("focusin", warm);
    const pill = $("[data-pill]");
    if (pill) pill.addEventListener("click", () => { const on = $(".hero-show.is-on"); if (on) on.click(); });
  }

  /* ---------- a record's own page: its pictures and films open in the light box ---------- */
  // an imported record prints a link field's address as its words; say it plainly
  $$(".rec-facts dd a").forEach(a => {
    const href = a.getAttribute("href") || "";
    if (text(a) !== href && !/^https?:/.test(text(a))) return;
    let host = href; try { host = new URL(href, BASE).hostname.replace(/^www\./, ""); } catch (e) { /* as it is */ }
    a.textContent = LB && LB.filmEmbed(href) ? "Watch the film" : host;
  });
  const gallery = $(".rec-gallery");
  if (gallery && LB) {
    const set = LB.read(document, location.href);
    set.url = "";
    const films = set.media.filter(m => m.film).length;
    const isPhoto = document.querySelector(".rec-photo");
    const sector = ($$(".rec-facts dt").find(dt => text(dt) === "Sector") || {}).nextElementSibling;
    const kicker = isPhoto ? ["Off the clock", `${set.media.length} frames`] : [text(sector) || "Work"];
    const openAt = (at, from) => LB.open(set, { at, from, kicker, pageLink: false });
    gallery.addEventListener("click", e => {
      const a = e.target.closest(".rec-pic a");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      openAt(films + $$(".rec-pic", gallery).indexOf(a.closest(".rec-pic")), a);
    });
    const lead = $(".rec-lead");
    if (lead) { lead.style.cursor = "zoom-in"; lead.addEventListener("click", () => openAt(films, lead)); }
    $$(".rec-facts a").forEach(a => {
      if (!LB.filmEmbed(a.getAttribute("href"))) return;
      const i = set.media.findIndex(m => m.film && m.href === abs(a.getAttribute("href")));
      a.addEventListener("click", e => { if (i < 0 || e.metaKey || e.ctrlKey) return; e.preventDefault(); openAt(i, a); });
    });
  }

  /* ---------- the hero: the sentence that changes its ending ---------- */
  const shows = $$(".hero-show");
  const pills = $$("[data-pill] img");
  const phrases = $$(".rot-phrase");
  if (shows.length > 1 && !reduce()) {
    let k = 0, paused = false;
    $$(".hero-reel, [data-pill]").forEach(el => {
      el.addEventListener("pointerenter", () => { paused = true; });
      el.addEventListener("pointerleave", () => { paused = false; });
    });
    const swap = (list, from, to, cls) => {
      list[from].classList.remove("is-on");
      list[from].classList.add(cls);
      setTimeout(() => list[from].classList.remove(cls), 950);
      list[to].classList.add("is-on");
    };
    setInterval(() => {
      if (paused || document.hidden || root.classList.contains("lb-open")) return;
      const was = k;
      k = (k + 1) % shows.length;
      swap(phrases, was, k, "is-off");
      swap(shows, was, k, "is-prev");
      swap(pills, was, k, "is-prev");
    }, 3600);
  }

  /* ---------- the index: filter, search, grid or list ---------- */
  const grid = $("[data-grid]");
  if (grid) {
    // the list view's extra columns come from the cards' own data (each record's fields)
    cards.forEach(li => {
      const a = $("a", li);
      a.insertAdjacentHTML("beforeend", `<span class="card-meta">${esc(li.dataset.discipline || "")}</span><span class="card-meta">${esc((li.dataset.sector || "").replace("Pharma & health", "Health"))}</span>`);
    });
    const count = { work: cards.length, consumer: 0, health: 0 };
    cards.forEach(li => {
      const s = (li.dataset.sector || "").split(", ");
      if (s.includes("Consumer")) count.consumer++;
      if (s.includes("Pharma & health")) count.health++;
    });
    $$("[data-count]").forEach(el => { if (count[el.dataset.count] != null) el.textContent = count[el.dataset.count]; });

    const chips = $$(".chip");
    const find = $("[data-find]");
    const state = { sector: "all", disc: "", q: "", view: store.get("gc-view") === "list" ? "list" : "grid" };
    const raw = new Map(cards.map(li => [li, { t: text($(".card-title", li)), c: text($(".client", li)) }]));
    const has = (li, s) => {
      if (s.sector !== "all" && !(li.dataset.sector || "").split(", ").includes(s.sector)) return false;
      if (s.disc && !(li.dataset.discipline || "").split(", ").includes(s.disc)) return false;
      if (s.q) {
        const hay = [raw.get(li).t, raw.get(li).c, li.dataset.sector, li.dataset.discipline].join(" ").toLowerCase();
        if (!s.q.split(/\s+/).every(t => hay.includes(t))) return false;
      }
      return true;
    };
    const mark = (el, words, q) => {
      if (!q) { el.textContent = words; return; }
      const terms = q.split(/\s+/).filter(Boolean).map(t => esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      el.innerHTML = esc(words).replace(new RegExp("(" + terms.join("|") + ")", "gi"), '<span class="hl">$1</span>');
    };
    function apply(animate) {
      visibleWork = allWork.filter(x => has(x.li, state));
      cards.forEach(li => {
        li.hidden = !has(li, state);
        mark($(".card-title", li), raw.get(li).t, state.q);
        mark($(".client", li), raw.get(li).c, state.q);
      });
      chips.forEach(c => {
        c.setAttribute("aria-pressed", String(c.dataset.v === state.disc));
        c.disabled = c.dataset.v !== state.disc && !cards.some(li => has(li, { ...state, disc: c.dataset.v }));
      });
      $$("[data-sector] button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.v === state.sector)));
      $$("[data-view] button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.v === state.view)));
      grid.classList.toggle("is-list", state.view === "list");
      grid.hidden = !visibleWork.length;
      $("[data-empty]").hidden = visibleWork.length > 0;
      const what = [state.sector !== "all" ? state.sector.toLowerCase() : "", state.disc, state.q ? `“${state.q}”` : ""].filter(Boolean).join(", ");
      $("[data-showing]").textContent = visibleWork.length === allWork.length ? `Showing all ${allWork.length} projects` : `Showing ${visibleWork.length} of ${allWork.length}${what ? " — " + what : ""}`;
      if (animate && !reduce()) {
        visibleWork.slice(0, 16).forEach((x, i) => {
          const a = x.li.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: i * 30, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "backwards" });
          setTimeout(() => a.cancel(), 600 + i * 30 + 150);
        });
        const sec = $("#work");
        if (bar.classList.contains("is-stuck")) {
          const y = sec.getBoundingClientRect().top + scrollY + $(".sec-head", sec).offsetHeight;
          if (scrollY > y) scrollTo({ top: y, behavior: "smooth" });
        }
      }
    }
    $("[data-sector]").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      state.sector = b.dataset.v;
      if (state.disc && !cards.some(li => has(li, state))) state.disc = "";
      apply(true);
    });
    $("[data-discs]").addEventListener("click", e => {
      const b = e.target.closest(".chip"); if (!b || b.disabled) return;
      state.disc = state.disc === b.dataset.v ? "" : b.dataset.v;
      apply(true);
    });
    $("[data-view]").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      state.view = b.dataset.v; store.set("gc-view", state.view);
      apply(true);
    });
    let findT = 0;
    find.addEventListener("input", () => { clearTimeout(findT); findT = setTimeout(() => { state.q = find.value.trim().toLowerCase(); apply(true); }, 120); });
    $("[data-reset]").addEventListener("click", () => { Object.assign(state, { sector: "all", disc: "", q: "" }); find.value = ""; apply(true); });
    apply(false);
  }

  /* ---------- photography: each set's size, and a flip through it on hover ---------- */
  if (LB && allPhotos.length) {
    const later = window.requestIdleCallback || (f => setTimeout(f, 1200));
    later(() => allPhotos.forEach(p => LB.load(p.url).then(set => {
      const frames = set.media.filter(m => !m.film);
      const tag = $("[data-frame]", p.li);
      if (tag) tag.textContent = `${frames.length} frames`;
      const img = $(".ph-media img", p.li);
      if (!img || !fine.matches) return;
      const cover = { src: img.getAttribute("src"), set: img.getAttribute("srcset") };
      let t = 0, k = 0, warmed = false;
      p.el.addEventListener("pointerenter", e => {
        if (e.pointerType !== "mouse" || reduce()) return;
        const pick = frames.slice(0, 14);
        if (!warmed) { pick.forEach(m => { new Image().src = m.src; }); warmed = true; }
        img.removeAttribute("srcset");
        t = setInterval(() => { k = (k + 1) % pick.length; img.src = pick[k].src; tag.textContent = `${pad(k + 1)} / ${frames.length}`; }, 420);
      });
      p.el.addEventListener("pointerleave", () => {
        clearInterval(t); k = 0; img.src = cover.src;
        if (cover.set) img.setAttribute("srcset", cover.set);
        tag.textContent = `${frames.length} frames`;
      });
    }).catch(() => {})));
  }

  /* ---------- the cursor label, and the list view's floating preview ---------- */
  if (fine.matches) {
    const cursor = document.createElement("div");
    cursor.className = "cursor"; cursor.setAttribute("aria-hidden", "true"); cursor.innerHTML = "<span></span>";
    const peek = document.createElement("div");
    peek.className = "peek"; peek.setAttribute("aria-hidden", "true"); peek.innerHTML = '<img alt="">';
    document.body.append(cursor, peek);
    root.classList.add("has-cursor");
    const peekImg = $("img", peek);
    const pos = { x: -300, y: -300, cx: -300, cy: -300, px: -300, py: -300 };
    let looping = false;
    const loop = () => {
      const k = reduce() ? 1 : 0.35, kp = reduce() ? 1 : 0.22;
      pos.cx += (pos.x - pos.cx) * k; pos.cy += (pos.y - pos.cy) * k;
      pos.px += (pos.x - pos.px) * kp; pos.py += (pos.y - pos.py) * kp;
      cursor.style.transform = `translate3d(${pos.cx}px, ${pos.cy}px, 0)`;
      if (peek.classList.contains("is-on")) peek.style.transform = `translate3d(${pos.px + 24}px, ${pos.py - peek.offsetHeight / 2}px, 0) rotate(${Math.max(-6, Math.min(6, (pos.x - pos.px) * 0.05))}deg)`;
      if (Math.abs(pos.x - pos.cx) < 0.3 && Math.abs(pos.x - pos.px) < 0.3 && Math.abs(pos.y - pos.py) < 0.3) { looping = false; return; }
      requestAnimationFrame(loop);
    };
    document.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      pos.x = e.clientX; pos.y = e.clientY;
      const t = e.target.closest && e.target.closest("[data-cursor]");
      const listView = grid && grid.classList.contains("is-list");
      const label = t && !(listView && t.closest(".card")) ? t.dataset.cursor : "";
      if (label) cursor.firstElementChild.textContent = label;
      cursor.classList.toggle("is-on", !!label);
      const row = listView && e.target.closest && e.target.closest(".card");
      if (row) {
        const s = $("img", row).currentSrc || $("img", row).src;
        if (peekImg.getAttribute("src") !== s) peekImg.src = s;
        if (!peek.classList.contains("is-on")) { pos.px = pos.x; pos.py = pos.y; }
      }
      peek.classList.toggle("is-on", !!row);
      if (!looping) { looping = true; requestAnimationFrame(loop); }
    }, { passive: true });
    root.addEventListener("mouseleave", () => { cursor.classList.remove("is-on"); peek.classList.remove("is-on"); });
    addEventListener("scroll", () => peek.classList.remove("is-on"), { passive: true });
  }
})();
