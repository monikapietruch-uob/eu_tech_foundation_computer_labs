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
    label: "A form input with no <label> — nobody knows what to type here"
  };

  var style = document.createElement("style");
  style.textContent =
    ".reveal-banner{position:sticky;top:0;z-index:9;background:#1a1a2e;color:#fff;padding:.6rem 1rem;font:15px/1.4 Arial,sans-serif}" +
    "[data-flaw]{outline:3px dashed #C8102E !important;outline-offset:3px;position:relative}" +
    ".reveal-label{display:block;background:#C8102E;color:#fff;font:bold 12px/1.3 Arial,sans-serif;padding:.25rem .5rem;margin:.25rem 0;border-radius:4px;max-width:36em}";
  document.head.appendChild(style);

  var banner = document.createElement("div");
  banner.className = "reveal-banner";
  banner.textContent = "Answers revealed: the 5 problems on this page are outlined in red.";
  document.body.insertBefore(banner, document.body.firstChild);

  var flawed = document.querySelectorAll("[data-flaw]");
  Array.prototype.forEach.call(flawed, function (node) {
    var kind = node.getAttribute("data-flaw");
    var label = document.createElement("span");
    label.className = "reveal-label";
    label.textContent = LABELS[kind] || kind;
    node.parentNode.insertBefore(label, node.nextSibling);
  });
})();
