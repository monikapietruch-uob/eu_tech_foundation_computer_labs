# vendor/pyodide

A copy of the official **Pyodide 314.0.6** browser build (CPython 3.14
compiled to WebAssembly), shipped inside this repo so the practice site
does not depend on any outside CDN. `js/runner-worker.js` loads it from
here.

Only the files the browser needs are kept (about 13.5 MB):

| file | what it is |
|---|---|
| `pyodide.js` | the loader — defines `loadPyodide()` for classic scripts / `importScripts` |
| `pyodide.mjs` | the same loader as an ES module |
| `pyodide.asm.mjs` | the JavaScript half of the runtime |
| `pyodide.asm.wasm` | the compiled CPython interpreter (the big one) |
| `python_stdlib.zip` | Python's standard library |
| `pyodide-lock.json` | the package index Pyodide reads at start-up |

Source: the `pyodide-core-314.0.6.tar.bz2` asset on
https://github.com/pyodide/pyodide/releases/tag/314.0.6

## To upgrade

1. Download the new `pyodide-core-<version>.tar.bz2` from the releases page.
2. Replace the six files above with the ones from the archive.
3. Change `PYODIDE_VERSION` in `js/runner-worker.js`.
4. Open `dev/runner-test.html` and run the presets.

Do not edit these files. They are third-party code under the Mozilla
Public License 2.0 (https://github.com/pyodide/pyodide/blob/main/LICENSE).
