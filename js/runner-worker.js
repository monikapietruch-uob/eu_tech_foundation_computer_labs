/*
  js/runner-worker.js — the Web Worker that actually runs Python.

  It loads Pyodide (real CPython compiled for the browser) from
  vendor/pyodide/ — a copy of the official release shipped inside this repo,
  so the site never depends on an outside CDN (some networks block script
  downloads inside workers; the university network may too). Then it waits
  for "run" messages from js/runner.js. Nothing else in the project talks to
  this file directly; always go through runner.js.

  Why a worker and not the page itself: a student's infinite loop would
  freeze the whole tab if Python ran on the main thread. In a worker the
  page stays responsive, and runner.js can kill this worker and start a
  fresh one when the student presses Stop or the time limit is reached.
  A worker is also the only place a later stage can make a blocking
  network call from Python (needed for call_gpt in week 9).

  This is a MODULE worker (runner.js creates it with {type: "module"}),
  because Pyodide 314 refuses to start inside a classic worker. That is why
  it uses import() rather than importScripts().

  Messages this worker sends to runner.js:
    {type:"status", phase:"loading"|"ready"|"failed", detail?, message?, version?}
    {type:"stdout", text}   — a chunk of what the program printed
    {type:"stderr", text}   — a chunk written to stderr (warnings etc.)
    {type:"result", id, ok, error, truncated}
  Messages it receives:
    {type:"run", id, code, stdin:[...lines]}                 — a console program
    {type:"run", id, code, mode:"karel", world:{...}}        — a Karel program;
        the result then also carries initial, trace and final (see
        js/karel-api.py for the format)
*/
"use strict";

// The version we ship in vendor/pyodide/ (see vendor/pyodide/README.md).
// Used only for the loading message and a sanity check after load.
var PYODIDE_VERSION = "314.0.6";
// Resolved relative to this worker's own URL, so it works locally and on
// GitHub Pages (where the site lives under /<repo-name>/).
var PYODIDE_BASE = new URL("../vendor/pyodide/", self.location.href).href;

// Stop sending output after this much, so a print() inside an infinite loop
// cannot flood the page before the time limit kills the worker.
var MAX_OUTPUT_BYTES = 200 * 1024;

var pyodide = null;
var hubRun = null;          // the Python-side _hub_run function
var karelRun = null;        // the Python-side _hub_run_karel function (js/karel-api.py)
var outputBytes = 0;
var truncated = false;
var stdoutDecoder = new TextDecoder("utf-8");
var stderrDecoder = new TextDecoder("utf-8");

function post(message) {
  self.postMessage(message);
}

// Python code that runs once after Pyodide loads. It defines:
//   _hub_input  — replaces the built-in input() so it reads from a list of
//                 lines supplied by the caller, echoes the answer the way a
//                 terminal would, and raises EOFError with a clear message
//                 when the lines run out (instead of hanging).
//   _hub_run    — compiles and runs the student's program in a fresh
//                 namespace and returns a JSON result with a traceback that
//                 only shows the student's own lines, not Pyodide internals.
var PRELUDE = [
  "import sys, builtins, traceback, json, linecache",
  "",
  "_HUB_FILENAME = '<your program>'",
  "",
  "class _HubState:",
  "    stdin = []",
  "    stdin_total = 0",
  "",
  "def _hub_input(prompt=''):",
  "    sys.stdout.write(str(prompt))",
  "    sys.stdout.flush()",
  "    if not _HubState.stdin:",
  "        n = _HubState.stdin_total",
  "        if n == 0:",
  "            detail = 'This run had no input lines.'",
  "        else:",
  "            detail = 'This run had %d input line%s, and the program has already used them all.' % (n, '' if n == 1 else 's')",
  "        raise EOFError('The program asked for input, but there was no more input to give. ' + detail)",
  "    line = _HubState.stdin.pop(0)",
  "    sys.stdout.write(line + '\\n')",
  "    sys.stdout.flush()",
  "    return line",
  "",
  "def _hub_error(exc):",
  "    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == _HUB_FILENAME]",
  "    parts = []",
  "    if frames:",
  "        parts.append('Traceback (most recent call last):\\n')",
  "        parts.extend(traceback.format_list(frames))",
  "    parts.extend(traceback.format_exception_only(type(exc), exc))",
  "    line = frames[-1].lineno if frames else getattr(exc, 'lineno', None)",
  "    return {'type': type(exc).__name__, 'message': str(exc), 'line': line, 'traceback': ''.join(parts)}",
  "",
  "def _hub_run(code, stdin_json):",
  "    _HubState.stdin = list(json.loads(stdin_json))",
  "    _HubState.stdin_total = len(_HubState.stdin)",
  "    linecache.cache[_HUB_FILENAME] = (len(code), None, code.splitlines(True), _HUB_FILENAME)",
  "    builtins.input = _hub_input",
  "    result = {'ok': True, 'error': None}",
  "    namespace = {'__name__': '__main__', '__builtins__': builtins}",
  "    try:",
  "        compiled = compile(code, _HUB_FILENAME, 'exec')",
  "        exec(compiled, namespace)",
  "    except SystemExit:",
  "        pass",
  "    except SyntaxError as e:",
  "        result = {'ok': False, 'error': {'type': type(e).__name__, 'message': e.msg or str(e), 'line': e.lineno, 'traceback': ''.join(traceback.format_exception_only(type(e), e))}}",
  "    except BaseException as e:",
  "        result = {'ok': False, 'error': _hub_error(e)}",
  "    finally:",
  "        try:",
  "            sys.stdout.flush()",
  "            sys.stderr.flush()",
  "        except Exception:",
  "            pass",
  "    return json.dumps(result)",
  ""
].join("\n");

