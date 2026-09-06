/*
  js/reflections.js — the "Copy my reflections" button, shared by the hub
  page and the task page. Builds the plain text with js/progress.js, copies
  it to the clipboard, and shows the result on the button itself for a few
  seconds so the student can see it worked.

    Reflections.copy(index, button)   index is tasks/index.json (for order and titles)
*/
var Reflections = (function () {
  "use strict";

  function flash(button, label, kind) {
    var original = button.getAttribute("data-label") || button.textContent;
    button.setAttribute("data-label", original);
    button.textContent = label;
    button.classList.add(kind);
    setTimeout(function () {
      button.textContent = original;
      button.classList.remove(kind);
    }, 2500);
  }

  function writeClipboard(textValue) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(textValue);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = textValue;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("copy failed"));
    });
  }

  function copy(index, button) {
    var textValue = Progress.reflectionsAsText(index || { weeks: [] });
    if (!textValue) {
      flash(button, "Nothing to copy yet", "flash-neutral");
      return;
    }
    writeClipboard(textValue).then(function () {
      flash(button, "Copied ✓ — now paste into Padlet", "flash-good");
    }, function () {
      flash(button, "Could not copy — select the text yourself", "flash-bad");
      window.prompt("Copy this text:", textValue);
    });
  }

  return { copy: copy };
})();
