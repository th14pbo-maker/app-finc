#!/bin/sh
cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then
  python3 iniciar.py
elif command -v node >/dev/null 2>&1; then
  echo "Python3 não encontrado. Iniciando via Node.js..."
  node server.mjs
else
  echo "========================================================"
  echo "  Nenhum ambiente suportado foi encontrado."
  echo "========================================================"
  echo "Instale o Python 3 (https://www.python.org/) ou Node.js (https://nodejs.org/)."
  read -r answer
fi
