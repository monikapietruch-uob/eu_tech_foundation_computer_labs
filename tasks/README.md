# tasks/

Every practice task on the site is one JSON file in here. The site reads
`tasks/index.json` to know which tasks exist and in what order, then fetches
a task's own file when a student opens it. No build step: add a file, add a
line to the index, done.

```
tasks/
  index.json          the list of tasks, grouped by week (order matters)
  console/            type "console" — a program that prints; checked by its output
    w2-01.json
    ...
  karel/              type "karel" — coming in stage 4
```

## index.json

```json
{
  "weeks": [
    {
      "week": 2,
      "title": "Variables, input and output",
      "tasks": [
        { "id": "console-w2-01", "file": "console/w2-01.json", "title": "Say hello" }
      ]
    }
  ]
}
```

`file` is relative to the `tasks/` folder. `title` is repeated here so the
task list can be drawn without fetching every task file.

## A console task

```json
{
  "id": "console-w2-01",
  "week": 2,
  "type": "console",
  "title": "Say hello",
  "concepts": ["print", "string", "output"],
  "brief": "Two to four short sentences telling the student what to make. Plain English, CEFR B1.",
  "vocabulary": [
    { "term": "print", "gloss": "a function that shows text on the screen" }
  ],
  "starterCode": "# Write your code below this line\n",
  "tests": [
    {
      "name": "prints the greeting",
      "stdin": [],
      "expectedStdout": "Hello, world!\n",
      "match": "exact"
    }
  ],
  "hints": [
    "A small nudge in the right direction.",
    "A bigger nudge that names the function or idea they need.",
    "Almost the whole answer, in words."
  ],
  "solution": "print(\"Hello, world!\")\n"
}
```

| field | meaning |
|---|---|
| `id` | unique; used in the page URL (`practice-python.html?task=console-w2-01`) |
| `week` | the teaching week it belongs to |
| `type` | `console` for now; `karel` from stage 4 |
| `concepts` | short tags shown on the task card and used for revision lists |
| `brief` | what to make — this is the only instruction the student sees, so make it complete. Separate paragraphs with a blank line (`\n\n`). Wrap sample output in ``` fences on their own lines and it is shown as code |
| `vocabulary` | terms with a one-line gloss; shown beside the brief |
| `starterCode` | what is in the editor when the task opens. Use `\n` for new lines |
| `tests` | see below. Every test must pass for the task to be complete |
| `hints` | exactly three, revealed one at a time |
| `solution` | a correct program. Not shown to students on the task page, but anyone can read this file, so do not put anything secret in it |

### Tests

Each test runs the student's whole program once, with the `stdin` lines
supplied to `input()` in order, and compares what the program printed with
`expectedStdout` using `match`:

| `match` | passes when |
|---|---|
| `exact` | the output is exactly `expectedStdout`, character for character (use `\n` at the end if `print` was used) |
| `trimmed` | the same, but spaces and blank lines at the start and end are ignored, and Windows line endings are treated as normal ones |
| `contains` | `expectedStdout` appears anywhere in the output |
| `regex` | the output matches `expectedStdout` as a JavaScript regular expression with the `m` flag, so `^` and `$` match the start and end of any line |

A test may also have `"expectedShown": "..."` — text shown to the student
in place of `expectedStdout` when the test fails. Use it for `regex` tests,
where the pattern itself would not mean anything to a beginner.

Tips:

- If the student's program uses `input()`, the prompt text they choose is
  echoed into the output (like a real terminal), so use `contains` or
  `regex` rather than `exact` for those tasks.
- Give tests names that say what a marker would check: "adds 10 and 20",
  "says fail for 39". The student sees these names.
- When a test fails, the student sees the expected output next to what
  their program actually printed. Write `expectedStdout` so that difference
  is instructive — for example, `4 + 5 = 9` beside a wrong `4 + 5 = 45`
  teaches `int()` better than any sentence could.
