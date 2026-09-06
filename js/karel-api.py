# js/karel-api.py — the Karel robot, in Python.
#
# This file is loaded into Pyodide by js/runner-worker.js once, after the
# runner's own prelude. It defines the functions a student can call
# (move(), turn_left(), put_beeper() and so on) and _hub_run_karel(), which
# runs a student's program against a world.
#
# Nothing is drawn here. Every action appends one entry to a trace list, the
# whole program runs to the end (or to an error), and the trace goes back to
# the page, which plays it on a canvas at whatever speed the student chooses.
# That is why an infinite loop hits the step limit below in a fraction of a
# second instead of freezing anything.
#
# Coordinates follow Code in Place: columns count from 1 at the left, rows
# from 1 at the bottom. A wall is stored as (col, row, side), meaning "the
# <side> edge of that square is blocked". The edge of the world always is.

import json
import builtins
import linecache
import sys
import traceback

_KAREL_STEP_LIMIT = 10000
_KAREL_DIRS = ["north", "east", "south", "west"]      # turning left goes backwards through this list
_KAREL_DELTA = {"north": (0, 1), "east": (1, 0), "south": (0, -1), "west": (-1, 0)}
_KAREL_OPPOSITE = {"north": "south", "south": "north", "east": "west", "west": "east"}
_KAREL_STEP_LIMIT_MESSAGE = (
    "Karel has taken 10,000 steps. That usually means a loop that never ends. "
    "Check the condition in your while loop."
)


class KarelError(Exception):
    """An error in Karel's world, worded for a beginner."""
    pass


class _KarelWorld:
    def __init__(self, spec):
        self.cols = int(spec["cols"])
        self.rows = int(spec["rows"])
        karel = spec.get("karel", {})
        self.col = int(karel.get("col", 1))
        self.row = int(karel.get("row", 1))
        self.dir = karel.get("dir", "east")
        self.walls = set()
        for wall in spec.get("walls", []):
            self.walls.add((int(wall["col"]), int(wall["row"]), wall["side"]))
        self.beepers = {}
        for b in spec.get("beepers", []):
            self.beepers[(int(b["col"]), int(b["row"]))] = int(b.get("count", 1))
        bag = spec.get("karelBeepers", "infinite")
        self.bag = None if bag == "infinite" else int(bag)   # None = infinite
        self.trace = []
        self.steps = 0
        self.hit_step_limit = False

    def blocked(self, direction):
        dc, dr = _KAREL_DELTA[direction]
        nc, nr = self.col + dc, self.row + dr
        if nc < 1 or nc > self.cols or nr < 1 or nr > self.rows:
            return True
        if (self.col, self.row, direction) in self.walls:
            return True
        if (nc, nr, _KAREL_OPPOSITE[direction]) in self.walls:
            return True
        return False

    def record(self, action, cell=None):
        self.steps += 1
        entry = {"a": action, "col": self.col, "row": self.row, "dir": self.dir}
        if cell is not None:
            entry["cell"] = "%d,%d" % cell
            entry["count"] = self.beepers.get(cell, 0)
            entry["bag"] = self.bag
        self.trace.append(entry)
        if self.steps >= _KAREL_STEP_LIMIT:
            self.hit_step_limit = True
            raise KarelError(_KAREL_STEP_LIMIT_MESSAGE)

    def snapshot(self):
        return {
            "col": self.col, "row": self.row, "dir": self.dir,
            "beepers": {"%d,%d" % k: v for k, v in self.beepers.items() if v > 0},
            "bag": self.bag,
        }


_karel = None


# ---------------------------------------------------------------- actions

def move():
    """Move Karel one square forward."""
    if _karel.blocked(_karel.dir):
        raise KarelError("Karel tried to move, but there is a wall in front.")
    dc, dr = _KAREL_DELTA[_karel.dir]
    _karel.col += dc
    _karel.row += dr
    _karel.record("move")


def turn_left():
    """Turn Karel 90 degrees to the left."""
    _karel.dir = _KAREL_DIRS[(_KAREL_DIRS.index(_karel.dir) - 1) % 4]
    _karel.record("turn_left")


