/* site.js — the theme switch and the screenshot lightbox.

   The product register, the proof strip and the writing list are written into
   the HTML by tools/build_home.py, so a browser that runs no scripts still
   sees every product name. Nothing here is needed to read the site: with
   JavaScript off, a screenshot is a plain link to the full-size image. */

(function () {
  "use strict";

  var LANG = (document.documentElement.lang || "tr").slice(0, 2) === "en" ? "en" : "tr";

  var COPY = {
    tr: {
      theme: "Açık ve koyu tema arasında geçiş yap",
      gallery: "Ekran görüntüleri",
      close: "Kapat",
      prev: "Önceki",
      next: "Sonraki",
      count: function (i, n) { return i + " / " + n; }
    },
    en: {
      theme: "Switch between light and dark",
      gallery: "Screenshots",
      close: "Close",
      prev: "Previous",
      next: "Next",
      count: function (i, n) { return i + " of " + n; }
    }
  }[LANG];

  /* ── theme ───────────────────────────────────────────── */

  function currentTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function wireTheme() {
    var button = document.getElementById("theme-toggle");
    if (!button) return;

    button.setAttribute("aria-label", COPY.theme);
    button.setAttribute("title", COPY.theme);
    button.setAttribute("aria-pressed", String(currentTheme() === "dark"));
    button.hidden = false;

    button.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
      button.setAttribute("aria-pressed", String(next === "dark"));
    });
  }

  /* ── lightbox ────────────────────────────────────────── */
  /* A real carousel: every shot is a slide on one track, so dragging brings
     the neighbouring image in with your finger instead of swapping after the
     fact. The track is moved in pixels, which keeps the drag and the snap in
     the same unit. */

  var box, viewport, track, bar, counter, prevBtn, nextBtn;
  var shots = [], slides = [], at = 0, round = false, width = 0;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function button(cls, label, path, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
      + '<path d="' + path + '" fill="none" stroke="currentColor" stroke-width="1.8" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    b.addEventListener("click", onClick);
    return b;
  }

  function build() {
    if (box) return;

    box = document.createElement("dialog");
    box.className = "lb";
    box.setAttribute("aria-label", COPY.gallery);

    viewport = document.createElement("div");
    viewport.className = "lb__viewport";
    track = document.createElement("div");
    track.className = "lb__track";
    viewport.appendChild(track);

    bar = document.createElement("div");
    bar.className = "lb__bar";
    counter = document.createElement("p");
    counter.className = "lb__count";
    prevBtn = button("lb__btn lb__btn--prev", COPY.prev, "M10 2 4 8l6 6", function () { go(-1); });
    nextBtn = button("lb__btn lb__btn--next", COPY.next, "M6 2l6 6-6 6", function () { go(1); });
    bar.appendChild(prevBtn);
    bar.appendChild(counter);
    bar.appendChild(nextBtn);

    var close = button("lb__btn lb__close", COPY.close, "M3 3l10 10M13 3L3 13", function () { box.close(); });

    box.appendChild(viewport);
    box.appendChild(bar);
    box.appendChild(close);
    document.body.appendChild(box);

    viewport.addEventListener("click", function (event) {
      if (event.target === viewport || event.target.classList.contains("lb__slide")) box.close();
    });

    box.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
    });

    window.addEventListener("resize", function () {
      if (!box.open) return;
      width = viewport.clientWidth;
      move(-at * width, false);
    });

    wireDrag();
  }

  function move(px, animate) {
    track.style.transition = (animate && !still) ? "transform 260ms cubic-bezier(.22,.61,.36,1)" : "none";
    track.style.transform = "translateX(" + px + "px)";
  }

  /* Only the neighbours are fetched, so opening a gallery of eight costs one
     image, not eight. */
  function load(i) {
    for (var n = i - 1; n <= i + 1; n++) {
      var s = slides[(n + slides.length) % slides.length];
      if (s && !s.firstChild.src) s.firstChild.src = s.firstChild.dataset.src;
    }
  }

  function setIndex(i, animate) {
    at = Math.max(0, Math.min(slides.length - 1, i));
    load(at);
    move(-at * width, animate);
    counter.textContent = COPY.count(at + 1, slides.length);
    prevBtn.disabled = at === 0;
    nextBtn.disabled = at === slides.length - 1;
  }

  function go(step) { setIndex(at + step, true); }

  var startX = 0, startY = 0, dragging = false, dx = 0;

  function wireDrag() {
    viewport.addEventListener("touchstart", function (event) {
      if (event.touches.length !== 1 || slides.length < 2) { dragging = false; return; }
      dragging = true; dx = 0;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      track.style.transition = "none";
    }, { passive: true });

    viewport.addEventListener("touchmove", function (event) {
      if (!dragging || event.touches.length !== 1) return;
      var mx = event.touches[0].clientX - startX;
      var my = event.touches[0].clientY - startY;
      if (dx === 0 && Math.abs(my) > Math.abs(mx)) { dragging = false; return; }
      dx = mx;
      /* Resist at the two ends, so the gallery feels like it has edges. */
      if ((at === 0 && dx > 0) || (at === slides.length - 1 && dx < 0)) dx *= 0.32;
      move(-at * width + dx, false);
    }, { passive: true });

    function release() {
      if (!dragging) return;
      dragging = false;
      var far = Math.abs(dx) > Math.min(72, width * 0.18);
      setIndex(far ? at + (dx < 0 ? 1 : -1) : at, true);
      dx = 0;
    }
    viewport.addEventListener("touchend", release, { passive: true });
    viewport.addEventListener("touchcancel", release, { passive: true });
  }

  function open(strip, link) {
    build();
    shots = Array.prototype.slice.call(strip.querySelectorAll("a.shot"));
    round = /--wear/.test(strip.className);

    track.textContent = "";
    slides = shots.map(function (a) {
      var slide = document.createElement("div");
      slide.className = "lb__slide";
      var img = document.createElement("img");
      img.className = "lb__img" + (round ? " lb__img--round" : "");
      img.decoding = "async";
      img.dataset.src = a.getAttribute("href");
      img.alt = a.querySelector("img") ? a.querySelector("img").alt : "";
      slide.appendChild(img);
      track.appendChild(slide);
      return slide;
    });

    bar.hidden = slides.length < 2;
    box.showModal();
    width = viewport.clientWidth;
    setIndex(shots.indexOf(link), false);
    var close = box.querySelector(".lb__close");
    if (close) close.focus();
  }

  function wireLightbox() {
    var strips = document.querySelectorAll(".row__shots, .shots");
    if (!strips.length || !window.HTMLDialogElement) return;   /* link still works */

    strips.forEach(function (strip) {
      strip.addEventListener("click", function (event) {
        var link = event.target.closest("a.shot");
        if (!link || !strip.contains(link)) return;
        event.preventDefault();
        open(strip, link);
      });
    });
  }

  function start() {
    wireTheme();
    wireLightbox();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
