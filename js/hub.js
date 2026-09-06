/*
  js/hub.js — the hub page's dynamic parts: the "Your progress" strip and
  the "Your saved work" area (copy reflections, clear saved work). Reads
  tasks/index.json for task counts and titles, and js/progress.js for what
  this browser has saved. Nothing here talks to a server.
*/
(function () {
  "use strict";

  var el = {};
  ["progressIntro", "copyReflections", "clearWork", "clearConfirm", "clearYes", "clearNo", "clearDone"]
    .forEach(function (id) { el[id] = document.getElementById(id); });

  var index = { weeks: [] };

  function make(tag, className, content) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (content != null) { node.textContent = content; }
    return node;
  }

  // Each block row on the hub lists its weeks in data-weeks; fill in
  // "3 of 12 done" and a bar for each, from what this browser has saved.
  function renderProgress() {
    var rows = Progress.available() ? Progress.summary(index) : [];
    var byWeek = {};
    rows.forEach(function (r) { byWeek[String(r.week)] = r; });
    var doneTotal = rows.reduce(function (n, r) { return n + r.done; }, 0);
    var allTotal = rows.reduce(function (n, r) { return n + r.total; }, 0);

    if (!Progress.available()) {
      el.progressIntro.textContent = "Each block matches a few weeks of the unit. (This browser does not allow saving, so progress cannot be shown.)";
    } else if (doneTotal === 0) {
      el.progressIntro.textContent = "Each block matches a few weeks of the unit. Your progress appears here as you finish tasks on this computer.";
    } else if (doneTotal === allTotal) {
      el.progressIntro.textContent = "Every task is done. Well done!";
    } else {
      el.progressIntro.textContent = doneTotal + " of " + allTotal + " tasks done so far. Keep going!";
    }

    document.querySelectorAll(".block-row[data-weeks]").forEach(function (row) {
      var slot = row.querySelector("[data-progress]");
      if (!slot) { return; }
      while (slot.firstChild) { slot.removeChild(slot.firstChild); }
      var weeks = row.getAttribute("data-weeks").split(",");
      var done = 0, total = 0;
      weeks.forEach(function (w) { var r = byWeek[w]; if (r) { done += r.done; total += r.total; } });
      if (!Progress.available() || total === 0) { return; }
      var bar = make("div", "progress-bar");
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", String(total)); bar.setAttribute("aria-valuenow", String(done));
      bar.setAttribute("aria-label", row.querySelector("h3").textContent + ": " + done + " of " + total + " done");
      var fill = make("div", "progress-fill");
      fill.style.width = Math.round(100 * done / total) + "%";
      bar.appendChild(fill);
      slot.appendChild(bar);
      slot.appendChild(make("span", "progress-count", done + " of " + total + " done"));
      row.classList.toggle("complete", done === total);
    });
  }

  Tasks.loadIndex().then(function (idx) {
    index = idx;
    renderProgress();
  }, function () {
    el.progressIntro.textContent = "The task list could not be loaded.";
  });

  el.copyReflections.addEventListener("click", function () { Reflections.copy(index, el.copyReflections); });

  el.clearWork.addEventListener("click", function () {
    el.clearConfirm.hidden = false;
    el.clearDone.textContent = "";
    el.clearYes.focus();
  });
  el.clearNo.addEventListener("click", function () {
    el.clearConfirm.hidden = true;
    el.clearWork.focus();
  });
  el.clearYes.addEventListener("click", function () {
    var ok = Progress.clearAll();
    el.clearConfirm.hidden = true;
    el.clearDone.textContent = ok ? "Cleared. Nothing of yours is saved in this browser now." : "Could not clear — this browser does not allow it.";
    renderProgress();
    el.clearWork.focus();
  });
})();
