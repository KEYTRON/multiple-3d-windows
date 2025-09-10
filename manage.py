#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Простой менеджер: поднимает статический сервер для папки frontend.
Использование:
    python manage.py runserver
После запуска открывай: http://localhost:8000
"""

import sys
import subprocess
import pathlib

def runserver():
    root = pathlib.Path(__file__).parent.resolve() / "frontend"
    print(f"📦 Serving {root} at http://localhost:8000")
    subprocess.run(["python3", "-m", "http.server", "8000", "--directory", str(root)], check=True)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "runserver":
        runserver()
    else:
        print("Использование: manage.py runserver")