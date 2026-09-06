/*
  js/runner.js — the main-thread side of the Python runner.

  This is the ONLY file the rest of the site uses to run Python. It exposes
  a global object called Runner with:

    Runner.runPython({ code, stdin, timeoutMs, onStdout, onStderr })
        -> Promise<{ stdout, stderr, error, timedOut, stopped, truncated, durationMs }>
      code      the student's program (string)
      stdin     lines that input() will read, in order (array of strings)
      timeoutMs how long to allow, default 10000
      onStdout / onStderr  optional callbacks that receive output as it arrives
      error     null, or { type, message, line, traceback, explanation }
                where explanation is a plain-English sentence for the student

    Runner.runKarel({ code, world, timeoutMs, onStdout })
        -> the same result plus { initial, trace, final } from js/karel-api.py
      world     a Karel world object (see tasks/README.md)

    Runner.setAi({ proxyUrl, classCode, clientId })
                           where call_gpt() sends prompts (practice-ai.html sets this)
    Runner.onAiCall(fn)    fn({prompt, ok, text, error, ms}) after every call_gpt()

    Runner.stop()          kill the running program and start a fresh worker
    Runner.warmUp()        start loading Python now (call it on page load)
    Runner.onStatus(fn)    fn({phase, detail, message}) as loading progresses;
                           phase is "idle", "loading", "ready" or "failed"
    Runner.explainError(error) -> string   (also used internally)

  It owns the Web Worker (js/runner-worker.js): creating it, waiting for
  Pyodide to load, sending the program, collecting output, enforcing the
  time limit, and terminating + replacing the worker on Stop or timeout.
*/
var Runner = (function () {
  "use strict";

  var DEFAULT_TIMEOUT_MS = 10000;

  // Resolve the worker's URL relative to this script, whatever page loads it.
  var scriptUrl = (document.currentScript && document.currentScript.src) || "js/runner.js";
  // Carry the ?v= cache-busting tag from this script's URL to the worker's.
  var version = (/[?&]v=([^&]+)/.exec(scriptUrl) || [])[1];
  var WORKER_URL = new URL("runner-worker.js" + (version ? "?v=" + version : ""), scriptUrl).href;

  var worker = null;
  var status = { phase: "idle", detail: "", message: "" };
  var readyPromise = null;
  var readyResolve = null;
  var job = null;               // the run in progress, or null
  var nextJobId = 1;
  var statusListeners = [];
  var aiConfig = { proxyUrl: "", classCode: "", clientId: "" };
  var aiListeners = [];

  function setStatus(next) {
    status = next;
    statusListeners.forEach(function (fn) {
      try { fn(status); } catch (e) { /* a listener error must not break the runner */ }
    });
  }

  function spawn() {
    // A module worker: Pyodide 314 will not start inside a classic one.
    worker = new Worker(WORKER_URL, { type: "module" });
    readyPromise = new Promise(function (resolve) { readyResolve = resolve; });
    setStatus({ phase: "loading", detail: "Starting", message: "" });

    worker.onmessage = function (event) {
      var msg = event.data || {};
      if (msg.type === "status") {
        if (msg.phase === "ready") {
          setStatus({ phase: "ready", detail: "Python " + (msg.version || "") , message: "" });
          readyResolve(true);
        } else if (msg.phase === "failed") {
          setStatus({ phase: "failed", detail: "", message: msg.message || "unknown error" });
          readyResolve(false);
        } else {
          setStatus({ phase: "loading", detail: msg.detail || "", message: "" });
        }
        return;
      }
      if (msg.type === "ai") {
        aiListeners.forEach(function (fn) { try { fn(msg); } catch (e) { /* ignore */ } });
        return;
      }
      if (!job) { return; }
      if (msg.type === "stdout") {
        job.stdout.push(msg.text);
        if (job.onStdout) { job.onStdout(msg.text); }
      } else if (msg.type === "stderr") {
        job.stderr.push(msg.text);
        if (job.onStderr) { job.onStderr(msg.text); }
      } else if (msg.type === "result" && msg.id === job.id) {
        finish({ error: msg.error || null, truncated: !!msg.truncated,
                 initial: msg.initial, trace: msg.trace, final: msg.final });
      }
    };

    worker.onerror = function (event) {
      // The worker script itself failed (for example the CDN is blocked).
      setStatus({ phase: "failed", detail: "", message: event.message || "The Python worker could not start." });
      readyResolve(false);
      if (job) {
        finish({ error: { type: "PyodideLoadError", message: event.message || "worker error", line: null, traceback: "" } });
      }
    };
  }

  function replaceWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    spawn();
  }

  // Ends the current job and resolves its promise. extra may contain
  // error, timedOut, stopped, truncated.
  function finish(extra) {
    if (!job) { return; }
    var done = job;
    job = null;
    clearTimeout(done.timer);
    var error = extra.error || null;
    if (error && !error.explanation) {
      error.explanation = explainError(error);
    }
    done.resolve({
      initial: extra.initial || null,
      trace: extra.trace || null,
      final: extra.final || null,
      timeoutMs: done.timeoutMs,
      stdout: done.stdout.join(""),
      stderr: done.stderr.join(""),
      error: error,
      timedOut: !!extra.timedOut,
      stopped: !!extra.stopped,
      truncated: !!extra.truncated,
      durationMs: Date.now() - done.startedAt
    });
  }

  function warmUp() {
    if (!worker) { spawn(); }
    return readyPromise;
  }

  // Shared by runPython and runKarel: payload is what the worker receives.
  function startJob(payload, options) {
    options = options || {};
    var timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

    if (job) {
      return Promise.reject(new Error("A program is already running. Press Stop first."));
    }

    return new Promise(function (resolve) {
      job = {
        id: nextJobId++,
        resolve: resolve,
        stdout: [],
        stderr: [],
        onStdout: options.onStdout || null,
        onStderr: options.onStderr || null,
        timer: null,
        timeoutMs: timeoutMs,
        startedAt: Date.now()
      };
      var thisJob = job;

      warmUp().then(function (ok) {
        if (job !== thisJob) { return; }        // stopped while loading
        if (!ok) {
          finish({ error: { type: "PyodideLoadError", message: status.message, line: null, traceback: "" } });
          return;
        }
        thisJob.startedAt = Date.now();          // time the program, not the download
        thisJob.timer = setTimeout(function () {
          if (job !== thisJob) { return; }
          replaceWorker();                       // the only way to interrupt Python
          finish({ timedOut: true });
        }, timeoutMs);
        payload.type = "run";
        payload.id = thisJob.id;
        worker.postMessage(payload);
      });
    });
  }

  function runPython(options) {
    options = options || {};
    return startJob({
      code: String(options.code || ""),
      stdin: Array.isArray(options.stdin) ? options.stdin.map(String) : []
    }, options);
  }

  function runKarel(options) {
    options = options || {};
    return startJob({
      code: String(options.code || ""),
      stdin: [],
      mode: "karel",
      world: options.world || {}
    }, options);
  }

  function stop() {
    if (!job) { return false; }
    replaceWorker();
    finish({ stopped: true });
    return true;
  }

  function setAi(config) {
    config = config || {};
    Object.keys(aiConfig).forEach(function (k) { if (config[k] != null) { aiConfig[k] = String(config[k]); } });
    if (worker) { worker.postMessage({ type: "config", ai: aiConfig }); }
  }

  function onAiCall(fn) { aiListeners.push(fn); }

  function onStatus(fn) {
    statusListeners.push(fn);
    try { fn(status); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------
  // Plain-English explanations. One short paragraph a beginner can act on,
  // shown above the real traceback (which the page keeps visible, collapsed).
  // ---------------------------------------------------------------------
  function q(s) { return "'" + s + "'"; }

  // Student-friendly names for Python's type names.
  function typeName(t) {
    var names = {
      str: "text (str)", int: "a whole number (int)", float: "a decimal number (float)",
      bool: "True/False (bool)", list: "a list", dict: "a dictionary (dict)",
      tuple: "a tuple", NoneType: "None (nothing)", function: "a function", set: "a set"
    };
    return names[t] || ("a " + t);
  }

  function lineRef(error, capital) {
    if (error.line == null) { return ""; }
    return (capital ? "On line " : "on line ") + error.line;
  }

  function suggestion(message) {
    var m = /Did you mean: '([^']+)'\?/.exec(message);
    return m ? " Python thinks you may mean " + q(m[1]) + "." : "";
  }

  function explainError(error) {
    if (!error) { return ""; }
    var type = error.type || "";
    var msg = error.message || "";
    var line = error.line;
    var L = line != null ? "Line " + line + ": " : "";
    var m;

    if (type === "PyodideLoadError") {
      return "Python could not load in this browser. Check your internet connection and reload the page. If it still does not work, tell your teacher.";
    }
    if (type === "AIError") {
      // Already a full sentence, from js/ai-api.py or the proxy.
      return L + msg;
    }
    if (type === "KarelError") {
      // Already written for a beginner, in js/karel-api.py.
      return L + msg;
    }
    if (type === "RunnerError") {
      return "Something went wrong inside the runner, not in your program. Reload the page and try again. If it happens again, tell your teacher.";
    }

    if (type === "IndentationError" || type === "TabError") {
      if (type === "TabError" || /inconsistent use of tabs/.test(msg)) {
        return L + "this line mixes tabs and spaces. Use only spaces: 4 spaces for each level of indentation.";
      }
      if (/expected an indented block/.test(msg)) {
        return L + "this line should be indented. After a line that ends with a colon (:), the next line must start with 4 spaces.";
      }
      if (/unexpected indent/.test(msg)) {
        return L + "this line has extra spaces at the start. Only indent lines that belong inside an if, for, while or def block.";
      }
      if (/unindent does not match/.test(msg)) {
        return L + "the spaces at the start of this line do not match the lines around it. Every line in the same block needs the same number of spaces.";
      }
      return L + "the indentation (spaces at the start of the line) is wrong. Use 4 spaces for each level.";
    }

    if (type === "SyntaxError") {
      if (/was never closed/.test(msg)) {
        return L + "a bracket or quote was opened here but never closed. Add the matching closing bracket or quote.";
      }
      if (/unterminated string|EOL while scanning string/.test(msg)) {
        return L + "a string (text in quotes) starts here but does not end. Add the closing quote.";
      }
      if (/Missing parentheses in call to 'print'/.test(msg)) {
        return L + "print needs round brackets. Write print(\"hello\"), not print \"hello\".";
      }
      if (/expected ':'/.test(msg)) {
        return L + "this line needs a colon (:) at the end. Lines that start with if, elif, else, for, while or def must end with a colon.";
      }
      if (/Maybe you meant '=='/.test(msg)) {
        return L + "you used = (which puts a value in a variable) where Python expected == (which compares two values).";
      }
      if (/Perhaps you forgot a comma/.test(msg)) {
        return L + "there may be a missing comma between two values on this line.";
      }
      if (/unmatched '\)'|unmatched '\]'|unmatched '}'/.test(msg)) {
        return L + "there is a closing bracket here with no opening bracket to match it. Remove it, or add the opening bracket.";
      }
      if (/cannot assign to|invalid syntax\. Maybe you meant/.test(msg)) {
        return L + "Python cannot put a value into this. The name on the left of = must be a variable name, with no spaces, quotes or brackets.";
      }
      if (/unexpected EOF|unexpected end of file/.test(msg)) {
        return "Your program ends too early. Something is not finished — a bracket, a quote or a block after a colon.";
      }
      return L + "Python cannot read this line. Check it for a missing bracket, quote or colon, and check the line above it too.";
    }

    if (type === "NameError" || type === "UnboundLocalError") {
      m = /name '([^']+)' is not defined/.exec(msg);
      if (type === "UnboundLocalError" || /local variable|cannot access local/.test(msg)) {
        m = m || /variable '([^']+)'/.exec(msg);
        return L + "the variable " + (m ? q(m[1]) : "") + " is used inside a function before it is given a value there. Give it a value first, or pass it in as a parameter.";
      }
      if (m) {
        return L + "Python does not know the name " + q(m[1]) + ". Did you spell it differently when you created it? Remember to create a variable before you use it." + suggestion(msg);
      }
      return L + "Python does not know a name used on this line. Check the spelling, and make sure the variable or function is created before this line.";
    }

    if (type === "TypeError") {
      if (/can only concatenate str|must be str, not/.test(msg)) {
        return L + "you are trying to join text and a number with +. If you want to build a sentence, change the number into text with str(), for example \"Age: \" + str(age). If you want to do maths, the text must become a number first: int(age).";
      }
      m = /unsupported operand type\(s\) for ([^:]+): '([^']+)' and '([^']+)'/.exec(msg);
      if (m) {
        if ((m[2] === "str") !== (m[3] === "str")) {
          return L + "you are trying to do maths with text and a number. input() always gives text. If the text is a number, change it with int() first, for example: age = int(input(\"Age? \")).";
        }
        return L + "the operator " + m[1] + " does not work between " + typeName(m[2]) + " and " + typeName(m[3]) + ". Check what type each value is.";
      }
      m = /'([^']+)' not supported between instances of '([^']+)' and '([^']+)'/.exec(msg);
      if (m) {
        return L + "you are comparing " + typeName(m[2]) + " with " + typeName(m[3]) + ". You can only compare values of the same kind. If one is text from input(), change it with int() first.";
      }
      m = /'([^']+)' object is not callable/.exec(msg);
      if (m) {
        return L + "you wrote round brackets () after something that is " + typeName(m[1]) + ", not a function. Did you give a variable the same name as a function, for example print = 5?";
      }
      m = /'([^']+)' object is not subscriptable/.exec(msg);
      if (m) {
        return L + "you used square brackets [] on " + typeName(m[1]) + ". Only lists, strings and dictionaries can be used with [].";
      }
      m = /'([^']+)' object is not iterable/.exec(msg);
      if (m) {
        return L + "you tried to loop over " + typeName(m[1]) + ". A for loop needs a list, a string or range(). To count, write: for i in range(n).";
      }
      m = /(\w+)\(\) takes (\d+) positional arguments? but (\d+) (?:was|were) given/.exec(msg);
      if (m) {
        return L + "the function " + m[1] + "() needs " + m[2] + " value(s) but you gave it " + m[3] + ". Check the values inside the brackets.";
      }
      m = /(\w+)\(\) missing (\d+) required positional argument/.exec(msg);
      if (m) {
        return L + "the function " + m[1] + "() needs " + m[2] + " more value(s) inside its brackets when you call it.";
      }
      if (/argument must be a string|object cannot be interpreted as an integer/.test(msg)) {
        return L + "a function on this line was given a value of the wrong type. Check whether it needs text (str) or a whole number (int).";
      }
      return L + "a value has the wrong type for what you are doing with it. Check whether each value is text (str), a whole number (int) or a decimal (float).";
    }

    if (type === "ValueError") {
      m = /invalid literal for int\(\) with base 10: '([^']*)'/.exec(msg);
      if (m) {
        return L + "int() cannot change " + q(m[1]) + " into a whole number, because it is not a number. Check the value you gave to int(), or what the user typed.";
      }
      m = /could not convert string to float: '([^']*)'/.exec(msg);
      if (m) {
        return L + "float() cannot change " + q(m[1]) + " into a number. Check the value you gave to float().";
      }
      if (/not in list/.test(msg)) {
        return L + "you asked for the position of a value that is not in the list.";
      }
      if (/not enough values to unpack|too many values to unpack/.test(msg)) {
        return L + "the number of variables on the left of = does not match the number of values on the right.";
      }
      return L + "a value here is the right type, but Python cannot use it in this way. Read the error message below for the exact value.";
    }

    if (type === "IndexError") {
      m = /(list|string|tuple) index out of range/.exec(msg);
      var what = m ? m[1] : "list";
      return L + "you asked for a position in the " + what + " that does not exist. The first position is 0, and the last position is one less than the length.";
    }

    if (type === "KeyError") {
      return L + "the dictionary has no key called " + msg + ". Check the spelling of the key, or add it to the dictionary first.";
    }

    if (type === "ZeroDivisionError") {
      return L + "your program divides by zero. That is not possible in maths or in Python. Check the value you are dividing by — it may be 0 when you did not expect it.";
    }

    if (type === "AttributeError") {
      m = /'([^']+)' object has no attribute '([^']+)'/.exec(msg);
      if (m) {
        return L + typeName(m[1]) + " does not have anything called " + q(m[2]) + ". Check the spelling, or check what type the value really is." + suggestion(msg);
      }
      m = /module '([^']+)' has no attribute '([^']+)'/.exec(msg);
      if (m) {
        return L + "the module " + q(m[1]) + " has nothing called " + q(m[2]) + ". Check the spelling." + suggestion(msg);
      }
      return L + "you are using something that this value does not have. Check the spelling after the dot." + suggestion(msg);
    }

    if (type === "EOFError") {
      return L + msg + " Add another input line, or remove the extra input() call.";
    }

    if (type === "RecursionError") {
      return L + "a function calls itself again and again without stopping. Check the condition that should make it stop.";
    }

    if (type === "ModuleNotFoundError" || type === "ImportError") {
      m = /No module named '([^']+)'/.exec(msg);
      return L + "Python cannot find a module called " + (m ? q(m[1]) : "that") + ". Check the spelling. Only Python's built-in modules (like math and random) are available here.";
    }

    if (type === "KeyboardInterrupt") {
      return "The program was interrupted.";
    }

    return L + "your program stopped because of an error called " + type + ". Read the message below the line — it often says what went wrong.";
  }

  return {
    runPython: runPython,
    runKarel: runKarel,
    stop: stop,
    setAi: setAi,
    onAiCall: onAiCall,
    warmUp: warmUp,
    onStatus: onStatus,
    explainError: explainError,
    get status() { return status; },
    get isRunning() { return job !== null; },
    timeoutMessage: function (ms) {
      var seconds = Math.round((typeof ms === "number" ? ms : DEFAULT_TIMEOUT_MS) / 1000);
      return "Your program is still running after " + seconds + " seconds. This usually means a loop that never stops. Check the condition in your while loop.";
    }
  };
})();
