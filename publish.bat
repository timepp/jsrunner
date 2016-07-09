@echo off
set dest=%1
if "%1"=="" (
    set /p dest=input destination path:
)

mkdir "%dest%"
mkdir "%dest%\src"
mkdir "%dest%\scripts"
mkdir "%dest%\src\fonts"
mkdir "%dest%\src\thirdparty"

copy launch.bat "%dest%"
copy src\*.html "%dest%\src"
copy src\*.js "%dest%\src"
copy src\*.css "%dest%\src"
copy src\fonts\*.* "%dest%\src\fonts"
copy src\thirdparty\*.* "%dest%\src\thirdparty"
copy scripts\*.js "%dest%\scripts"

:: do not copy sample.js
del "%dest%\src\sample.js"

