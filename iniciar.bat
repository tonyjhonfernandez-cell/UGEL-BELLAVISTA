@echo off
title Sistema de Monitoreo - UGEL Bellavista
echo ========================================
echo   Sistema de Monitoreo de Actividades
echo   UGEL Bellavista
echo ========================================
echo.
echo Iniciando servidor...
echo.

if not exist ".env" (
    echo ERROR: Archivo .env no encontrado
    echo Copia el archivo .env.example como .env y configura tu base de datos
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Instalando dependencias...
    npm install
    echo.
)

node server.js

pause
