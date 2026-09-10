/* site.js — the theme switch.

   The product register, the proof strip and the writing list used to be built
   here, in the browser. They are now written into the HTML by
   tools/build_home.py, so a crawler that runs no scripts still sees every
   product name. Nothing on this site depends on JavaScript to be readable. */

(function () {
  "use strict";

  var LANG = (document.documentElement.lang || "tr").slice(0, 2) === "en" ? "en" : "tr";
  var LABEL = {
    tr: "Açık ve koyu tema arasında geçiş yap",
    en: "Switch between light and dark"
  }[LANG];

  function currentTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function start() {
    var button = document.getElementById("theme-toggle");
    if (!button) return;

    button.setAttribute("aria-label", LABEL);
    button.setAttribute("title", LABEL);
    button.setAttribute("aria-pressed", String(currentTheme() === "dark"));
    button.hidden = false;

    button.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
      button.setAttribute("aria-pressed", String(next === "dark"));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
