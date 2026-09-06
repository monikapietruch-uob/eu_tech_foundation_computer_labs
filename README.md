# EU Foundation — Tech Practice Hub

A practice website for foundation-year students at the University of
Bedfordshire (FYU 028-0 Academic Skills Foundation, TECH pathway). Students
practise the words and ideas from class by writing real code in the
browser: Python and a Karel-style robot in weeks 2–4, how the web works in
weeks 6–8, and a program that calls an AI in week 9.

Live site: **https://monikapietruch-uob.github.io/eu_tech_foundation_computer_labs/**

Everything runs in the student's browser. Python is real CPython (Pyodide,
shipped inside this repo under `vendor/`) running in a Web Worker. Nothing
is installed, nothing is sent to a server, and there are no accounts:
progress and reflections are saved in the browser's own storage. The one
exception is the week 9 AI task, which talks to a small proxy in
`worker/` that holds the API key.

## Running it locally

The site is plain HTML, CSS and JavaScript: no build step, no npm. But it
must be served over HTTP, because the pages fetch task files and start a
Web Worker, and browsers block both from `file://` URLs. So do not
double-click `index.html`; instead:

```bash
cd ~/projects/tech-group-my
python3 -m http.server 8000
```

then open http://localhost:8000 in Chrome. Stop the server with Ctrl+C.

Pages:

| page | what |
|---|---|
| `index.html` | the hub: progress strip, section cards, copy/clear saved work |
| `practice-python.html` | weeks 2–4: console tasks and Karel |
| `practice-web.html` | weeks 6–8: HTML/CSS editor, inspect-this-page, request/response, summarising |
| `practice-ai.html` | week 9: `call_gpt()` tasks, class code, call log |
| `teachers.html` | every task with hints and solutions — not linked from the menu |
| `dev/runner-test.html` | a test bench for the Python runner — not linked |

## How it is put together

```
index.html, practice-*.html, teachers.html, 404.html
css/style.css              the one stylesheet (UoB colours, fonts, every component)
js/
  layout.js                injects the shared header, nav and footer
  runner.js                Runner.runPython / runKarel — talks to the worker
  runner-worker.js         the Web Worker: loads Pyodide, runs programs, call_gpt() via sync XHR
  karel-api.py, ai-api.py  Python loaded into Pyodide: Karel's functions, call_gpt()
  karel-render.js / karel-play.js / karel-check.js   canvas, playback, goal checking
  tasks.js                 loads tasks/index.json and task files; runs console tests
  task-shell.js            the shared task page (list, brief, hints, verdict, reflections)
  task-screen.js           the Python task page (editor, Run/Stop, tests, Karel panel)
  web-tasks.js             the four web task types
  ai-screen.js, ai-config.js   the AI panel and the proxy address
  progress.js, reflections.js, hub.js   saving in localStorage, Padlet export, hub page
  teachers.js              builds teachers.html
tasks/                     one JSON file per task + index.json (format in tasks/README.md)
samples/                   deliberately flawed pages for the inspect tasks
vendor/pyodide/            Pyodide 314.0.6 (see its README to upgrade)
worker/                    the Cloudflare Worker AI proxy (see its README to deploy)
exercises/                 two earlier stand-alone exercises, still linked
```

## Adding a task

1. Copy an existing task file of the same type from `tasks/` and edit it.
   `tasks/README.md` documents every field for every type.
2. Add an entry to `tasks/index.json` in the right week, with the same
   `id`, `type`, `file` and `title`.
3. Run the site locally and open the task. For console tasks, paste the
   `solution` into the editor and press Run: every test must pass. For
   Karel, run the solution in every world.
4. Commit and push. Nothing else to do — GitHub Pages picks it up.

Ids are `type-wN-NN`; keep briefs in plain English (CEFR B1) with sample
output in ``` fences; give exactly three hints, from a nudge to almost the
answer.

## Deploying

The site is served by GitHub Pages from the `main` branch. Any push to
`main` is live within a minute or two:

```bash
git add -A
git commit -m "What changed"
git push
```

First-time setup, once: on github.com open the repository → **Settings →
Pages → Source: Deploy from a branch → Branch `main`, folder `/ (root)` →
Save**. The URL appears on that page.

**After a push, force browsers to fetch the new files.** Every stylesheet
and script link in the HTML pages carries a version tag, `?v=3`. Browsers
(and GitHub's cache) keep old copies for a while, so when you change any
CSS or JS, change the number in all the HTML files at once:

```bash
cd ~/projects/tech-group-my
sed -i '' 's/?v=3/?v=4/g' *.html dev/*.html js/runner-worker.js
```

(then commit and push). If a page looks wrong right after a push, a hard
reload — Shift+Cmd+R — fetches everything fresh for you.

GitHub Pages runs on Linux, where file names are case-sensitive. macOS is
not, so a wrongly-cased path works on a Mac and breaks online. Keep file
names lower-case and check paths in a fresh browser after each push.

The AI proxy is deployed separately, with `wrangler` — see
`worker/README.md`. Its address goes in `js/ai-config.js`.

## Browser support

Recent Chrome, Edge, Firefox and Safari. Python needs WebAssembly and a
module Web Worker (all browsers since 2021). If Python cannot load — a
network filter, an old browser — the task page says so and offers a link
to Trinket as a fallback.

## Credits

Built by Monika Pietruch for the EU Foundation Year, University of
Bedfordshire, with Claude. Karel is after Rich Pattis and Stanford's Code
in Place. Python in the browser is Pyodide (MPL-2.0).
