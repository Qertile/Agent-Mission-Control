@echo off
rem ===============================================================
rem  Agents Launcher - opens the Claude Code agent tabs in Windows
rem  Terminal and starts the Agent Mission Control.
rem
rem  Every tab starts in WD, the folder that contains AI-Infra, and
rem  resumes a fixed session id, so each tab comes back to the same
rem  conversation every time.
rem
rem  To add a tab: copy the new-tab line, give it a NEW session id and a
rem  name, and add the same id to $script:SessionOrder in
rem  Session HUD\show-session-hud.ps1. Make an id with:
rem      powershell -c "[guid]::NewGuid()"
rem  The first run creates the session; later runs resume it.
rem  Several tabs in one window: end a line with ^ and start the next
rem  line with  ; new-tab ...
rem
rem  -w -1  forces a brand new window (never merge into an existing one)
rem  Keep the "call" in "cmd /k call ..." - this folder name has a space,
rem  and without "call" cmd strips the outer quotes and the path breaks.
rem  Keep comments ASCII only - cmd mangles UTF-8 in .bat files.
rem ===============================================================
for %%I in ("%~dp0..\..") do set "WD=%%~fI"
set "H=%~dp0agent.bat"

start "" wt -w -1 new-tab -d "%WD%" --title "Main" cmd /k call "%H%" 120965a5-73ab-4e30-b9ab-8a9ab0a64239 "Main"

rem --- Agent Mission Control (tasks + sessions + usage) -------------------
rem  Through conhost.exe on purpose: started directly, Windows 11 hands the
rem  console to Windows Terminal and an empty "powershell" window appears.
start "" conhost.exe powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0..\Session HUD\show-session-hud.ps1"
