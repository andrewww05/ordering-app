# ordering-app

Order CRUD split across three NestJS microservices in an Nx monorepo. RabbitMQ carries both the
request/response traffic and the domain events; Postgres is owned by a single service.

## Architecture

```
                HTTP :3000                    RPC over RMQ                     event over RMQ
   client ──────────────────► api-gateway ──────────────────────► order-service ──────────────────────► notification-service
                              (no domain      queue: order_queue   (owns Postgres)  queue: notifications_queue   (logs the delivery)
                               logic)                                    │
                                                                         ▼
                                                                     Postgres
```

| Service | Port | Role |
| --- | --- | --- |
| `api-gateway` | 3000 | The only HTTP surface. Validates input, maps RPC failures to status codes, serves Swagger. Holds no business rules. |
| `order-service` | 3001 | Owns the orders schema and is the only writer to Postgres. Consumes `order_queue`. |
| `notification-service` | 3002 | Consumes `order.created` from `notifications_queue`. Knows nothing about HTTP or Postgres. |
| `libs/contracts` | — | Message patterns, DTOs and response shapes shared by all three, so the wire format is checked at compile time. |

Two deliberately different interaction styles:

- **Gateway → order-service is request/response** (`client.send`), because CRUD needs return values
  and real status codes. Every call is bounded by `RPC_TIMEOUT_MS`, so a dead order-service produces
  a `504` rather than a hung request.
- **order-service → notification-service is an event** (`client.emit`). order-service does not wait
  for it and does not know who consumes it. Because the queue is durable, orders can be created
  while notification-service is down and the events are delivered when it comes back.

## Business rules

Kept intentionally small — the interesting part is the decomposition, not the domain:

- `totalCents` is always derived server-side as `sum(quantity * unitCents)`. A client that sends
  `totalCents` gets a `400`.
- `SHIPPED` and `CANCELLED` are terminal: further updates return `409`.
- Only `PENDING` orders can be deleted; anything else returns `409`.

## Prerequisites

Node 24, pnpm 10 (`corepack enable`), Docker.

## Run everything in Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

The `migrate` service runs `prisma migrate deploy` and must exit successfully before `order-service`
starts; `api-gateway` waits for `order-service` to report healthy.

## Run the services locally

```bash
cp .env.example .env
docker compose up -d postgres rabbitmq
pnpm install
pnpm exec prisma migrate deploy
pnpm exec nx run-many -t serve
```

`serve` runs each app in watch mode. Individual services: `pnpm exec nx serve order-service`.

## API

Base path `/api/v1`. Swagger UI at http://localhost:3000/api/docs.

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/orders` | 201 | `totalCents` is rejected if supplied |
| `GET` | `/api/v1/orders` | 200 | `?status=&customerId=&page=&limit=` (`limit` capped at 100) |
| `GET` | `/api/v1/orders/:id` | 200 | 404 when unknown |
| `PATCH` | `/api/v1/orders/:id` | 200 | 409 on a terminal status |
| `DELETE` | `/api/v1/orders/:id` | 204 | 409 unless `PENDING` |

Health endpoints are unversioned: `/api/health` (gateway, pings order-service over RMQ),
`:3001/health` (checks Postgres), `:3002/health` (checks RabbitMQ).

### Walkthrough

```bash
ID=$(curl -s -X POST localhost:3000/api/v1/orders \
  -H 'content-type: application/json' \
  -d '{"customerId":"cust-1","items":[{"sku":"SKU-A","quantity":2,"unitCents":500},{"sku":"SKU-B","quantity":1,"unitCents":250}]}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")

curl -s localhost:3000/api/v1/orders/$ID
curl -s "localhost:3000/api/v1/orders?page=1&limit=10"
curl -s -X PATCH localhost:3000/api/v1/orders/$ID -H 'content-type: application/json' -d '{"status":"CONFIRMED"}'
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:3000/api/v1/orders/$ID
```

The last call returns `409` because the order is no longer `PENDING`. Watch the event arrive with
`docker compose logs -f notification-service`.

## Error handling

order-service throws `RpcException` carrying `{ statusCode, message, error }`. A global filter in the
gateway turns that into the matching HTTP response, maps an RxJS `TimeoutError` to `504`, and
collapses anything unrecognised into a `500` with the detail logged rather than returned. Health
payloads from Terminus pass through untouched so the failing check stays visible.

## Workspace commands

```bash
pnpm exec nx run-many -t lint
pnpm exec nx run-many -t build
pnpm exec nx run order-service:prisma-generate
pnpm exec prisma migrate dev --name <name>
```

Module boundaries are enforced by tags: apps carry `type:app`, `libs/contracts` carries `type:lib`,
and `@nx/enforce-module-boundaries` only permits `app → lib` and `lib → lib`. One service importing
another's internals fails lint.

## Environment

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | order-service, prisma CLI | Postgres connection string |
| `RABBITMQ_URL` | all three | Broker URL |
| `ORDER_QUEUE` | gateway, order-service | Queue for order RPC |
| `NOTIFICATIONS_QUEUE` | order-service, notification-service | Queue for order events |
| `API_GATEWAY_PORT` / `ORDER_SERVICE_PORT` / `NOTIFICATION_SERVICE_PORT` | respective service | HTTP port |
| `RPC_TIMEOUT_MS` | gateway | How long to wait for order-service |

Each service validates its own variables at boot with `class-validator` and refuses to start if any
are missing or malformed.

## Known limitations

- **Create-then-publish is not atomic.** A crash between the Postgres commit and the RabbitMQ publish
  loses the event. The real fix is a transactional outbox, which is out of scope here.
- **No dead-letter exchange.** notification-service runs with `noAck: false` and `nack`s a failed
  message without requeueing, so a poison message is dropped rather than looping. A DLX would let
  those be inspected.
- **`emit` to a dedicated queue is point-to-point, not topic fan-out.** This is the idiomatic Nest
  RMQ approach; a second independent consumer would need a topic exchange.
- **No authentication or rate limiting** on the gateway.
- **Runtime images install from the generated `package.json`** rather than a pruned lockfile, because
  Nx's `prune-lockfile` executor expects a per-app `package.json` this layout does not use. Direct
  dependencies are exact-pinned; transitive ones can drift between builds.
- **No automated tests.**
