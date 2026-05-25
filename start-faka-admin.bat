@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "PROJECT_DIR=D:\xianyu-ppt\faka-admin"
set "NODE_HOME=D:\NODEJS"
set "LOG_DIR=D:\faka-admin-log"
set "LOG_FILE=%LOG_DIR%\faka-admin.log"

set "PATH=%NODE_HOME%;%PROJECT_DIR%\node_modules\.bin;%PATH%"

REM 让 Playwright 浏览器安装到项目目录，避免 SYSTEM 用户找不到
set "PLAYWRIGHT_BROWSERS_PATH=%PROJECT_DIR%\ms-playwright"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%PROJECT_DIR%"

echo ================================ >> "%LOG_FILE%"
echo Start time: %date% %time% >> "%LOG_FILE%"
echo Current dir: %cd% >> "%LOG_FILE%"
echo Playwright browsers path: %PLAYWRIGHT_BROWSERS_PATH% >> "%LOG_FILE%"

REM 检查 package.json
if not exist "%PROJECT_DIR%\package.json" (
    echo ERROR: package.json not found in %PROJECT_DIR% >> "%LOG_FILE%"
    exit /b 1
)

REM 如果 node_modules 不存在，自动安装依赖
if not exist "%PROJECT_DIR%\node_modules" (
    echo node_modules not found, running npm install... >> "%LOG_FILE%"
    call "%NODE_HOME%\npm.cmd" --prefix "%PROJECT_DIR%" install >> "%LOG_FILE%" 2>&1
)

REM 修复 better-sqlite3 这种原生模块
echo Rebuilding better-sqlite3... >> "%LOG_FILE%"
call "%NODE_HOME%\npm.cmd" --prefix "%PROJECT_DIR%" rebuild better-sqlite3 >> "%LOG_FILE%" 2>&1

REM 安装 Playwright 浏览器，优先 chromium
if not exist "%PLAYWRIGHT_BROWSERS_PATH%" (
    echo Installing Playwright chromium... >> "%LOG_FILE%"
    call "%NODE_HOME%\npx.cmd" --prefix "%PROJECT_DIR%" playwright install chromium >> "%LOG_FILE%" 2>&1
)

REM 如果 .next 不存在，自动构建
if not exist "%PROJECT_DIR%\.next" (
    echo .next not found, running npm run build... >> "%LOG_FILE%"
    call "%NODE_HOME%\npm.cmd" --prefix "%PROJECT_DIR%" run build >> "%LOG_FILE%" 2>&1
)

echo Starting faka-admin... >> "%LOG_FILE%"
call "%NODE_HOME%\npm.cmd" --prefix "%PROJECT_DIR%" run start >> "%LOG_FILE%" 2>&1