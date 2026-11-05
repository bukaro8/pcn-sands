#!/bin/sh
set -eu

echo "Applying pending database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Starting PCN Management..."
exec node server.js
