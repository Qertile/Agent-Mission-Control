#!/usr/bin/env bash
# ---------------------------------------------------------------
#  agent.sh <session-uuid> [session-name]
#  First run : creates a new session with this fixed UUID.
#  Later runs: resumes the SAME conversation.
#
#  Transcripts live in ~/.claude/projects/<folder>/, where <folder> is
#  derived from the working directory. Instead of rebuilding that name,
#  look for the transcript anywhere under projects.
#
#  The session name lives in the process registry, not in the
#  conversation, so a resumed tab can lose it. --name pins it.
# ---------------------------------------------------------------
export PATH="$HOME/.local/bin:$PATH"

mode=--session-id
if [ -n "$(find "$HOME/.claude/projects" -name "$1.jsonl" -print -quit 2>/dev/null)" ]; then
    mode=--resume
fi

# On the first run only, a session whose name has a prompts/<name>.md gets that
# file as its first message, so it is kept in the conversation on later resumes.
args=("$mode" "$1")
[ -n "$2" ] && args+=(--name "$2")
prompt="$(dirname "$0")/prompts/$2.md"
if [ "$mode" = --session-id ] && [ -n "$2" ] && [ -f "$prompt" ]; then
    args+=("$(cat "$prompt")")
fi

claude "${args[@]}"

# Like "cmd /k" on Windows: the tab stays open after claude exits.
exec "${SHELL:-bash}"
