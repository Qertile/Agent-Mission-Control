"""Cross-check: Claude, Codex and Antigravity work on one question together.

Two ways (a discussion's "mode"):
  discuss  round 1, each answers; each later round, each sees the others' latest
           answers and agrees, disagrees or revises; then the lead sums it up.
  review   the lead answers; the others review it; the lead replies and revises; each
           later round the others review the revision; then the first reviewer sums it up.

Each participant runs in print mode (`claude -p`, `codex exec`, `agy -p`) on a
conversation of its own, made for this discussion and resumed on every later turn, so it
remembers what it said; the agents.json sessions are never touched. They run in WORK_DIR
and can read the files there, but nothing asks for approval in print mode, so they do not
change files. A discussion is saved as discussions/<id>.json after every step; a
follow-up question goes to every participant on the same conversations, and one of them
then writes its conclusion.
"""

import json
import os
import re
import shutil
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import amc_core as core

DIR = os.path.join(core.HERE, 'discussions')
LABELS = {'claude': 'Claude', 'codex': 'Codex', 'agy': 'Antigravity'}
TIMEOUT = 900                      # seconds one turn may take
_lock = threading.Lock()           # one discussion's file is written by several threads
_live = {}                         # the discussions with a step under way: {id: the dict being run}
_procs = {}                        # their tools' processes now running: {id: set of Popen}


class Stopped(Exception):
    """Terminate was asked for: the discussion's work ends here."""


# --- one turn of one participant

