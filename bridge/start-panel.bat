@echo off
REM Bridge Panel GUI - Launcher para Windows
REM Abre el panel de control del Bridge en http://localhost:3333

setlocal enabledelayedexpansion

REM Verificar si Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js no encontrado. Instala Node.js primero.
    echo Descarga desde: https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Ir a directorio Bridge
cd /d "%~dp0" || (
    echo.
    echo [ERROR] No se puede acceder al directorio Bridge
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  BRIDGE TPV LATIN PRO - Panel Control
echo ========================================
echo.

REM Compilar TypeScript
echo Compilando TypeScript...
call npx tsc

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Compilacion fallo
    echo.
    pause
    exit /b 1
)

REM Ejecutar panel compilado
echo Iniciando panel en http://localhost:3333...
echo.
call node dist/bridge-panel.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Panel fallo
    echo Verifica bridge/src/config.ts
    echo.
    pause
    exit /b 1
)