function sendOutput(type, decoder, buffer) {
  if (truncated) { return buffer.length; }
  outputBytes += buffer.length;
  if (outputBytes > MAX_OUTPUT_BYTES) {
    truncated = true;
    post({ type: type, text: decoder.decode(buffer) });
    post({ type: "stderr", text: "\n[Output stopped: the program printed more than 200 KB.]\n" });
    return buffer.length;
  }
  post({ type: type, text: decoder.decode(buffer, { stream: true }) });
  return buffer.length;
}

async function boot() {
  try {
    post({ type: "status", phase: "loading", detail: "Loading Python " + PYODIDE_VERSION });
    var mod = await import(PYODIDE_BASE + "pyodide.mjs");
    pyodide = await mod.loadPyodide({ indexURL: PYODIDE_BASE });
    pyodide.setStdout({ write: function (buf) { return sendOutput("stdout", stdoutDecoder, buf); } });
    pyodide.setStderr({ write: function (buf) { return sendOutput("stderr", stderrDecoder, buf); } });
    post({ type: "status", phase: "loading", detail: "Preparing the runner" });
    pyodide.runPython(PRELUDE);
    hubRun = pyodide.globals.get("_hub_run");
    // Karel lives in its own Python file so it stays readable.
    var karelSource = await (await fetch(new URL("karel-api.py", self.location.href))).text();
    pyodide.runPython(karelSource);
    karelRun = pyodide.globals.get("_hub_run_karel");
    if (pyodide.version !== PYODIDE_VERSION) {
      console.warn("Pyodide version mismatch: vendor/pyodide is " + pyodide.version + ", runner expects " + PYODIDE_VERSION);
    }
    post({ type: "status", phase: "ready", version: pyodide.version });
  } catch (err) {
    post({ type: "status", phase: "failed", message: String(err && err.message ? err.message : err) });
  }
}

self.onmessage = function (event) {
  var msg = event.data || {};
  if (msg.type !== "run") { return; }

  if (!hubRun) {
    post({ type: "result", id: msg.id, ok: false, truncated: false,
           error: { type: "PyodideLoadError", message: "Python is not ready yet.", line: null, traceback: "" } });
    return;
  }

  outputBytes = 0;
  truncated = false;
  var result;
  try {
    var json = msg.mode === "karel"
      ? karelRun(msg.code, JSON.stringify(msg.world || {}))
      : hubRun(msg.code, JSON.stringify(msg.stdin || []));
    result = JSON.parse(json);
  } catch (err) {
    // Only reached if something goes wrong inside the runner itself,
    // not inside the student's code (that is caught in Python).
    result = { ok: false, error: { type: "RunnerError", message: String(err && err.message ? err.message : err), line: null, traceback: "" } };
  }
  post({ type: "result", id: msg.id, ok: result.ok, error: result.error, truncated: truncated,
         initial: result.initial, trace: result.trace, final: result.final });
};

boot();
