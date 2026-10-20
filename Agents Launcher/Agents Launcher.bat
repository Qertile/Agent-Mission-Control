@echo off
rem ===============================================================
rem  Agents Launcher - opens the Claude Code tabs listed in agents.json
rem  (in the folder above this one) and starts Agent Mission Control.
rem  To add, rename, reorder or move a tab, edit agents.json only:
rem  this launcher and Agent Mission Control both read it.
rem  Keep comments ASCII only - cmd mangles UTF-8 in .bat files.
rem ===============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-agents.ps1"