def put_beeper():
    """Put one beeper from Karel's bag on the current square."""
    if _karel.bag == 0:
        raise KarelError("Karel tried to put down a beeper, but Karel's bag is empty.")
    cell = (_karel.col, _karel.row)
    _karel.beepers[cell] = _karel.beepers.get(cell, 0) + 1
    if _karel.bag is not None:
        _karel.bag -= 1
    _karel.record("put_beeper", cell)


def pick_beeper():
    """Pick up one beeper from the current square into Karel's bag."""
    cell = (_karel.col, _karel.row)
    if _karel.beepers.get(cell, 0) == 0:
        raise KarelError("Karel tried to pick up a beeper, but there is no beeper on this square.")
    _karel.beepers[cell] -= 1
    if _karel.bag is not None:
        _karel.bag += 1
    _karel.record("pick_beeper", cell)


# ---------------------------------------------------------------- questions

def _left_of(direction):
    return _KAREL_DIRS[(_KAREL_DIRS.index(direction) - 1) % 4]


def _right_of(direction):
    return _KAREL_DIRS[(_KAREL_DIRS.index(direction) + 1) % 4]


def front_is_clear():
    return not _karel.blocked(_karel.dir)


def left_is_clear():
    return not _karel.blocked(_left_of(_karel.dir))


def right_is_clear():
    return not _karel.blocked(_right_of(_karel.dir))


def beepers_present():
    return _karel.beepers.get((_karel.col, _karel.row), 0) > 0


def no_beepers_present():
    return not beepers_present()


def beepers_in_bag():
    return _karel.bag is None or _karel.bag > 0


def facing_north():
    return _karel.dir == "north"


def facing_south():
    return _karel.dir == "south"


def facing_east():
    return _karel.dir == "east"


def facing_west():
    return _karel.dir == "west"


_KAREL_API = {
    "move": move, "turn_left": turn_left, "put_beeper": put_beeper, "pick_beeper": pick_beeper,
    "front_is_clear": front_is_clear, "left_is_clear": left_is_clear, "right_is_clear": right_is_clear,
    "beepers_present": beepers_present, "no_beepers_present": no_beepers_present,
    "beepers_in_bag": beepers_in_bag,
    "facing_north": facing_north, "facing_south": facing_south,
    "facing_east": facing_east, "facing_west": facing_west,
    "KarelError": KarelError,
}


# ---------------------------------------------------------------- runner

def _hub_run_karel(code, world_json):
    """Run a student's program in the given world. Returns JSON:
    {ok, error, initial, trace, final}."""
    global _karel
    _karel = _KarelWorld(json.loads(world_json))
    initial = _karel.snapshot()
    linecache.cache[_HUB_FILENAME] = (len(code), None, code.splitlines(True), _HUB_FILENAME)
    builtins.input = _hub_input
    result = {"ok": True, "error": None}
    namespace = {"__name__": "karel", "__builtins__": builtins}
    namespace.update(_KAREL_API)
    try:
        compiled = compile(code, _HUB_FILENAME, "exec")
        exec(compiled, namespace)
        # If the program already moved Karel at top level (for example it
        # ends with main()), do not run main() a second time.
        if not _karel.trace:
            main = namespace.get("main")
            if not callable(main):
                raise KarelError(
                    "Your program needs a function called main(). "
                    "Write def main(): and put Karel's commands inside it, indented by 4 spaces."
                )
            main()
    except SystemExit:
        pass
    except SyntaxError as e:
        result = {"ok": False, "error": {
            "type": type(e).__name__, "message": e.msg or str(e), "line": e.lineno,
            "traceback": "".join(traceback.format_exception_only(type(e), e))}}
    except BaseException as e:
        err = _hub_error(e)
        if isinstance(e, KarelError):
            err["karel"] = True
            err["stepLimit"] = _karel.hit_step_limit
        result = {"ok": False, "error": err}
    finally:
        try:
            sys.stdout.flush()
            sys.stderr.flush()
        except Exception:
            pass
    result["initial"] = initial
    result["trace"] = _karel.trace
    result["final"] = _karel.snapshot()
    return json.dumps(result)
