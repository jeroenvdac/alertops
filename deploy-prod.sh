#!/usr/bin/env bash
set -euo pipefail

if git remote | grep -q .; then
  git pull
fi

docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml up --build -d
docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml ps
