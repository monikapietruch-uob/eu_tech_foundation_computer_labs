/*
  js/task-screen.js — drives the task page (practice-python.html).

  It reads the task id from ?task= in the URL, loads the task list and the
  task with js/tasks.js, fills in the brief / vocabulary / hints, manages
  the code editor (Tab inserts spaces, line numbers in the gutter), and on
  Run sends the program through every test case, showing the expected
  output beside what the program actually printed.

  Code the student types is kept in memory for this page visit only;
  saving it between visits comes in stage 5 (progress).
*/
(function () {
  "use strict";

  var el = {};
  ["taskNav", "taskWeek", "taskTitle", "taskConcepts", "taskText", "taskVocab",
   "hintButton", "hintList", "code", "gutter", "runButton", "stopButton", "resetButton",
   "statusDot", "statusText", "verdict", "stdout", "outputNote", "error", "explanation",
   "details", "traceback", "tests", "next", "nextLink"]
    .forEach(function (id) { el[id] = document.getElementById(id); });

  var index = null;
  var task = null;
  var hintsShown = 0;
  var codeThisVisit = {};      // taskId -> code, so switching tasks does not lose work
  var doneThisVisit = {};      // taskId -> true when all tests passed

  // ------------------------------------------------------------ helpers
  function text(node, value) { node.textContent = value; }

  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }

  function make(tag, className, content) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (content != null) { node.textContent = content; }
    return node;
  }

  function taskIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get("task");
  }

  function urlFor(id) {
    return "practice-python.html?task=" + encodeURIComponent(id);
  }

  // Show text such as "4 + 5 = 9\n" with the invisible characters visible,
  // so a missing newline or extra space is something the student can see.
  function visible(s) {
    if (s === "" || s == null) { return "(nothing)"; }
    return String(s).replace(/\r/g, "").replace(/\n/g, "↵\n");
  }

  // ------------------------------------------------------------ nav
  function renderNav() {
    clear(el.taskNav);
    (index.weeks || []).forEach(function (week) {
      var group = make("div", "task-week");
      group.appendChild(make("h3", null, "Week " + week.week + " · " + week.title));
      var list = make("ol", "task-list");
      (week.tasks || []).forEach(function (entry) {
        var item = make("li");
        var link = make("a", null, entry.title);
        link.href = urlFor(entry.id);
        if (task && entry.id === task.id) { link.setAttribute("aria-current", "page"); }
        if (doneThisVisit[entry.id]) { item.className = "done"; }
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
    document.title = task.title + " — Python practice";

    clear(el.taskConcepts);
    (task.concepts || []).forEach(function (c) {
      el.taskConcepts.appendChild(make("span", "chip", c));
    });

    clear(el.taskText);
    // The brief is plain text. Paragraphs are separated by a blank line, and
    // a paragraph wrapped in ``` fences is shown as code (for sample output).
    String(task.brief || "").split(/\n\n+/).forEach(function (para) {
      var fenced = /^```\n?([\s\S]*?)\n?```$/.exec(para.trim());
      if (fenced) {
        el.taskText.appendChild(make("pre", "sample", fenced[1]));
      } else {
        el.taskText.appendChild(make("p", null, para));
      }
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

  // ------------------------------------------------------------ editor
  function updateGutter() {
    var lines = el.code.value.split("\n").length;
    var numbers = [];
    for (var i = 1; i <= lines; i++) { numbers.push(i); }
    el.gutter.textContent = numbers.join("\n");
    el.gutter.scrollTop = el.code.scrollTop;
  }

  var escapePressed = false;
  function editorKeydown(e) {
    if (e.key === "Escape") { escapePressed = true; return; }
    if (e.key === "Tab" && !escapePressed) {
      e.preventDefault();
      var s = el.code.selectionStart, t = el.code.selectionEnd;
      el.code.value = el.code.value.substring(0, s) + "    " + el.code.value.substring(t);
      el.code.selectionStart = el.code.selectionEnd = s + 4;
      updateGutter();
    }
    escapePressed = false;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
  }

  function setCode(value) {
    el.code.value = value;
    updateGutter();
  }

  function resetCode() {
    if (el.code.value === task.starterCode) { return; }
    if (window.confirm("Put the starter code back? Your changes in this task will be lost.")) {
      setCode(task.starterCode || "");
      clearResults();
    }
  }

  // ------------------------------------------------------------ results
  function clearResults() {
    el.verdict.hidden = true;
    el.verdict.className = "verdict";
    text(el.stdout, "");
    text(el.outputNote, "");
    el.error.hidden = true;
    el.next.hidden = true;
    clear(el.tests);
  }

  function setRunning(running) {
    el.runButton.disabled = running;
    el.stopButton.disabled = !running;
    el.resetButton.disabled = running;
  }

  function showVerdict(kind, message) {
    el.verdict.hidden = false;
    el.verdict.className = "verdict " + kind;
    text(el.verdict, message);
  }

  function describeStdin(stdin) {
    if (!stdin || stdin.length === 0) { return "no input"; }
    return "input: " + stdin.map(function (s) { return JSON.stringify(s); }).join(", ");
  }

  function renderPendingTests() {
    clear(el.tests);
    (task.tests || []).forEach(function (t, i) {
      var li = make("li", "test pending");
      li.id = "test-" + i;
      var head = make("div", "test-head");
      head.appendChild(make("span", "test-status", "…"));
      head.appendChild(make("span", "test-name", t.name));
      head.appendChild(make("span", "test-stdin", describeStdin(t.stdin)));
      li.appendChild(head);
      el.tests.appendChild(li);
    });
  }

  function renderTestResult(i, r) {
    var li = document.getElementById("test-" + i);
    if (!li) { return; }
    var status = li.querySelector(".test-status");
    var notRun = r.skipped || r.stopped;
    li.className = "test " + (notRun ? "skipped" : r.passed ? "pass" : "fail");
    text(status, notRun ? "–" : r.passed ? "✓" : "✗");
    status.setAttribute("aria-label", notRun ? "not run" : r.passed ? "passed" : "failed");
    if (notRun || r.passed) { return; }

    var why = make("div", "test-why");
    if (r.timedOut) {
      why.appendChild(make("p", null, Runner.timeoutMessage(r.timeoutMs)));
    } else if (r.error) {
      why.appendChild(make("p", null, "The program stopped with an error before it could finish: " + r.error.explanation));
    }

    var diff = make("div", "diff");
    var expectedCol = make("div", "diff-col");
    expectedCol.appendChild(make("h4", null, matchLabel(r.test.match)));
    expectedCol.appendChild(make("pre", null, r.test.expectedShown != null ? r.test.expectedShown : visible(r.test.expectedStdout)));
    var actualCol = make("div", "diff-col");
    actualCol.appendChild(make("h4", null, "Your program printed"));
    actualCol.appendChild(make("pre", null, visible(r.stdout)));
    diff.appendChild(expectedCol);
    diff.appendChild(actualCol);
    why.appendChild(diff);
    li.appendChild(why);
  }

  function matchLabel(match) {
    switch (match) {
      case "contains": return "Expected somewhere in the output";
      case "regex":    return "Expected pattern";
      case "trimmed":  return "Expected (ignoring spaces at the ends)";
      default:         return "Expected, exactly";
    }
  }

  // ------------------------------------------------------------ run
  var transcript = [];

  function run() {
    if (Runner.isRunning) { return; }
    clearResults();
    renderPendingTests();
    setRunning(true);
    transcript = [];
    if (Runner.status.phase !== "ready") {
      showVerdict("wait", "Waiting for Python to finish loading…");
    }
    var code = el.code.value;
    codeThisVisit[task.id] = code;
    var firstError = null;

    Tasks.runTests(task, code, {
      onStdout: function (i, chunk) {
        if (!transcript[i]) {
          transcript[i] = "";
          if (i === 0 && (task.tests || []).length === 1) { /* single test: no heading */ }
        }
        transcript[i] += chunk;
        renderTranscript();
      },
      onTest: function (i, r) {
        renderTestResult(i, r);
        if (r.error && !firstError) { firstError = r.error; }
        if (transcript[i] == null) { transcript[i] = r.stdout || ""; renderTranscript(); }
      }
    }).then(function (summary) {
      setRunning(false);
      if (summary.aborted) {
        showVerdict("neutral", "Stopped. Python is restarting so it is ready for your next run.");
        return;
      }
      if (firstError) {
        el.error.hidden = false;
        text(el.explanation, firstError.explanation);
        text(el.traceback, firstError.traceback || (firstError.type + ": " + firstError.message));
        el.details.open = false;
      }
      if (summary.passed === summary.total) {
        doneThisVisit[task.id] = true;
        renderNav();
        showVerdict("good", "All " + summary.total + " tests passed. Well done!");
        showNext();
      } else {
        var failed = summary.total - summary.passed;
        showVerdict("bad", summary.passed + " of " + summary.total + " tests passed. Look at the " +
          (failed === 1 ? "test that failed" : failed + " tests that failed") +
          " below: compare what was expected with what your program printed.");
      }
    }, function (err) {
      setRunning(false);
      showVerdict("bad", err.message);
    });
  }

  function renderTranscript() {
    var tests = task.tests || [];
    var parts = [];
    for (var i = 0; i < transcript.length; i++) {
      if (transcript[i] == null) { continue; }
      if (tests.length > 1) {
        parts.push("── Test " + (i + 1) + ": " + tests[i].name + " (" + describeStdin(tests[i].stdin) + ") ──\n");
      }
      parts.push(transcript[i]);
      if (transcript[i] && !/\n$/.test(transcript[i])) { parts.push("\n"); }
    }
    text(el.stdout, parts.join(""));
    text(el.outputNote, tests.length > 1 ? "one section for each test" : "");
  }

  function showNext() {
    var n = Tasks.neighbours(index, task.id);
    el.next.hidden = false;
    if (n.next) {
      el.nextLink.href = urlFor(n.next.id);
      text(el.nextLink, "Next task: " + n.next.title + " →");
    } else {
      el.nextLink.href = "index.html";
      text(el.nextLink, "That was the last task. Back to the hub →");
    }
  }

  // ------------------------------------------------------------ status
  Runner.onStatus(function (s) {
    el.statusDot.className = "dot " + s.phase;
    if (s.phase === "loading") { text(el.statusText, "Loading Python… the first time takes a few seconds."); }
    else if (s.phase === "ready") { text(el.statusText, "Python is ready."); }
    else if (s.phase === "failed") { text(el.statusText, "Python could not load. Reload the page, or tell your teacher."); }
    else { text(el.statusText, "Starting Python…"); }
  });

  // ------------------------------------------------------------ load
  function showLoadError(message) {
    text(el.taskTitle, "Could not load this task");
    clear(el.taskText);
    el.taskText.appendChild(make("p", null, message));
    var back = make("a", "btn outline", "Back to the task list");
    back.href = "practice-python.html";
    el.taskText.appendChild(back);
    el.runButton.disabled = true;
  }

  function openTask(id) {
    return Tasks.loadTask(id).then(function (t) {
      task = t;
      renderNav();
      renderBrief();
      setCode(codeThisVisit[task.id] != null ? codeThisVisit[task.id] : (task.starterCode || ""));
      clearResults();
      text(el.stdout, "Press Run to see what your program prints.");
      renderPendingTests();
    });
  }

  Tasks.loadIndex().then(function (idx) {
    index = idx;
    var wanted = taskIdFromUrl();
    var list = Tasks.flatList(index);
    var exists = list.some(function (e) { return e.id === wanted; });
    if (!exists) { wanted = list.length ? list[0].id : null; }
    if (!wanted) { showLoadError("There are no tasks in the list yet."); return; }
    return openTask(wanted);
  }).catch(function (err) {
    showLoadError(err.message + " Check that the site is running from a web server (python3 -m http.server), not opened as a file.");
  });

  el.hintButton.addEventListener("click", showHint);
  el.runButton.addEventListener("click", run);
  el.stopButton.addEventListener("click", function () { Runner.stop(); });
  el.resetButton.addEventListener("click", resetCode);
  el.code.addEventListener("keydown", editorKeydown);
  el.code.addEventListener("input", function () { updateGutter(); if (task) { codeThisVisit[task.id] = el.code.value; } });
  el.code.addEventListener("scroll", function () { el.gutter.scrollTop = el.code.scrollTop; });

  Runner.warmUp();
})();
