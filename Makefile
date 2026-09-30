.PHONY: dev logs stop shell

dev:
	./deploy.sh

logs:
	docker compose -f docker-compose.dev.yml logs -f

stop:
	docker compose -f docker-compose.dev.yml down

shell:
	docker compose -f docker-compose.dev.yml exec app sh
