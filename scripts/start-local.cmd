@echo off
cd /d "%~dp0.."
node --no-warnings=ExperimentalWarning server/index.js
