#!/bin/sh
# wait-for-db.sh
set -e

host="$1"
port="${2:-5432}" # default port 5432
shift 2

echo "Waiting for database at $host:$port..."

# Loop until the TCP port is open
while ! nc -z "$host" "$port"; do
  echo "Postgres is unavailable - sleeping"
  sleep 1
done

echo "Postgres is up - executing command"
exec "$@"
