"""Scan Claude Code transcripts and report token usage for the HUD.

Reads ~/.claude/projects/*/*.jsonl backwards from the end of each file and stops
as soon as it walks past the oldest boundary it needs, so it never has to parse
the full history.

One API request is written to the transcript as several lines that all repeat the
same `usage` object, so records are de-duplicated by requestId (falling back to
message.id) before anything is summed.

Usage limits run in 5-hour blocks that start with the first request after an idle
gap, so the block in progress is found by walking the last 24 hours of requests
and starting a new block whenever a request falls more than 5 hours after the
previous one or past the end of the block it would belong to. The block is
anchored on that request's exact time, not rounded: checked against the reset
time Claude's own usage panel reported (first request 09:30:24 -> reset 14:30),
an hour-floored anchor was half an hour early. Still inferred from local
transcripts rather than read from the API.

Output: a single JSON object on stdout.
"""

import glob
import json
import os
import sys
from datetime import datetime, timedelta, timezone

CHUNK = 1 << 20  # 1 MiB read-backwards step
BLOCK = timedelta(hours=5)
LOOKBACK = timedelta(hours=24)


# API list prices, USD per million tokens: input, output, cache write, cache read.
# The pies measure spend at these prices: the Claude app's usage percentages
# track cost far better than raw token counts, because cache reads are cheap.
# hud-config.json "modelPrices" overrides or extends this table.
DEFAULT_PRICES = {
    "opus-5-5": (4.0, 20.0, 5.0, 0.20),
    "opus-5": (5.0, 25.0, 6.25, 0.50),
    "sonnet-5-5": (2.0, 10.0, 2.5, 0.20),
    "sonnet-5": (2.0, 10.0, 2.5, 0.20),
    "haiku-5-5": (0.10, 0.50, 0.125, 0.01),
}


def load_prices():
    prices = dict(DEFAULT_PRICES)
    try:
        cfg = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hud-config.json")
        with open(cfg, encoding="utf-8") as f:
            for model, row in (json.load(f).get("modelPrices") or {}).items():
                prices[model] = tuple(float(x) for x in row)
    except Exception:
        pass
    return prices


def cost_of(prices, model, inp, out, cache_write, cache_read):
    """USD at list price; models without a price are charged like Sonnet."""
    p = prices.get((model or "").replace("claude-", ""), prices["sonnet-5"])
    return (inp * p[0] + out * p[1] + cache_write * p[2] + cache_read * p[3]) / 1e6


def transcript_paths(root):
    # Sub-agent transcripts live one level deeper and count toward the same
    # limits; without them a summary job's reading went missing from the totals.
    return (glob.glob(os.path.join(root, "*", "*.jsonl"))
            + glob.glob(os.path.join(root, "*", "*", "subagents", "*.jsonl")))


def token_fields(usage):
    inp = usage.get("input_tokens") or 0
    out = usage.get("output_tokens") or 0
    cc = usage.get("cache_creation_input_tokens") or 0
    cr = usage.get("cache_read_input_tokens") or 0
    return inp, out, cc, cr


def iter_records_backwards(path, cutoff_ts):
    """Yield decoded records from the tail of `path`, newest first.

    Stops once a record older than `cutoff_ts` is reached. Returns records that
    carry a usage object only.
    """
    size = os.path.getsize(path)
    pos = size
    tail = b""
    while pos > 0:
        step = min(CHUNK, pos)
        pos -= step
        with open(path, "rb") as fh:
            fh.seek(pos)
            buf = fh.read(step)
        buf += tail
        lines = buf.split(b"\n")
        # The first fragment may be an incomplete line unless we hit the start.
        tail = lines.pop(0) if pos > 0 else b""
        for raw in reversed(lines):
            raw = raw.strip()
            if not raw:
                continue
            try:
                rec = json.loads(raw.decode("utf-8", "replace"))
            except Exception:
                continue
            ts = rec.get("timestamp")
            if not ts:
                continue
            try:
                when = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except Exception:
                continue
            if when < cutoff_ts:
                return
            msg = rec.get("message") or {}
            usage = msg.get("usage")
            if not usage:
                continue
            yield when, rec, msg, usage


def blank():
    return {"input": 0, "output": 0, "cacheCreate": 0, "cacheRead": 0,
            "total": 0, "requests": 0}


def add(bucket, req):
    bucket["input"] += req["input"]
    bucket["output"] += req["output"]
    bucket["cacheCreate"] += req["cacheCreate"]
    bucket["cacheRead"] += req["cacheRead"]
    bucket["total"] += req["input"] + req["output"] + req["cacheCreate"] + req["cacheRead"]
    bucket["requests"] += 1


def current_block_start(times):
    """Return the start of the 5-hour block still in progress.

    `times` must be sorted ascending. A new block begins on the first request
    that lands more than 5 hours after the previous one, or past the end of the
    block it would otherwise belong to.
    """
    if not times:
        return None
    start = times[0]
    prev = times[0]
    for when in times[1:]:
        if when - prev >= BLOCK or when >= start + BLOCK:
            start = when
        prev = when
    return start


