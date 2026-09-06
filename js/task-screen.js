/*
  js/task-screen.js — the Python side of the task page (practice-python.html).

  The task list, brief, hints, verdict banner, reflections and Next link
  are handled by js/task-shell.js; this file provides what is specific to
  console and karel tasks: the code editor (Tab inserts spaces, line
  numbers in the gutter), Run/Stop/Reset, and — on Run — either every test
  case with expected output beside actual output (console), or Karel's
  world with playback (karel).

  For "karel" tasks the right-hand column shows Karel's world instead of
  test results: Run sends the program to js/karel-api.py (inside the
  worker) once per world, gets back a trace of every action, plays it on
  the canvas with js/karel-play.js, and checks the final world with
  js/karel-check.js. Tasks with several worlds are treated like tests:
  every world must pass.

  Code the student types is saved in this browser by js/progress.js (a
  moment after they stop typing) and restored when the task is reopened.
*/
(function () {
  "use strict";

  var el = {};
  ["code", "gutter", "runButton", "stopButton", "resetButton",
   "statusDot", "statusText", "stdout", "outputNote", "error", "explanation",
   "details", "traceback", "tests", "testsTitle", "testsIntro",
   "karelPanel", "karelCanvas", "karelWorldName", "karelGoal", "karelSpeed",
   "karelPlayPause", "karelStep", "karelReplay", "karelCounter"]
    .forEach(function (id) { el[id] = document.getElementById(id); });

  var task = null;             // the open task (also TaskShell.task)
  var codeThisVisit = {};      // taskId -> code, so switching tasks does not lose work

  // Karel: created the first time a karel task opens
  var karel = { renderer: null, player: null, runs: [], playing: -1 };

  // ------------------------------------------------------------ helpers
  var text = TaskShell.text, clear = TaskShell.clear, make = TaskShell.make;
  var showVerdict = TaskShell.showVerdict;

  // Show text such as "4 + 5 = 9\n" with the invisible characters visible,
  // so a missing newline or extra space is something the student can see.
  function visible(s) {
    if (s === "" || s == null) { return "(nothing)"; }
    return String(s).replace(/\r/g, "").replace(/\n/g, "↵\n");
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
      codeThisVisit[task.id] = task.starterCode || "";
      Progress.saveCode(task.id, task, task.starterCode || "");
      Progress.flushCode();
      clearResults();
    }
  }

  // ------------------------------------------------------------ results
  function clearResults() {
    TaskShell.clearVerdict();
    text(el.stdout, "");
    text(el.outputNote, "");
    el.error.hidden = true;
    clear(el.tests);
  }

  function setRunning(running) {
    el.runButton.disabled = running;
    el.stopButton.disabled = !running;
    el.resetButton.disabled = running;
  }
  // While Karel is being played back, the program has finished but Stop
  // still makes sense (it pauses playback), so keep it enabled then.

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

  function isKarel() { return task && task.type === "karel"; }
  // "ai" tasks are console tasks that may call call_gpt(); same screen.

  function run() {
    if (Runner.isRunning) { return; }
    if (isKarel()) { runKarel(); return; }
    clearResults();
    renderPendingTests();
    setRunning(true);
    transcript = [];
    if (Runner.status.phase !== "ready") {
      showVerdict("wait", "Waiting for Python to finish loading…");
    }
    var code = el.code.value;
    codeThisVisit[task.id] = code;
    Progress.recordAttempt(task.id, task);
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
        showVerdict("good", "All " + summary.total + " tests passed. Well done!");
        taskPassed();
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

  function taskPassed() {
    TaskShell.taskPassed();
  }

  // ------------------------------------------------------------ status
  Runner.onStatus(function (s) {
    el.statusDot.className = "dot " + s.phase;
    if (s.phase === "loading") { text(el.statusText, "Loading Python… the first time takes a few seconds."); }
    else if (s.phase === "ready") { text(el.statusText, "Python is ready."); }
    else if (s.phase === "failed") { text(el.statusText, "Python could not load. Reload the page, or tell your teacher."); }
    else { text(el.statusText, "Starting Python…"); }
  });

  // ------------------------------------------------------------ open a task
  function renderTask(t) {
    task = t;
    var saved = Progress.get(task.id);
    var restored = codeThisVisit[task.id] != null ? codeThisVisit[task.id]
                 : (saved && saved.lastCode != null) ? saved.lastCode
                 : (task.starterCode || "");
    setCode(restored);
    clearResults();
    if (isKarel()) { setupKarel(); }
    else {
      el.karelPanel.hidden = true;
      text(el.testsTitle, "Tests");
      text(el.testsIntro, "Each test runs your whole program once. The task is complete when every test passes.");
      text(el.stdout, "Press Run to see what your program prints.");
      renderPendingTests();
    }
  }

  // ------------------------------------------------------------ karel
  function karelWorlds() {
    if (task.worlds && task.worlds.length) { return task.worlds; }
    return [{ name: "Karel's world", world: task.world, goal: task.goal }];
  }

  function ensureKarel() {
    if (karel.renderer) { return; }
    karel.renderer = new KarelRenderer(el.karelCanvas);
    karel.player = new KarelPlayer(karel.renderer);
    karel.player.onUpdate(function (info) {
      var total = info.total;
      text(el.karelCounter, total ? "Step " + info.position + " of " + total + (info.action ? " · " + info.action.replace("_", " ") : "") : "");
      text(el.karelPlayPause, info.playing ? "Pause" : "Play");
      el.karelStep.disabled = info.position >= total;
      el.karelPlayPause.disabled = info.position >= total;
      el.karelReplay.disabled = total === 0;
    });
    karel.player.onDone(function () {
      if (!Runner.isRunning) { el.stopButton.disabled = true; }
      text(el.karelPlayPause, "Play");
      el.karelPlayPause.disabled = true;
      el.karelStep.disabled = true;
      karelFinishedPlaying();
    });
    el.karelSpeed.addEventListener("change", function () { karel.player.setSpeed(el.karelSpeed.value); });
    el.karelPlayPause.addEventListener("click", function () {
      if (karel.player.playing) { karel.player.pause(); text(el.karelPlayPause, "Play"); }
      else { text(el.karelPlayPause, "Pause"); karel.player.play(); }
    });
    el.karelStep.addEventListener("click", function () { karel.player.step(); text(el.karelPlayPause, "Play"); });
    el.karelReplay.addEventListener("click", function () {
      karel.player.restart();
      text(el.karelPlayPause, "Pause");
      karel.player.play();
    });
    el.karelGoal.addEventListener("change", function () { karel.renderer.setShowGoal(el.karelGoal.checked); });
  }

  function setupKarel() {
    ensureKarel();
    el.karelPanel.hidden = false;
    var worlds = karelWorlds();
    text(el.testsTitle, worlds.length > 1 ? "Worlds" : "Result");
    text(el.testsIntro, worlds.length > 1
      ? "Your program runs once in each world. The task is complete when it works in all of them."
      : "The task is complete when the world matches the goal.");
    text(el.stdout, "Karel does not print anything unless you use print().");
    karel.runs = [];
    karel.playing = -1;
    showKarelWorld(0, null);
    text(el.karelCounter, "");
    el.karelPlayPause.disabled = true; el.karelStep.disabled = true; el.karelReplay.disabled = true;
    renderPendingWorlds();
  }

  // Draw world i at its start (run === null) or load a run for playback.
  function showKarelWorld(i, run) {
    var w = karelWorlds()[i];
    karel.playing = i;
    text(el.karelWorldName, w.name || "Karel's world");
    karel.renderer.setWorld(w.world, w.goal);
    karel.renderer.setShowGoal(el.karelGoal.checked);
    if (run) {
      karel.player.setSpeed(el.karelSpeed.value);
      karel.player.load(run.result.initial, run.playTrace);
    } else {
      karel.player.load(KarelRenderer.initialState(w.world), []);
    }
  }

  function renderPendingWorlds() {
    clear(el.tests);
    var worlds = karelWorlds();
    if (worlds.length < 2) { return; }
    worlds.forEach(function (w, i) {
      var li = make("li", "test pending");
      li.id = "test-" + i;
      var head = make("div", "test-head");
      head.appendChild(make("span", "test-status", "…"));
      head.appendChild(make("span", "test-name", w.name || ("World " + (i + 1))));
      head.appendChild(make("span", "test-stdin", w.world.cols + " × " + w.world.rows));
      li.appendChild(head);
      el.tests.appendChild(li);
    });
  }

  function renderWorldResult(i, run) {
    var li = document.getElementById("test-" + i);
    if (!li) { return; }
    var status = li.querySelector(".test-status");
    var notRun = run.result.stopped;
    li.className = "test " + (notRun ? "skipped" : run.passed ? "pass" : "fail");
    text(status, notRun ? "–" : run.passed ? "✓" : "✗");
    if (notRun) { return; }
    var why = make("div", "test-why");
    (run.messages || []).forEach(function (m) { why.appendChild(make("p", null, m)); });
    var watch = make("button", "btn outline small-btn", "Watch this world");
    watch.type = "button";
    watch.addEventListener("click", function () {
      showKarelWorld(i, run);
      text(el.karelPlayPause, "Pause");
      karel.player.play();
      el.karelPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    why.appendChild(watch);
    li.appendChild(why);
  }

  // Runs the program in every world, then plays the first world that
  // failed (or the first world, if all passed). The verdict appears when
  // playback finishes, so the student sees Karel reach the wall before
  // reading that Karel hit a wall.
  function runKarel() {
    var worlds = karelWorlds();
    clearResults();
    renderPendingWorlds();
    setRunning(true);
    karel.runs = [];
    if (Runner.status.phase !== "ready") {
      showVerdict("wait", "Waiting for Python to finish loading…");
    }
    var code = el.code.value;
    codeThisVisit[task.id] = code;
    Progress.recordAttempt(task.id, task);

    function runWorld(i) {
      if (i >= worlds.length) { return Promise.resolve(); }
      var w = worlds[i];
      return Runner.runKarel({ code: code, world: w.world }).then(function (result) {
        var run = { result: result, passed: false, messages: [], playTrace: result.trace || [] };
        if (result.stopped) {
          run.messages = ["Stopped."];
        } else if (result.timedOut) {
          run.messages = [Runner.timeoutMessage(result.timeoutMs)];
        } else if (result.error) {
          run.messages = [result.error.explanation];
          if (result.error.stepLimit) {
            // 10,000 steps is far too many to watch; the first 150 show the loop.
            run.playTrace = run.playTrace.slice(0, 150);
            run.truncated = true;
          }
        } else if (result.final) {
          var check = KarelCheck.compare(w.goal, result.final);
          run.passed = check.passed;
          run.messages = check.messages;
        }
        karel.runs.push(run);
        renderWorldResult(i, run);
        if (result.stopped) { return; }          // skip the rest
        return runWorld(i + 1);
      });
    }

    runWorld(0).then(function () {
      setRunning(false);
      var runs = karel.runs;
      if (!runs.length || runs[runs.length - 1].result.stopped) {
        showVerdict("neutral", "Stopped. Python is restarting so it is ready for your next run.");
        for (var k = runs.length; k < worlds.length; k++) { renderWorldResult(k, { result: { stopped: true } }); }
        return;
      }
      var toPlay = 0;
      for (var i = 0; i < runs.length; i++) { if (!runs[i].passed) { toPlay = i; break; } }
      showKarelWorld(toPlay, runs[toPlay]);
      var trace = runs[toPlay].playTrace;
      if (trace.length === 0) {
        karelFinishedPlaying();
      } else {
        showVerdict("wait", "Watching Karel… (" + trace.length + " steps" + (runs[toPlay].truncated ? ", showing the first 150" : "") + ")");
        text(el.karelPlayPause, "Pause");
        el.stopButton.disabled = false;          // Stop pauses the playback
        karel.player.play();
      }
    }, function (err) {
      setRunning(false);
      showVerdict("bad", err.message);
    });
  }

  // Called by the player when the last step has been shown.
  function karelFinishedPlaying() {
    var runs = karel.runs;
    if (!runs.length) { return; }
    var i = karel.playing;
    var run = runs[i];
    if (!run) { return; }
    var worlds = karelWorlds();
    var allPassed = runs.length === worlds.length && runs.every(function (r) { return r.passed; });

    // print() output and errors for the world just watched
    var out = run.result.stdout || "";
    text(el.stdout, out || "Karel does not print anything unless you use print().");
    if (run.result.error) {
      el.error.hidden = false;
      text(el.explanation, run.result.error.explanation);
      text(el.traceback, run.result.error.traceback || (run.result.error.type + ": " + run.result.error.message));
      el.details.open = false;
    } else {
      el.error.hidden = true;
    }

    if (allPassed) {
      showVerdict("good", worlds.length > 2 ? "Karel did the job in all " + worlds.length + " worlds. Well done!"
        : worlds.length === 2 ? "Karel did the job in both worlds. Well done!" : "Karel did the job. Well done!");
      taskPassed();
    } else if (run.passed) {
      showVerdict("bad", "This world is fine, but another one is not. See the list below.");
    } else {
      var head = worlds.length > 1 ? (worlds[i].name || "World " + (i + 1)) + ": " : "";
      showVerdict("bad", head + (run.messages[0] || "Not there yet.") + (run.messages.length > 1 ? " " + run.messages.slice(1).join(" ") : ""));
    }
  }

  el.runButton.addEventListener("click", run);
  el.stopButton.addEventListener("click", function () {
    if (Runner.isRunning) { Runner.stop(); }
    else if (karel.player && karel.player.playing) { karel.player.pause(); text(el.karelPlayPause, "Play"); }
  });
  el.resetButton.addEventListener("click", resetCode);
  el.code.addEventListener("keydown", editorKeydown);
  el.code.addEventListener("input", function () {
    updateGutter();
    if (task) {
      codeThisVisit[task.id] = el.code.value;
      Progress.saveCode(task.id, task, el.code.value);
    }
  });
  el.code.addEventListener("scroll", function () { el.gutter.scrollTop = el.code.scrollTop; });

  // practice-python.html shows console + karel; practice-ai.html sets
  // data-task-types="ai" on <body> and reuses everything here.
  var pageTypes = (document.body.getAttribute("data-task-types") || "console karel").split(/\s+/);
  TaskShell.init({ types: pageTypes, render: renderTask });
  Runner.warmUp();
})();