def _run(argv, stdin=None, did=''):
    """The command's stdout, run in WORK_DIR with no console window on Windows. Kept in
    _procs[did] while it runs, for stop() to kill."""
    proc = subprocess.Popen(argv, cwd=core.WORK_DIR, text=True, encoding='utf-8', errors='replace',
                            stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            creationflags=0x08000000 if os.name == 'nt' else 0)   # CREATE_NO_WINDOW
    with _lock:
        _procs.setdefault(did, set()).add(proc)
    try:
        out, err = proc.communicate(stdin, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        raise RuntimeError(f'no reply in {TIMEOUT // 60} minutes')
    finally:
        with _lock:
            _procs[did].discard(proc)
    if not out.strip():
        raise RuntimeError((err.strip().splitlines() or ['no output'])[-1])
    return out


def ask(p, prompt, title, did=''):
    """Sends `prompt` to participant `p` (its "tool", "model" and, after its first turn,
    "conv") and returns (reply, cost note, tokens). Fills in p["conv"] on the first turn."""
    tool, model, conv = p['tool'], p.get('model') or '', p.get('conv') or ''
    exe = shutil.which({'claude': 'claude', 'codex': 'codex', 'agy': 'agy'}[tool])
    if not exe:
        raise RuntimeError(f'{tool} is not on PATH')
    if tool == 'claude':
        # The prompt goes in on stdin: no length limit, and newlines survive on Windows.
        if not conv:
            conv = p['conv'] = str(uuid.uuid4())
            argv = [exe, '-p', '--session-id', conv, '--name', f'Cross-check: {title}']
        else:
            argv = [exe, '-p', '--resume', conv]
        argv += ['--output-format', 'json'] + (['--model', model] if model else [])
        data = json.loads(_run(argv, prompt, did))
        if data.get('is_error'):
            raise RuntimeError(data.get('result') or 'error')
        cost = data.get('total_cost_usd')
        note = '' if cost is None else f'${cost:.2f}' if cost >= 0.01 else '<$0.01'
        u = data.get('usage') or {}
        tokens = sum(u.get(k) or 0 for k in ('input_tokens', 'cache_creation_input_tokens',
                                             'cache_read_input_tokens', 'output_tokens'))
        return data.get('result') or '', note, tokens
    if tool == 'agy':
        # agy takes the prompt only as an argument (Windows caps a command line at 32K chars).
        argv = [exe, '-p', prompt, '--output-format', 'json'] + (['--conversation', conv] if conv else [])
        data = json.loads(_run(argv + (['--model', model] if model else []), None, did))
        if data.get('status') != 'SUCCESS':
            raise RuntimeError(data.get('error') or data.get('status') or 'error')
        p['conv'] = data.get('conversation_id') or conv
        tokens = (data.get('usage') or {}).get('total_tokens')
        return data.get('response') or '', f'{core.format_tokens(tokens)} tokens' if tokens else '', tokens or 0
    # Codex: JSON events, one per line; '-' reads the prompt from stdin. Not tried yet
    # on a machine with codex, so a change in its event names shows as an error here.
    argv = [exe, 'exec', '--json', '--skip-git-repo-check'] + (['-m', model] if model else [])
    argv += ['resume', conv, '-'] if conv else ['-']
    text, tokens = '', 0
    for line in _run(argv, prompt, did).splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get('type') == 'thread.started':
            p['conv'] = e.get('thread_id') or conv
        item = e.get('item') or {}
        if e.get('type') == 'item.completed' and item.get('type') == 'agent_message':
            text = item.get('text') or text
        if e.get('type') == 'turn.completed':
            u = e.get('usage') or {}
            tokens += (u.get('input_tokens') or 0) + (u.get('output_tokens') or 0)
        if e.get('type') in ('error', 'turn.failed'):
            raise RuntimeError(e.get('message') or (e.get('error') or {}).get('message') or 'error')
    if not text:
        raise RuntimeError('no reply from codex')
    return text, f'{core.format_tokens(tokens)} tokens' if tokens else '', tokens


# --- the prompts

def _others(d, me):
    return ', '.join(p['label'] for i, p in enumerate(d['participants']) if i != me) or 'none'


def _quote(d, items):
    """Answers as '### <name>' sections, for one participant to read the others'."""
    return '\n\n'.join(f"### {d['participants'][e['who']]['label']}\n{e['text']}" for e in items)


LANG = 'Reply in the language the question is written in.'


def _rules(d):
    """What every prompt ends with: the language, and the word limit (0 = none)."""
    words = d.get('words', 0)
    return LANG + (f' Keep your reply under {words} words.' if words else '')


def _prompt_first(d, i):
    if d['mode'] == 'discuss':
        return (f"You are one of several AI assistants ({_others(d, i)} and you) discussing a question "
                f"for a user. Answer it yourself; you will see the others' answers next round.\n\n"
                f"Question:\n{d['question']}\n\nBe concrete and concise. {_rules(d)}")
    return (f"Answer the following. Other AI assistants ({_others(d, i)}) will review your answer, "
            f"so be concrete and say what you are unsure of.\n\nQuestion:\n{d['question']}\n\n{_rules(d)}")


def _prompt_round(d, i, rnd, others):
    return (f"Round {rnd}. The other participants' latest answers:\n\n{_quote(d, others)}\n\n"
            f"Compare them with yours: say where you agree, where you disagree and why, and give "
            f"your revised answer. Do not repeat what is unchanged at length. {_rules(d)}")


def _prompt_review(d, i, author_text, first):
    lead = d['participants'][d['lead']]['label']
    if first:
        return (f"You are reviewing another AI assistant's answer for a user. {lead} was asked:\n\n"
                f"{d['question']}\n\nIts answer:\n\n{author_text}\n\n"
                f"Review it critically: errors, risks, missing points, and what you would change. "
                f"Be concrete; if it is right, say so. {_rules(d)}")
    return (f"{lead} revised its answer after the reviews:\n\n{author_text}\n\n"
            f"Review the revision: what is now fixed, and what is still wrong or missing. {_rules(d)}")


def _prompt_reply(d, reviews):
    return (f"Reviews of your answer:\n\n{_quote(d, reviews)}\n\n"
            f"Reply to each point (accept it, or reject it with the reason), then give your "
            f"revised answer. {_rules(d)}")


def _prompt_summary(d, latest):
    return (f"The {'discussion' if d['mode'] == 'discuss' else 'review'} is over. The final "
            f"positions:\n\n{_quote(d, latest)}\n\nWrite the summary for the user, in three parts:\n"
            f"1. Agreed: what everyone agrees on.\n2. Disagreements: each open point and who holds "
            f"which view.\n3. Recommendation: the answer you would give the user now.\n"
            f"Be concise. {_rules(d)}")


def _prompt_conclusion(d, question, answers):
    return (f"The user's follow-up question:\n\n{question}\n\nThe participants' answers:\n\n"
            f"{_quote(d, answers)}\n\nWrite the conclusion for the user: the answer to the follow-up, "
            f"and any point still in dispute with who holds which view. {_rules(d)}")


# --- a discussion

def _path(did):
    return os.path.join(DIR, f'{did}.json')


def load(did):
    d = core.load_json(_path(did)) if re.fullmatch(r'[0-9a-f]{32}', did or '') else None
    if d:
        d['running'] = did in _live
    return d


def tokens(d):
    """Every participant's tokens on this discussion, all models together."""
    return sum(e.get('tokens') or 0 for e in d['entries'])


def _save(d):
    os.makedirs(DIR, exist_ok=True)
    tmp = _path(d['id']) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump({k: v for k, v in d.items() if k not in ('running', 'stopped')}, f, ensure_ascii=False, indent=1)
    os.replace(tmp, _path(d['id']))


def listing():
    """[{id, title, created, autoOpen}] newest first."""
    out = []
    for name in os.listdir(DIR) if os.path.isdir(DIR) else []:
        d = core.load_json(os.path.join(DIR, name)) if name.endswith('.json') else None
        if d:
            out.append({'id': d['id'], 'title': d['title'], 'created': d['created'],
                        'autoOpen': bool(d.get('autoOpen'))})
    return sorted(out, key=lambda x: x['created'], reverse=True)


def _turns(d, jobs, stage):
    """Runs [(participant index, prompt)] at once, each shown as 'thinking' until it
    replies. Returns the entries, in the order given."""
    entries = []
    with _lock:
        if d.get('stopped'):
            raise Stopped
        for i, _ in jobs:
            # The label as it is now: a model changed later does not rename this answer.
            e = {'stage': stage, 'who': i, 'label': d['participants'][i]['label'], 'text': '',
                 'status': 'thinking', 'note': '', 'tokens': 0,
                 'at': datetime.now().strftime('%H:%M:%S')}
            d['entries'].append(e)
            entries.append(e)
        _save(d)

    def one(e, prompt):
        p = d['participants'][e['who']]
        try:
            try:
                e['text'], e['note'], e['tokens'] = ask(p, prompt, d['title'], d['id'])
            except Exception:
                if not p.get('conv') or d.get('stopped'):
                    raise
                # A conversation that cannot go on (agy has answered INVALID_ARGUMENT to
                # every turn after a long review): once more on a new one, told the question
                # and where the discussion stands (its latest summary or conclusion).
                p['conv'] = ''
                last = next((x for x in reversed(d['entries']) if x['status'] == 'done'
                             and re.search('Summary|Conclusion', x['stage'])), None)
                recap = f"\n\nIts latest {last['stage']}, by {last.get('label') or d['participants'][last['who']]['label']}:\n\n{last['text']}" if last else ''
                e['text'], e['note'], e['tokens'] = ask(p, f"(Your earlier conversation in this discussion could not be "
                                              f"continued.) The question being discussed:\n\n{d['question']}"
                                              f"{recap}\n\n{prompt}", d['title'], d['id'])
                e['note'] = ' · '.join(filter(None, [e['note'], 'new conversation']))
            e['status'] = 'done'
        except Exception as err:
            e['text'], e['status'] = 'terminated' if d.get('stopped') else str(err), 'error'
        with _lock:
            _save(d)
    with ThreadPoolExecutor(len(jobs)) as pool:
        list(pool.map(lambda ep: one(*ep), zip(entries, [prompt for _, prompt in jobs])))
    if d.get('stopped'):
        raise Stopped
    return entries


def _ok(entries):
    return [e for e in entries if e['status'] == 'done']


def _discuss(d):
    n = len(d['participants'])
    latest = _turns(d, [(i, _prompt_first(d, i)) for i in range(n)], 'Round 1')
    for rnd in range(2, d['rounds'] + 1):
        prev = latest
        jobs = [(i, _prompt_round(d, i, rnd, [e for e in _ok(prev) if e['who'] != i]))
                for i in range(n) if [e for e in _ok(prev) if e['who'] != i]]
        if not jobs:
            break
        latest = _turns(d, jobs, f'Round {rnd}')
    if len(_ok(latest)) > 1:
        _turns(d, [(_summarizer(d), _prompt_summary(d, _ok(latest)))], 'Summary')


def _review(d):
    lead = d['lead']
    reviewers = [i for i in range(len(d['participants'])) if i != lead]
    answer = _turns(d, [(lead, _prompt_first(d, lead))], 'Answer')[0]
    reviews = []
    for rnd in range(1, d['rounds'] + 1):
        if answer['status'] != 'done':
            return
        reviews = _ok(_turns(d, [(i, _prompt_review(d, i, answer['text'], rnd == 1)) for i in reviewers],
                             f'Review {rnd}'))
        if not reviews:
            return
        answer = _turns(d, [(lead, _prompt_reply(d, reviews))], f'Reply {rnd}')[0]
    if answer['status'] == 'done' and reviews:
        _turns(d, [(_summarizer(d), _prompt_summary(d, reviews + [answer]))], 'Summary')


def _summarizer(d):
    """Who sums up: the lead in a discussion; in a review the author does not judge its
    own work, so the first reviewer."""
    if d['mode'] == 'discuss':
        return d['lead']
    return next(i for i in range(len(d['participants'])) if i != d['lead'])


def _in_thread(d, work):
    def run():
        try:
            work(d)
        except Stopped:
            pass
        finally:
            d.pop('stopped', None)
            _live.pop(d['id'], None)
    _live[d['id']] = d
    threading.Thread(target=run, daemon=True).start()


def start(question, mode, rounds, participants, lead, words=100):
    """Starts a discussion in the background and returns its id. participants:
    [{tool, model}]; lead: the index of the one who answers (review) or sums up (discuss);
    words: the word limit each reply is asked to keep to (0 = none)."""
    question = question.strip()
    if not question:
        raise ValueError('type a question')
    if mode not in ('discuss', 'review'):
        raise ValueError('unknown mode')
    if len(participants) < 2:
        raise ValueError('tick at least two')
    title = ' '.join(question.split())
    d = {'id': uuid.uuid4().hex, 'title': title[:40] + ('…' if len(title) > 40 else ''),
         'question': question, 'mode': mode, 'rounds': max(1, min(3, int(rounds))),
         'lead': max(0, min(len(participants) - 1, int(lead))), 'words': max(0, int(words)),
         'participants': [{'tool': p['tool'], 'model': p.get('model') or '',
                           'label': LABELS[p['tool']] + (f" ({p['model']})" if p.get('model') else ''),
                           'conv': ''} for p in participants],
         'autoOpen': True, 'entries': [], 'created': datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    _save(d)
    _in_thread(d, _discuss if mode == 'discuss' else _review)
    return d['id']


def follow_up(did, text):
    """Asks every participant `text` on its own conversation. Returns None or what went wrong."""
    d = load(did)
    if not d:
        return 'no such discussion'
    if d['running']:
        return 'still running - wait for this step to finish'
    if not text.strip():
        return 'type a question'
    n, text = len(d['participants']), text.strip()
    k = 1 + len({e['stage'] for e in d['entries'] if re.fullmatch(r'Follow-up \d+', e['stage'])})

    def work(d):
        answers = _ok(_turns(d, [(i, f"Follow-up question from the user:\n\n{text}\n\n{_rules(d)}")
                                 for i in range(n)], f'Follow-up {k}'))
        if len(answers) > 1:
            _turns(d, [(_summarizer(d), _prompt_conclusion(d, text, answers))], f'Follow-up {k} · Conclusion')
    _in_thread(d, work)
    return None


def configure(did, title, models, lead, words):
    """Changes a discussion's name, each participant's model (from its next turn on),
    the lead and the word limit; a running one in place, so its next save keeps them.
    Who takes part, the mode and the rounds stay. Returns None or what went wrong."""
    with _lock:
        d = _live.get(did) or load(did)
        if not d:
            return 'no such discussion'
        title = ' '.join((title or '').split())
        if title:
            d['title'] = title
        for p, m in zip(d['participants'], models):
            p['model'] = m or ''
            p['label'] = LABELS[p['tool']] + (f' ({m})' if m else '')
        d['lead'] = max(0, min(len(d['participants']) - 1, int(lead)))
        d['words'] = max(0, int(words))
        _save(d)
    return None


def stop(did):
    """Terminate: ends the step under way (its tools' processes killed, their answers
    marked "terminated") and the rest of the discussion's work."""
    with _lock:
        d = _live.get(did)
        if d:
            d['stopped'] = True
        procs = list(_procs.get(did, ()))
    for proc in procs:
        try:
            proc.kill()
        except OSError:
            pass


def set_auto_open(did, on):
    """Open on start: the discussion's tab opens when AMC starts."""
    with _lock:
        d = _live.get(did) or load(did)
        if d:
            d['autoOpen'] = bool(on)
            _save(d)
