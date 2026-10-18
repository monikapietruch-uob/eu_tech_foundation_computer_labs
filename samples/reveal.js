/*
  samples/reveal.js — used only by the sample pages in this folder.
  When the page is opened with ?reveal=1 (the "Reveal" button on the
  inspect tasks), every element marked data-flaw="..." gets a red dashed
  outline and a small label saying what is wrong with it, and a banner
  appears at the top. Without ?reveal=1 it does nothing, so the page looks
  like an ordinary (flawed) website.
*/
(function () {
  "use strict";
  if (!/[?&]reveal=1/.test(window.location.search)) { return; }

  var LABELS = {
    alt: "Image with no alt text — a screen reader has nothing to say here",
    heading: "Heading jumps from h1 to h4 — skipped levels confuse screen readers and outlines",
    contrast: "Grey text on grey — too little contrast to read easily",
    divbutton: "A <div> made to look like a button — keyboards and screen readers cannot use it",
    label: "A form input with no <label> — nobody knows what to type here",
    // the second round of sample pages (events-site.html, repair-site.html)
    badalt: "Alt text that gives the file name, not what the picture shows — a screen reader reads out \"IMG 4471 jpg\"",
    clickhere: "A link whose text is only \"click here\" — read on its own, nobody knows where it goes",
    tiny: "Text at 10px — too small to read comfortably, for everyone",
    colouronly: "Meaning shown by colour alone — anyone who cannot tell the two colours apart gets no information",
    lowcontrast: "Dark grey text on black — too little contrast to read",
    noth: "A table with no header cells (<th>) — a screen reader cannot say which column a price belongs to",
    iconlink: "A link that is only an icon, with no text — a screen reader just says \"link\""
  };

  var style = document.createElement("style");
  style.textContent =
    ".reveal-banner{position:sticky;top:0;z-index:9;background:#1a1a2e;color:#fff;padding:.6rem 1rem;font:15px/1.4 Arial,sans-serif}" +
    "[data-flaw]{outline:3px dashed #C8102E !important;outline-offset:3px;position:relative}" +
    ".reveal-label{display:block;background:#C8102E;color:#fff;font:bold 12px/1.3 Arial,sans-serif;padding:.25rem .5rem;margin:.25rem 0;border-radius:4px;max-width:36em}";
  document.head.appendChild(style);

  var flawed = document.querySelectorAll("[data-flaw]");

  var banner = document.createElement("div");
  banner.className = "reveal-banner";
  banner.textContent = "Answers revealed: the " + flawed.length + " problems on this page are outlined in red.";
  document.body.insertBefore(banner, document.body.firstChild);

  Array.prototype.forEach.call(flawed, function (node) {
    var kind = node.getAttribute("data-flaw");
    var label = document.createElement("span");
    label.className = "reveal-label";
    label.textContent = LABELS[kind] || kind;
    node.parentNode.insertBefore(label, node.nextSibling);
  });
})();
