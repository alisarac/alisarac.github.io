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

  var box = null, frame = null, picture = null, counter = null;
  var shots = [], at = 0, round = false;

  function build() {
    if (box) return;

    box = document.createElement("dialog");
    box.className = "lb";
    box.setAttribute("aria-label", COPY.gallery);

    frame = document.createElement("div");
    frame.className = "lb__frame";

    picture = document.createElement("img");
    picture.className = "lb__img";
    picture.decoding = "async";
    frame.appendChild(picture);

    var bar = document.createElement("div");
    bar.className = "lb__bar";

    counter = document.createElement("p");
    counter.className = "lb__count";

    bar.appendChild(button("lb__btn lb__btn--prev", COPY.prev, "M10 2 4 8l6 6", function () { go(-1); }));
    bar.appendChild(counter);
    bar.appendChild(button("lb__btn lb__btn--next", COPY.next, "M6 2l6 6-6 6", function () { go(1); }));

    var close = button("lb__btn lb__close", COPY.close, "M3 3l10 10M13 3L3 13", function () { box.close(); });
    close.autofocus = true;   /* showModal() would otherwise land on "previous" */

    box.appendChild(frame);
    box.appendChild(bar);
    box.appendChild(close);
    document.body.appendChild(box);

    /* Clicking the backdrop, which is the dialog itself outside the image. */
    box.addEventListener("click", function (event) {
      if (event.target === box || event.target === frame) box.close();
    });

    wireSwipe();

    box.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
    });
  }

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

  function show(i) {
    at = (i + shots.length) % shots.length;
    var link = shots[at];
    picture.style.transition = "none";
    picture.style.transform = "";
    picture.src = link.getAttribute("href");
    picture.alt = link.querySelector("img") ? link.querySelector("img").alt : "";
    picture.classList.toggle("lb__img--round", round);
    counter.textContent = COPY.count(at + 1, shots.length);
    counter.hidden = shots.length < 2;
    box.querySelector(".lb__btn--prev").hidden = shots.length < 2;
    box.querySelector(".lb__btn--next").hidden = shots.length < 2;
  }

  function go(step) { show(at + step); }

  /* Swipe. Pinch-zoom is left to the browser, because a screenshot is
     something people want to zoom into; only a single-finger horizontal drag
     is treated as a gesture. */
  var SWIPE = 45;
  var startX = 0, startY = 0, dragging = false, moved = 0;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function slide(px) {
    if (still) return;
    picture.style.transform = px ? "translateX(" + px + "px)" : "";
  }

  function wireSwipe() {
    frame.addEventListener("touchstart", function (event) {
      if (event.touches.length !== 1 || shots.length < 2) { dragging = false; return; }
      dragging = true;
      moved = 0;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      picture.style.transition = "none";
    }, { passive: true });

    frame.addEventListener("touchmove", function (event) {
      if (!dragging || event.touches.length !== 1) return;
      var dx = event.touches[0].clientX - startX;
      var dy = event.touches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) { dragging = false; slide(0); return; }
      moved = dx;
      slide(dx * 0.55);          /* damped, so the edges feel like edges */
    }, { passive: true });

    frame.addEventListener("touchend", function () {
      if (!dragging) return;
      dragging = false;
      picture.style.transition = still ? "" : "transform 160ms ease-out";
      if (Math.abs(moved) > SWIPE) {
        go(moved < 0 ? 1 : -1);
      }
      slide(0);
    }, { passive: true });
  }

  function wireLightbox() {
    var strips = document.querySelectorAll(".row__shots, .shots");
    if (!strips.length || !window.HTMLDialogElement) return;   /* link still works */

    strips.forEach(function (strip) {
      strip.addEventListener("click", function (event) {
        var link = event.target.closest("a.shot");
        if (!link || !strip.contains(link)) return;
        event.preventDefault();
        build();
        shots = Array.prototype.slice.call(strip.querySelectorAll("a.shot"));
        round = /--wear/.test(strip.className);
        show(shots.indexOf(link));
        box.showModal();
        var close = box.querySelector(".lb__close");
        if (close) close.focus();
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
