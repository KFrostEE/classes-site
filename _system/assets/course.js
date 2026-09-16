/* =================================================================
   course.js — shared behavior for all generated course pages.
   Everything here is progressive enhancement: the page is fully
   readable with JS disabled. No external calls, works over file://
   ================================================================= */
(function () {
  "use strict";

  /* ---------- Theme: remember the reader's choice ---------------- */
  var THEME_KEY = "classes-theme";
  function readTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function writeTheme(v) {
    try { localStorage.setItem(THEME_KEY, v); } catch (e) { /* private mode */ }
  }
  // Applied as early as possible to avoid a flash of the wrong theme.
  var saved = readTheme();
  if (saved === "dark" || saved === "light") {
    document.documentElement.setAttribute("data-theme", saved);
  }

  function currentTheme() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr) return attr;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function mountThemeToggle() {
    var btn = document.createElement("button");
    btn.className = "theme-btn";
    btn.type = "button";
    btn.title = "Toggle light / dark";
    btn.setAttribute("aria-label", "Toggle light or dark theme");
    function paint() { btn.textContent = currentTheme() === "dark" ? "☀" : "☽"; }
    paint();
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      writeTheme(next);
      paint();
    });
    document.body.appendChild(btn);
  }

  /* ---------- Slugs & heading anchors ---------------------------- */
  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60);
  }

  function ensureHeadingIds(headings) {
    var seen = Object.create(null);
    headings.forEach(function (h) {
      if (!h.id) {
        var base = slugify(h.textContent) || "section";
        var id = base, n = 2;
        while (seen[id] || document.getElementById(id)) { id = base + "-" + n++; }
        h.id = id;
      }
      seen[h.id] = true;
      if (!h.querySelector(".anchor")) {
        var a = document.createElement("a");
        a.className = "anchor";
        a.href = "#" + h.id;
        a.textContent = "#";
        a.setAttribute("aria-label", "Link to this section");
        h.appendChild(a);
      }
    });
  }

  /* ---------- Auto table of contents ------------------------------
     Any <nav data-toc> in the sidebar is filled from the h2/h3 in
     <main>. Pages that want a hand-written nav simply omit the attr. */
  function buildToc(headings) {
    var nav = document.querySelector("nav[data-toc]");
    if (!nav || !headings.length) return null;
    var ol = document.createElement("ol");
    headings.forEach(function (h) {
      var li = document.createElement("li");
      li.className = "lvl-" + h.tagName.charAt(1);
      var a = document.createElement("a");
      a.href = "#" + h.id;
      // Clone so the "#" anchor we appended does not leak into the TOC label.
      var clone = h.cloneNode(true);
      var strip = clone.querySelector(".anchor");
      if (strip) strip.remove();
      a.textContent = clone.textContent.trim();
      li.appendChild(a);
      ol.appendChild(li);
    });
    nav.innerHTML = "";
    nav.appendChild(ol);
    return nav;
  }

  /* ---------- Scroll spy ----------------------------------------- */
  function mountScrollSpy(headings, nav) {
    if (!nav || !("IntersectionObserver" in window)) return;
    var links = {};
    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
      links[a.getAttribute("href").slice(1)] = a;
    });
    var visible = new Set();

    function repaint() {
      var best = null;
      headings.forEach(function (h) {
        if (visible.has(h.id) && best === null) best = h.id;
      });
      if (best === null) {
        // Nothing on screen (mid-section): fall back to the last heading passed.
        for (var i = headings.length - 1; i >= 0; i--) {
          if (headings[i].getBoundingClientRect().top < 120) { best = headings[i].id; break; }
        }
      }
      Object.keys(links).forEach(function (id) {
        links[id].classList.toggle("active", id === best);
      });
      // Keep the active entry visible by scrolling the nav's own overflow box.
      // scrollIntoView() must not be used here: it walks every scrollable
      // ancestor, and below 1020px the sidebar is static, so it would drag the
      // whole document back up to the TOC while the reader is scrolling.
      if (best && links[best] && nav.scrollHeight > nav.clientHeight) {
        var lr = links[best].getBoundingClientRect(), nr = nav.getBoundingClientRect();
        if (lr.top < nr.top) nav.scrollTop -= (nr.top - lr.top);
        else if (lr.bottom > nr.bottom) nav.scrollTop += (lr.bottom - nr.bottom);
      }
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      });
      repaint();
    }, { rootMargin: "-80px 0px -70% 0px", threshold: 0 });

    headings.forEach(function (h) { io.observe(h); });
    window.addEventListener("scroll", repaint, { passive: true });
    repaint();
  }

  /* ---------- Reading progress ----------------------------------- */
  function mountProgress() {
    var bar = document.createElement("div");
    bar.className = "progress";
    document.body.appendChild(bar);
    function update() {
      var doc = document.documentElement;
      var span = doc.scrollHeight - doc.clientHeight;
      var pct = span > 0 ? (doc.scrollTop / span) * 100 : 0;
      bar.style.width = Math.min(100, Math.max(0, pct)) + "%";
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* ---------- Math -----------------------------------------------
     KaTeX is vendored locally so pages work with no network. If it is
     not present the raw \( ... \) source stays visible and readable. */
  function renderMath() {
    if (typeof window.renderMathInElement !== "function") return;
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false,
      ignoredClasses: ["no-math"]
    });
  }

  /* ---------- Print: reveal every collapsed answer ---------------- */
  function mountPrintExpand() {
    var opened = [];
    window.addEventListener("beforeprint", function () {
      opened = [];
      Array.prototype.forEach.call(document.querySelectorAll("details:not([open])"), function (d) {
        opened.push(d); d.open = true;
      });
    });
    window.addEventListener("afterprint", function () {
      opened.forEach(function (d) { d.open = false; });
      opened = [];
    });
  }

  /* ---------- Boot ------------------------------------------------ */
  function init() {
    var main = document.querySelector("main");
    var headings = main
      ? Array.prototype.slice.call(main.querySelectorAll("h2, h3"))
      : [];
    ensureHeadingIds(headings);
    var nav = buildToc(headings);
    mountScrollSpy(headings, nav);
    mountThemeToggle();
    mountProgress();
    mountPrintExpand();
    renderMath();
    // If we arrived with a #hash, smooth-scroll now that IDs exist.
    if (location.hash) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
