#!/usr/bin/env bash
# One-step setup on Linux (the counterpart of install.ps1). Nothing is copied
# anywhere - the tools run from this folder. Setting up means four things:
#   1. checking the programs the tools call (Claude Code, Python 3 with pywebview,
#      ptyprocess, openpyxl and Tk, the DejaVu Sans Mono font), and offering to
#      install what is missing (apt for the packages, Anthropic's installer for Claude Code);
#   2. making your own agents.json, hud-config.json, tasks.md and TaskDatabase.xlsx
#      from their templates, if they are not there yet;
#   3. putting the "Agent Mission Control" shortcut on the desktop;
#   4. registering the scheduled jobs you choose as systemd user timers.
# Run it again after moving the folder: the shortcut and jobs are re-pointed.
#
#   ./install.sh --check-only    stops after step 1 and changes nothing.

root="$(cd "$(dirname "$0")" && pwd)"
export PATH="$HOME/.local/bin:$PATH"

ask() {   # ask "question" Y|N
    local hint='[y/N]'; [ "$2" = Y ] && hint='[Y/n]'
    read -r -p "$1 $hint " answer
    [ -z "$answer" ] && { [ "$2" = Y ]; return; }
    [[ "$answer" =~ ^([yY]|[yY][eE][sS])$ ]]
}

missing=0
report() {   # report "name" ok? "fix"
    if [ "$2" = 1 ]; then echo "  OK       $1"
    else echo -e "  \e[33mMISSING  $1 - $3\e[0m"; missing=$((missing + 1)); fi
}
has() { command -v "$1" >/dev/null 2>&1 && echo 1 || echo 0; }
py() { python3 -c "$1" >/dev/null 2>&1 && echo 1 || echo 0; }

