@echo off
rem DEV-ONLY two-account Steam P2P test (MSC-026/027). Remove before release.
rem Copy next to "Martian Scrap Co.exe". Steam must be running and signed in; the host must be a Steam friend.
cd /d "%~dp0"
set /p LOBBY=Lobby number from the host: 
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$env:MSC_STEAM_APP_ID='480'; $env:MSC_DEV_STEAM_TEST='1'; & '.\Martian Scrap Co.exe' '--steam-p2p-test=join:%LOBBY%' 2>$null | Select-String -SimpleMatch p2pTest | ForEach-Object { $_.Line }"
echo.
pause
