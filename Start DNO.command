#!/bin/bash
# Double-click in Finder to start the DNO rebuild (Customer Care Suite) on http://127.0.0.1:3100
cd "$(dirname "$0")" || exit 1
PORT=${PORT:-3100}
echo "Starting DNO rebuild on http://127.0.0.1:$PORT ..."
( sleep 6; open "http://127.0.0.1:$PORT/#/customer-care/user-manager" ) &
PORT=$PORT node nest/dist/nest/src/main.js 2>&1 | tee dno-run.log
echo
echo "Server stopped. Press Enter to close."; read
