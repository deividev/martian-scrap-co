@echo off
rem DEV-ONLY (MSC-039): starts the packaged game with the playtest log on. Never ship this file (MSC-118).
rem Copy it next to "Martian Scrap Co.exe" in release\win-unpacked and double-click it.
rem The log is written to Documents\Martian Scrap Co playtest logs, one file per session.
set MSC_PLAYTEST_LOG=1
start "" "%~dp0Martian Scrap Co.exe"
