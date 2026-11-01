@echo off
rem Local preview of the viewer: serves docs\ at http://localhost:8000/ and opens the browser.
rem Stop the server with Ctrl+C in this window.
cd /d "%~dp0docs"
start "" "http://localhost:8000/"
python -m http.server 8000 --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo Python was not found or port 8000 is in use. Install Python 3 or close the other server.
  pause
)
