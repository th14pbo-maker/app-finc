@echo off
setlocal
cd /d "%~dp0"
title Finance OS Local

echo Iniciando o Finance OS Local...

:: 1. Tenta usar o Python Launcher (py -3)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 iniciar.py
  goto :finish
)

:: 2. Tenta usar o Python tradicional
where python >nul 2>nul
if %errorlevel%==0 (
  python iniciar.py
  goto :finish
)

:: 3. Tenta usar o Node.js se o Python nao estiver no PATH
where node >nul 2>nul
if %errorlevel%==0 (
  echo Python nao localizado. Iniciando via Node.js...
  node local-server.mjs
  goto :finish
)

:: 4. Se nenhum runtime foi encontrado
echo.
echo ========================================================
echo   [!] Nao foi possivel iniciar automaticamente.
echo ========================================================
echo   Nem o Python 3 nem o Node.js foram encontrados no seu sistema.
echo.
echo   Para usar o Finance OS Localmente, instale um deles:
echo   - Python: https://www.python.org/downloads/ (marque "Add Python to PATH")
echo   - Node.js: https://nodejs.org/
echo.
pause

:finish