def main():
    now = datetime.now(timezone.utc)
    local_now = datetime.now().astimezone()
    today_start = local_now.replace(hour=0, minute=0, second=0,
                                    microsecond=0).astimezone(timezone.utc)
    cutoff = min(today_start, now - LOOKBACK)

    root = os.path.join(os.path.expanduser("~"), ".claude", "projects")
    paths = transcript_paths(root)
    cutoff_epoch = cutoff.timestamp()

    seen = set()
    requests = []

    for path in paths:
        try:
            if os.path.getmtime(path) < cutoff_epoch:
                continue
        except OSError:
            continue
        try:
            records = iter_records_backwards(path, cutoff)
        except OSError:
            continue
        for when, rec, msg, usage in records:
            key = rec.get("requestId") or msg.get("id")
            if key is None:
                key = (path, rec.get("uuid"))
            if key in seen:
                continue
            seen.add(key)
            inp, out, cc, cr = token_fields(usage)
            requests.append({
                "when": when,
                "session": rec.get("sessionId") or "",
                "model": msg.get("model") or rec.get("requestedModel") or "unknown",
                "input": inp, "output": out, "cacheCreate": cc, "cacheRead": cr,
            })

    requests.sort(key=lambda r: r["when"])
    block_start = current_block_start([r["when"] for r in requests])
    block_end = block_start + BLOCK if block_start else None

    # Once the block is over it has reset, even though nothing new has been
    # sent yet. Without this the last block's totals stay on screen long after
    # the limit was released; there simply is no block until the next request.
    if block_end and now >= block_end:
        block_start = None
        block_end = None

    prices = load_prices()
    block_cost = 0.0
    block = blank()
    today = blank()
    by_session = {}
    by_model = {}

    for req in requests:
        when = req["when"]
        slot = by_session.setdefault(req["session"], {"block": blank(),
                                                      "today": blank(),
                                                      "lastTs": None})
        if when >= today_start:
            add(today, req)
            add(slot["today"], req)
        if block_start and when >= block_start:
            add(block, req)
            add(slot["block"], req)
            tot = req["input"] + req["output"] + req["cacheCreate"] + req["cacheRead"]
            by_model[req["model"]] = by_model.get(req["model"], 0) + tot
            block_cost += cost_of(prices, req["model"], req["input"], req["output"], req["cacheCreate"], req["cacheRead"])
        ts = when.isoformat()
        if slot["lastTs"] is None or ts > slot["lastTs"]:
            slot["lastTs"] = ts

    remaining = None
    if block_end:
        remaining = int(max(0, (block_end - now).total_seconds()))

    out = {
        "generatedAt": local_now.isoformat(),
        "blockStart": block_start.astimezone().isoformat() if block_start else None,
        "blockEnd": block_end.astimezone().isoformat() if block_end else None,
        "blockSecondsLeft": remaining,
        "todayStart": today_start.astimezone().isoformat(),
        "block": block,
        "blockCost": block_cost,
        "today": today,
        "byModel": by_model,
        "bySession": by_session,
    }
    json.dump(out, sys.stdout, ensure_ascii=False)


def week_start(now_local, reset_weekday, reset_hour):
    """Most recent weekly reset at or before now (weekday: Monday=0 .. Friday=4)."""
    d = now_local.replace(hour=reset_hour, minute=0, second=0, microsecond=0)
    d -= timedelta(days=(d.weekday() - reset_weekday) % 7)
    if d > now_local:
        d -= timedelta(days=7)
    return d


def week_main(out_path, reset_weekday, reset_hour):
    """Total tokens since the last weekly reset, written to out_path.

    Reads up to seven days of transcripts, so the HUD runs it in the
    background every few minutes instead of on every refresh.
    """
    local_now = datetime.now().astimezone()
    start = week_start(local_now, reset_weekday, reset_hour)
    cutoff = start.astimezone(timezone.utc)
    root = os.path.join(os.path.expanduser("~"), ".claude", "projects")
    seen, total, reqs = set(), 0, 0
    prices, cost = load_prices(), 0.0
    for path in transcript_paths(root):
        try:
            if os.path.getmtime(path) < cutoff.timestamp():
                continue
        except OSError:
            continue
        for when, rec, msg, usage in iter_records_backwards(path, cutoff):
            key = rec.get("requestId") or msg.get("id") or (path, rec.get("uuid"))
            if key in seen:
                continue
            seen.add(key)
            inp, out, cc, cr = token_fields(usage)
            total += inp + out + cc + cr
            cost += cost_of(prices, msg.get("model") or rec.get("requestedModel"), inp, out, cc, cr)
            reqs += 1
    result = {"generatedAt": local_now.isoformat(), "weekStart": start.isoformat(),
              "weekEnd": (start + timedelta(days=7)).isoformat(),
              "total": total, "cost": cost, "requests": reqs}
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(result, f)
    os.replace(tmp, out_path)
    print(json.dumps(result))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--week":
        week_main(sys.argv[2],
                  int(sys.argv[3]) if len(sys.argv) > 3 else 4,
                  int(sys.argv[4]) if len(sys.argv) > 4 else 21)
    else:
        main()
