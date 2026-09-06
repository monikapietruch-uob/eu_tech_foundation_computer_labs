/*
  js/hub.js — the hub page's dynamic parts: the "Your progress" strip and
  the "Your saved work" area (copy reflections, clear saved work). Reads
  tasks/index.json for task counts and titles, and js/progress.js for what
  this browser has saved. Nothing here talks to a server.
*/
(function () {
  "use strict";

  var el = {};
  ["progressIntro", "progressStrip", "copyReflections", "clearWork", "clearConfirm", "clearYes", "clearNo", "clearDone"]
    .forEach(function (id) { el[id] = document.getElementById(id); });

  var index = { weeks: [] };

  function make(tag, className, content) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (content != null) { node.textContent = content; }
    return node;
  }

  function renderProgress() {
    while (el.progressStrip.firstChild) { el.progressStrip.removeChild(el.progressStrip.firstChild); }
    if (!Progress.available()) {
      el.progressIntro.textContent = "This browser does not allow saving, so progress cannot be shown here. You can still do every task.";
      return;
    }
    var rows = Progress.summary(index);
    var doneTotal = rows.reduce(function (n, r) { return n + r.done; }, 0);
    var allTotal = rows.reduce(function (n, r) { return n + r.total; }, 0);

    if (doneTotal === 0) {
      el.progressIntro.textContent = "You have not finished a task on this computer yet. Open Python practice to begin.";
    } else if (doneTotal === allTotal) {
      el.progressIntro.textContent = "Every task is done. Well done!";
    } else {
      el.progressIntro.textContent = doneTotal + " of " + allTotal + " tasks done so far. Keep going!";
    }

    rows.forEach(function (r) {
      var row = make("div", "progress-row" + (r.total && r.done === r.total ? " complete" : ""));
      var label = make("div", "progress-label");
      label.appendChild(make("span", "progress-week", "Week " + r.week));
      label.appendChild(make("span", "progress-title", r.title));
      var count = make("div", "progress-count", r.done + " of " + r.total + " done");
      var bar = make("div", "progress-bar");
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", String(r.total));
      bar.setAttribute("aria-valuenow", String(r.done));
      bar.setAttribute("aria-label", "Week " + r.week + ": " + r.done + " of " + r.total + " done");
      var fill = make("div", "progress-fill");
      fill.style.width = (r.total ? Math.round(100 * r.done / r.total) : 0) + "%";
      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);
      row.appendChild(count);
      el.progressStrip.appendChild(row);
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
