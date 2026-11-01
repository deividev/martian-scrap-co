@echo off
rem DEV-ONLY (MSC-039): keeps the current campaign save as a backup so the next tester starts a new campaign.
rem Usage: new-tester.bat T1   (the label of the tester who just finished). Close the game first.
if "%~1"=="" (
  echo Usage: new-tester.bat T1
  exit /b 1
)
set "SAVES=%APPDATA%\Martian Scrap Co\saves"
if not exist "%SAVES%\" (
  echo No save found: the next launch already starts a new campaign.
  exit /b 0
)
if exist "%SAVES%-%~1\" (
  echo A backup named saves-%~1 already exists; use another label.
  exit /b 1
)
ren "%SAVES%" "saves-%~1" && echo Save kept as saves-%~1. The next launch starts a new campaign.
