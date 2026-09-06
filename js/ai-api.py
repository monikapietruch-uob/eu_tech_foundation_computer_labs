# js/ai-api.py — call_gpt() for the students' Python.
#
# Loaded into Pyodide by js/runner-worker.js after the runner's prelude.
# The student writes ordinary synchronous Python:
#
#     answer = call_gpt("Explain a variable in one sentence")
#     print(answer)
#
# Under the hood call_gpt() asks a JavaScript function in the worker,
# hubCallGpt, which sends the prompt to the class's AI proxy with a
# SYNCHRONOUS XMLHttpRequest — allowed inside a Web Worker, and the reason
# Python runs in one — and returns the proxy's JSON reply as a string.
# So the student's program simply waits for the answer, like input() does.

import json
import builtins
import js

_AI_DEFAULT_ERROR = "The AI service did not answer. Check your class code, or try again in a minute."
_AI_MAX_PROMPT_CHARS = 500


class AIError(Exception):
    """call_gpt() could not get an answer. The message is a full sentence."""
    pass


def call_gpt(prompt):
    """Send a question to the AI and return its answer as a string."""
    if prompt is None:
        raise AIError("call_gpt() needs a question. Put some text inside the brackets.")
    prompt = str(prompt).strip()
    if not prompt:
        raise AIError("call_gpt() needs a question. The text inside the brackets is empty.")
    if len(prompt) > _AI_MAX_PROMPT_CHARS:
        raise AIError("Your prompt is %d characters. The limit is %d." % (len(prompt), _AI_MAX_PROMPT_CHARS))
    try:
        raw = js.hubCallGpt(prompt)
    except Exception:
        raise AIError(_AI_DEFAULT_ERROR)
    try:
        result = json.loads(str(raw))
    except Exception:
        raise AIError(_AI_DEFAULT_ERROR)
    if result.get("ok"):
        return str(result.get("text", ""))
    raise AIError(str(result.get("error") or _AI_DEFAULT_ERROR))


# Make call_gpt available in every student program, like print() and input().
builtins.call_gpt = call_gpt
builtins.AIError = AIError
