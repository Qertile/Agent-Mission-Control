@echo off
rem ---------------------------------------------------------------
rem  agent.bat <session-uuid> [session-name]
rem  First run : creates a new session with this fixed UUID.
rem  Later runs: resumes the SAME conversation.
rem
rem  Transcripts live in %USERPROFILE%\.claude\projects\<folder>\, where
rem  <folder> is derived from the working directory. Instead of rebuilding
rem  that name, look for the transcript anywhere under projects.
rem
rem  The session name lives in the process registry, not in the
rem  conversation, so a resumed tab can lose it. --name pins it.
rem ---------------------------------------------------------------
set "MODE=--session-id"
dir /s /b "%USERPROFILE%\.claude\projects\%~1.jsonl" >nul 2>&1 && set "MODE=--resume"

if "%~2"=="" (
    claude %MODE% %~1
) else (
    claude %MODE% %~1 --name "%~2"
)
