#!/usr/bin/env bash
# One-step setup on Linux (the counterpart of install.ps1). Nothing is copied
# anywhere - the tools run from this folder. Setting up means three things:
#   1. checking the programs the tools call (GNOME Terminal, tmux, Claude Code,
#      Python 3 with Tk and openpyxl, the DejaVu Sans Mono font);
#   2. putting the "Agents Launcher" shortcut on the desktop;
#   3. registering the scheduled jobs you choose as systemd user timers.
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
report 'GNOME Terminal (gnome-terminal)' "$(has gnome-terminal)" 'sudo apt install gnome-terminal'
report 'tmux' "$(has tmux)" 'sudo apt install tmux'
report 'Claude Code (claude)' "$(has claude)" 'install Claude Code and check that "claude" runs in a new terminal.'
report 'Python 3 (python3)' "$(has python3)" 'sudo apt install python3'
report 'Python Tk (tkinter)' "$(py 'import tkinter')" 'sudo apt install python3-tk'
report 'Python openpyxl' "$(py 'import openpyxl')" 'sudo apt install python3-openpyxl'
font=0; fc-list | grep -q 'DejaVu Sans Mono' && font=1
report 'Font DejaVu Sans Mono' "$font" 'sudo apt install fonts-dejavu-core'
chmod +x "$root/Agents Launcher/agent.sh" "$root/Agents Launcher/launch-agents.py" "$root/Daily Summary/jobs.py"

if [ "$1" = --check-only ]; then
    echo -e "\n$missing item(s) missing. --check-only: nothing was changed."
    exit 0
fi

echo -e "\n\e[36m== 2. Desktop shortcut ==\e[0m"
desktop="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
shortcut="$desktop/Agents Launcher.desktop"
cat > "$shortcut" <<EOF
[Desktop Entry]
Type=Application
Name=Agents Launcher
Comment=Open all active Claude Code agent tabs
Exec=python3 "$root/Agents Launcher/launch-agents.py"
Path=$root/Agents Launcher
Icon=utilities-terminal
Terminal=false
EOF
chmod +x "$shortcut"
gio set "$shortcut" metadata::trusted true 2>/dev/null
echo "Shortcut created: $shortcut"

echo -e "\n\e[36m== 3. Scheduled jobs ==\e[0m"
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
echo 'Next: list your tabs in agents.json, then double-click "Agents Launcher" on the desktop.'
