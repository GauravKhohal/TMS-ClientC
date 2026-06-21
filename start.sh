#!/bin/bash
echo "Starting TMS Backend..."
cd "$(dirname "$0")/backend" && node server.js &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

sleep 1

echo "Starting TMS Frontend..."
cd "$(dirname "$0")/frontend" && npx next start -p 3000 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "✅ TMS is running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5000"
echo ""
echo "Login credentials:"
echo "   Email:    admin@tms.in"
echo "   Password: tms@1234"
echo ""
echo "Press Ctrl+C to stop all servers"

wait
