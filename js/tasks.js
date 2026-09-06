/*
  js/tasks.js — loads tasks and checks a student's program against them.

  Tasks live as JSON files under tasks/ (see tasks/README.md). This file
  exposes a global object called Tasks with:

    Tasks.loadIndex()          -> Promise<index>   the list of tasks by week
    Tasks.loadTask(id)         -> Promise<task>    one task's full file
    Tasks.flatList(index)      -> [{id, file, title, week}] in teaching order
    Tasks.neighbours(index,id) -> {prev, next}     entries either side of a task
    Tasks.runTests(task, code, {onTest})
                               -> Promise<{passed, total, results, aborted}>
        Runs the program once per test case through Runner.runPython, each
        with that test's stdin lines, and compares the output using the
        test's "match" rule. onTest(i, result) is called as each finishes so
        the page can show progress. If the student presses Stop, the
        remaining tests are skipped and aborted is true.
    Tasks.compare(match, expected, actual) -> boolean

  It depends on js/runner.js (the Runner global) being loaded first.
*/
var Tasks = (function () {
  "use strict";

  // tasks/ folder, resolved relative to this script so it works on
  // GitHub Pages where the site lives under /<repo-name>/.
  var scriptUrl = (document.currentScript && document.currentScript.src) || "js/tasks.js";
  var TASKS_BASE = new URL("../tasks/", scriptUrl).href;

  var indexCache = null;
  var taskCache = {};

  function fetchJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) {
        throw new Error("Could not load " + url + " (" + response.status + ")");
      }
      return response.json();
    });
  }

  function loadIndex() {
    if (indexCache) { return Promise.resolve(indexCache); }
    return fetchJson(TASKS_BASE + "index.json").then(function (index) {
      indexCache = index;
      return index;
    });
  }

  function flatList(index) {
    var list = [];
    (index.weeks || []).forEach(function (week) {
      (week.tasks || []).forEach(function (entry) {
        list.push({ id: entry.id, file: entry.file, title: entry.title, week: week.week });
      });
    });
    return list;
  }

  function neighbours(index, id) {
    var list = flatList(index);
    var at = -1;
    list.forEach(function (entry, i) { if (entry.id === id) { at = i; } });
    return {
      prev: at > 0 ? list[at - 1] : null,
      next: at >= 0 && at < list.length - 1 ? list[at + 1] : null
    };
  }

  function loadTask(id) {
    if (taskCache[id]) { return Promise.resolve(taskCache[id]); }
    return loadIndex().then(function (index) {
      var entry = flatList(index).filter(function (e) { return e.id === id; })[0];
      if (!entry) { throw new Error("There is no task called " + id + "."); }
      return fetchJson(TASKS_BASE + entry.file);
    }).then(function (task) {
      taskCache[id] = task;
      return task;
    });
  }

  // Windows line endings -> normal ones, so a test written on one machine
  // behaves the same everywhere.
  function normaliseNewlines(s) {
    return String(s).replace(/\r\n/g, "\n");
  }

  function compare(match, expected, actual) {
    expected = normaliseNewlines(expected);
    actual = normaliseNewlines(actual);
    switch (match) {
      case "exact":    return actual === expected;
      case "trimmed":  return actual.trim() === expected.trim();
      case "contains": return actual.indexOf(expected) !== -1;
      case "regex":
        try { return new RegExp(expected, "m").test(actual); }
        catch (e) { return false; }
      default:
        return actual === expected;
    }
  }

  function runTests(task, code, options) {
    options = options || {};
    var tests = task.tests || [];
    var results = [];
    var aborted = false;

    function runOne(i) {
      if (i >= tests.length) { return Promise.resolve(); }
      var test = tests[i];
      if (aborted) {
        results.push({ test: test, skipped: true, passed: false });
        if (options.onTest) { options.onTest(i, results[i]); }
        return runOne(i + 1);
      }
      return Runner.runPython({
        code: code,
        stdin: test.stdin || [],
        onStdout: options.onStdout ? function (text) { options.onStdout(i, text); } : null
      }).then(function (run) {
        var result = {
          test: test,
          skipped: false,
          stdout: run.stdout,
          stderr: run.stderr,
          error: run.error,
          timedOut: run.timedOut,
          stopped: run.stopped,
          timeoutMs: run.timeoutMs,
          passed: false
        };
        if (run.stopped) {
          aborted = true;
        } else if (!run.error && !run.timedOut) {
          result.passed = compare(test.match || "exact", test.expectedStdout, run.stdout);
        }
        results.push(result);
        if (options.onTest) { options.onTest(i, result); }
        return runOne(i + 1);
      });
    }

    return runOne(0).then(function () {
      var passed = results.filter(function (r) { return r.passed; }).length;
      return { passed: passed, total: tests.length, results: results, aborted: aborted };
    });
  }

  return {
    loadIndex: loadIndex,
    loadTask: loadTask,
    flatList: flatList,
    neighbours: neighbours,
    runTests: runTests,
    compare: compare
  };
})();
