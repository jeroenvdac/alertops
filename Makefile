.PHONY: dev logs stop shell

dev:
	./deploy.sh

logs:
	docker compose -f docker-compose.dev.yml logs -f

stop:
	docker compose -f docker-compose.dev.yml down

shell:
	docker compose -f docker-compose.dev.yml exec app sh

.PHONY: prod prod-logs prod-stop

prod:
	./deploy-prod.sh

prod-logs:
	docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml logs --tail=50

prod-stop:
	docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml stop
