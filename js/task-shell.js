/*
  js/task-shell.js — the parts of a task page that every task type shares.

  Both practice-python.html (console + karel tasks) and practice-web.html
  (the web tasks) use this. It owns the left column (task list, brief,
  vocabulary, hints), the verdict banner, the reflection questions, the
  "Next task" link, and the progress bookkeeping. The page-specific part —
  the editor and Run button, or the web task area — is a "renderer" the
  page passes in.

    TaskShell.init({
      types: ["console", "karel"],     which task types this page shows
      render: function (task) {...}    called when a task opens
    });

    TaskShell.task, TaskShell.index         the current task / the index
    TaskShell.showVerdict(kind, message)    kind: good | bad | neutral | wait
    TaskShell.clearVerdict()
    TaskShell.taskPassed()                  records the pass, shows reflections + Next
    TaskShell.make(tag, className, text)    small DOM helpers, shared
    TaskShell.clear(node), TaskShell.text(node, value)

  The task list links each task to the right page for its type, so a
  student can move between the Python page and the web page from either.
*/
var TaskShell = (function () {
  "use strict";

  var PAGE_FOR_TYPE = {
    console: "practice-python.html",
    karel: "practice-python.html",
    "html-editor": "practice-web.html",
    inspect: "practice-web.html",
    walkthrough: "practice-web.html",
    summary: "practice-web.html"
  };

  var el = {};
  ["taskNav", "taskWeek", "taskTitle", "taskConcepts", "taskText", "taskVocab",
   "hintButton", "hintList", "verdict", "next", "nextLink",
   "reflect", "reflectTried", "reflectWord", "reflectSaved", "copyReflections", "savedNote"]
    .forEach(function (id) { el[id] = document.getElementById(id); });

  var options = { types: [], render: function () {} };
  var index = null;
  var task = null;
  var hintsShown = 0;
  var doneThisVisit = {};

  // ------------------------------------------------------------ helpers
  function text(node, value) { if (node) { node.textContent = value; } }
  function clear(node) { while (node && node.firstChild) { node.removeChild(node.firstChild); } }
  function make(tag, className, content) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (content != null) { node.textContent = content; }
    return node;
  }

  function typeOf(entry) { return entry.type || (entry.id.split("-")[0]); }
  function pageFor(type) { return PAGE_FOR_TYPE[type] || "practice-web.html"; }
  function urlFor(entry) { return pageFor(typeOf(entry)) + "?task=" + encodeURIComponent(entry.id); }
  function onThisPage(entry) { return options.types.indexOf(typeOf(entry)) !== -1; }

  function taskIdFromUrl() { return new URLSearchParams(window.location.search).get("task"); }

  // Tasks of this page's types, in teaching order.
  function pageList() {
    return Tasks.flatList(index).filter(onThisPage);
  }

  // ------------------------------------------------------------ nav
  function renderNav() {
    clear(el.taskNav);
    (index.weeks || []).forEach(function (week) {
      var mine = (week.tasks || []).filter(onThisPage);
      if (!mine.length) { return; }
      var group = make("div", "task-week");
      group.appendChild(make("h3", null, "Week " + week.week + " · " + week.title));
      var list = make("ol", "task-list");
      mine.forEach(function (entry) {
        var item = make("li");
        var link = make("a", null, entry.title);
        link.href = urlFor(entry);
        if (task && entry.id === task.id) { link.setAttribute("aria-current", "page"); }
        var saved = Progress.get(entry.id);
        if (doneThisVisit[entry.id] || (saved && saved.status === "passed")) { item.className = "done"; }
        item.appendChild(link);
        list.appendChild(item);
      });
      group.appendChild(list);
      el.taskNav.appendChild(group);
    });
  }

  // ------------------------------------------------------------ brief
  function renderBrief() {
    text(el.taskWeek, "Week " + task.week);
    text(el.taskTitle, task.title);
    document.title = task.title + " — Tech Practice Hub";

    clear(el.taskConcepts);
    (task.concepts || []).forEach(function (c) { el.taskConcepts.appendChild(make("span", "chip", c)); });

    clear(el.taskText);
    // Paragraphs are separated by a blank line; a paragraph wrapped in
    // ``` fences is shown as code (for sample output).
    String(task.brief || "").split(/\n\n+/).forEach(function (para) {
      var fenced = /^```\n?([\s\S]*?)\n?```$/.exec(para.trim());
      if (fenced) { el.taskText.appendChild(make("pre", "sample", fenced[1])); }
      else { el.taskText.appendChild(make("p", null, para)); }
    });

    clear(el.taskVocab);
    if (task.vocabulary && task.vocabulary.length) {
      el.taskVocab.appendChild(make("h3", null, "Words to know"));
      var dl = make("dl");
      task.vocabulary.forEach(function (v) {
        dl.appendChild(make("dt", null, v.term));
        dl.appendChild(make("dd", null, v.gloss));
      });
      el.taskVocab.appendChild(dl);
    }

    hintsShown = 0;
    clear(el.hintList);
    updateHintButton();
  }

  function updateHintButton() {
    var total = (task.hints || []).length;
    if (total === 0) { el.hintButton.hidden = true; return; }
    el.hintButton.hidden = false;
    if (hintsShown >= total) {
      text(el.hintButton, "No more hints");
      el.hintButton.disabled = true;
    } else {
      text(el.hintButton, hintsShown === 0 ? "Show a hint (" + total + " available)" : "Show another hint (" + (total - hintsShown) + " left)");
      el.hintButton.disabled = false;
    }
  }

  function showHint() {
    var hints = task.hints || [];
    if (hintsShown >= hints.length) { return; }
    el.hintList.appendChild(make("li", null, hints[hintsShown]));
    hintsShown++;
    updateHintButton();
  }

  // ------------------------------------------------------------ verdict, next, reflections
  function showVerdict(kind, message) {
    el.verdict.hidden = false;
    el.verdict.className = "verdict " + kind;
    text(el.verdict, message);
  }

  function clearVerdict() {
    el.verdict.hidden = true;
    el.verdict.className = "verdict";
    el.next.hidden = true;
    el.reflect.hidden = true;
  }

  function showNext() {
    var list = pageList();
    var at = -1;
    list.forEach(function (e, i) { if (e.id === task.id) { at = i; } });
    var next = at >= 0 && at < list.length - 1 ? list[at + 1] : null;
    el.next.hidden = false;
    if (next) {
      el.nextLink.href = urlFor(next);
      text(el.nextLink, "Next task: " + next.title + " →");
    } else {
      el.nextLink.href = "index.html";
      text(el.nextLink, "That was the last task here. Back to the hub →");
    }
  }

  function taskPassed() {
    doneThisVisit[task.id] = true;
    Progress.markPassed(task.id, task);
    renderNav();
    showReflections();
    showNext();
  }

  function showReflections() {
    var saved = Progress.get(task.id);
    var r = (saved && saved.reflections) || {};
    el.reflectTried.value = r.tried || "";
    el.reflectWord.value = r.word || "";
    text(el.reflectSaved, "");
    el.reflect.hidden = false;
  }

  var reflectTimer = null;
  function reflectionChanged() {
    clearTimeout(reflectTimer);
    text(el.reflectSaved, "Saving…");
    reflectTimer = setTimeout(function () {
      // Save both boxes every time, so a quick edit to one never loses the other.
      Progress.saveReflection(task.id, task, "tried", el.reflectTried.value);
      Progress.saveReflection(task.id, task, "word", el.reflectWord.value);
      text(el.reflectSaved, Progress.available() ? "Saved in this browser." : "Could not save — this browser does not allow it.");
    }, 400);
  }

  // ------------------------------------------------------------ load
  function showLoadError(message) {
    text(el.taskTitle, "Could not load this task");
    clear(el.taskText);
    el.taskText.appendChild(make("p", null, message));
    var back = make("a", "btn outline", "Back to the task list");
    back.href = window.location.pathname.split("/").pop() || "index.html";
    el.taskText.appendChild(back);
  }

  function openTask(id) {
    return Tasks.loadTask(id).then(function (t) {
      task = t;
      renderNav();
      renderBrief();
      clearVerdict();
      options.render(task);
    });
  }

  function init(opts) {
    options.types = opts.types || [];
    options.render = opts.render || function () {};

    el.hintButton.addEventListener("click", showHint);
    el.reflectTried.addEventListener("input", reflectionChanged);
    el.reflectWord.addEventListener("input", reflectionChanged);
    el.copyReflections.addEventListener("click", function () { Reflections.copy(index, el.copyReflections); });
    if (el.savedNote && !Progress.available()) {
      text(el.savedNote, "This browser does not allow saving, so your work will be lost when you close the page. Copy anything important somewhere safe.");
    }

    Tasks.loadIndex().then(function (idx) {
      index = idx;
      var wanted = taskIdFromUrl();
      var list = pageList();
      var exists = list.some(function (e) { return e.id === wanted; });
      if (!exists) { wanted = list.length ? list[0].id : null; }
      if (!wanted) { showLoadError("There are no tasks in the list yet."); return; }
      return openTask(wanted);
    }).catch(function (err) {
      showLoadError(err.message + " Check that the site is running from a web server (python3 -m http.server), not opened as a file.");
    });
  }

  return {
    init: init,
    get task() { return task; },
    get index() { return index; },
    showVerdict: showVerdict,
    clearVerdict: clearVerdict,
    taskPassed: taskPassed,
    showNext: showNext,
    make: make, clear: clear, text: text
  };
})();
