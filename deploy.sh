#!/usr/bin/env bash
set -euo pipefail

if git remote | grep -q .; then
  git pull
fi

docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.dev.yml logs -f --tail=20