echo -e "\n\e[36m== 1. Checking what the tools need ==\e[0m"
font() { fc-list 2>/dev/null | grep -q 'DejaVu Sans Mono' && echo 1 || echo 0; }
# The apt package for each missing item, offered as one "sudo apt install".
pkgs=()
[ "$(has python3)" = 1 ] || pkgs+=(python3)
[ "$(py 'import webview')" = 1 ] || pkgs+=(python3-webview)
[ "$(py 'import ptyprocess')" = 1 ] || pkgs+=(python3-ptyprocess)
[ "$(py 'import tkinter')" = 1 ] || pkgs+=(python3-tk)
[ "$(py 'import openpyxl')" = 1 ] || pkgs+=(python3-openpyxl)
[ "$(font)" = 1 ] || pkgs+=(fonts-dejavu-core)
# Claude Code's own installer is downloaded with curl, which a new Ubuntu may not have.
[ "$(has claude)" = 1 ] || [ "$(has curl)" = 1 ] || pkgs+=(curl)
if [ "$1" != --check-only ] && [ ${#pkgs[@]} -gt 0 ] && [ "$(has apt-get)" = 1 ] &&
   ask "  Missing: ${pkgs[*]}. Install them now with sudo apt install?" Y; then
    sudo apt-get update && sudo apt-get install -y "${pkgs[@]}"
fi
# Claude Code: Anthropic's own installer, into ~/.local/bin (already on PATH above).
if [ "$1" != --check-only ] && [ "$(has claude)" = 0 ] && [ "$(has curl)" = 1 ] &&
   ask '  Claude Code is missing. Install it now?' Y; then
    curl -fsSL https://claude.ai/install.sh | bash
fi

# Optional: a PC can use only Codex or Antigravity tabs. At least one of the three is needed.
optional() {   # optional "name" ok? "fix"
    if [ "$2" = 1 ]; then echo "  OK       $1"; else echo -e "  \e[90mOPTIONAL $1 - $3\e[0m"; fi
}
claude_ok="$(has claude)"
optional 'Claude Code (claude)' "$claude_ok" 'curl -fsSL https://claude.ai/install.sh | bash'
optional 'Codex CLI (codex)' "$(has codex)" 'npm install -g @openai/codex'
optional 'Antigravity CLI (agy)' "$(has agy)" 'install Antigravity and check that "agy" runs in a new terminal.'
[ "$claude_ok$(has codex)$(has agy)" = 000 ] && report 'An AI tool (claude, codex or agy)' 0 'install at least one of the three above.'
report 'Python 3 (python3)' "$(has python3)" 'sudo apt install python3'
report 'Python pywebview' "$(py 'import webview')" 'sudo apt install python3-webview'
report 'Python ptyprocess' "$(py 'import ptyprocess')" 'sudo apt install python3-ptyprocess'
report 'Python Tk (tkinter, for the task popup)' "$(py 'import tkinter')" 'sudo apt install python3-tk'
report 'Python openpyxl' "$(py 'import openpyxl')" 'sudo apt install python3-openpyxl'
report 'Font DejaVu Sans Mono' "$(font)" 'sudo apt install fonts-dejavu-core'
chmod +x "$root/Agents Launcher/launch-agents.py" "$root/Daily Summary/jobs.py"

if [ "$1" = --check-only ]; then
    echo -e "\n$missing item(s) missing. --check-only: nothing was changed."
    exit 0
fi

echo -e "\n\e[36m== 2. Your own files ==\e[0m"
# Kept out of git (.gitignore), so a pull never overwrites them; an existing one is left alone.
from_template() {   # from_template file template
    [ -e "$root/$1" ] && { echo "  Kept     $1"; return 1; }
    cp "$root/$2" "$root/$1" && echo "  Created  $1"
}
# The template's one tab is a Claude tab; without claude, start with no tabs (add them with +).
if from_template agents.json agents.template.json; then
    if [ "$claude_ok" = 1 ]; then sed -i "s/__NEW_ID__/$(cat /proc/sys/kernel/random/uuid)/" "$root/agents.json"
    else printf '{\n  "sessions": [\n  ]\n}\n' > "$root/agents.json"; fi
fi
from_template 'Session HUD/hud-config.json' 'Session HUD/hud-config.template.json'
from_template 'Task Manager/tasks.md' 'Task Manager/tasks.template.md'
from_template 'Task Manager/TaskDatabase.xlsx' 'Task Manager/TaskDatabase.template.xlsx'

echo -e "\n\e[36m== 3. Desktop shortcut ==\e[0m"
desktop="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
shortcut="$desktop/Agent Mission Control.desktop"
cat > "$shortcut" <<EOF
[Desktop Entry]
Type=Application
Name=Agent Mission Control
Comment=Open Agent Mission Control and its agent tabs
Exec=python3 "$root/Agents Launcher/launch-agents.py"
Path=$root/Agents Launcher
Icon=$root/Session HUD/mission-control.svg
Terminal=false
EOF
chmod +x "$shortcut"
gio set "$shortcut" metadata::trusted true 2>/dev/null
echo "Shortcut created: $shortcut"

echo -e "\n\e[36m== 4. Scheduled jobs ==\e[0m"
units="$HOME/.config/systemd/user"
mkdir -p "$units"
# Persistent=true runs a job missed while logged out or asleep at the next chance,
# like "start when available" on Windows; the daily summary is written for that.
add_job() {   # add_job unit "description" "OnCalendar" command...
    local unit="$1" desc="$2" when="$3"; shift 3
    # systemd's own quoting: each argument in double quotes, "%" doubled.
    local cmd="" a
    for a in "$(command -v "$1")" "${@:2}"; do cmd+="\"${a//%/%%}\" "; done
    cat > "$units/$unit.service" <<EOF
[Unit]
Description=$desc

[Service]
Type=oneshot
ExecStart=$cmd
EOF
    cat > "$units/$unit.timer" <<EOF
[Unit]
Description=$desc

[Timer]
OnCalendar=$when
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "$unit.timer" >/dev/null
    echo "Registered: $desc  ($when)"
}
jobs="$root/Daily Summary/jobs.py"
if ask 'Register the daily review (weekdays 09:30), daily summary (weekdays 19:00) and weekly summary (Fridays 19:30)?' Y; then
    add_job amc-daily-review 'Claude Daily Review' 'Mon..Fri 09:30' python3 "$jobs" review
    add_job amc-daily-summary 'Claude Daily Summary' 'Mon..Fri 19:00' python3 "$jobs" daily
    add_job amc-weekly-summary 'Claude Weekly Summary' 'Fri 19:30' python3 "$jobs" weekly
fi
if ask 'Also register the standalone task popup on weekdays at 09:30? (Tasks already show in Agent Mission Control.)' N; then
    add_job amc-task-popup 'Weekday 09:30 task HUD popup' 'Mon..Fri 09:30' python3 "$root/Task Manager/tasks.py" popup
fi

echo -e "\n\e[32mDone.\e[0m"
[ "$missing" -gt 0 ] && echo -e "\e[33m$missing item(s) above are still missing - fix them before using the tools.\e[0m"
echo 'Next: list your tabs in agents.json, then double-click "Agent Mission Control" on the desktop.'
