# ordering-app

Order CRUD split across three NestJS microservices in an Nx monorepo. RabbitMQ carries both the
request/response traffic and the domain events; Postgres is owned by a single service.

## Architecture

```
                     HTTP :3000
   client ─────────► api-gateway ──────┐
                     (no domain logic) │
                                       ├─ RPC over RMQ ─► order-service ─ event over RMQ ─► notification-service
                     HTTP :3004        │  queue:            (owns Postgres)  queue:            (logs the delivery)
   LLM agent ──────► mcp-server ───────┘  order_queue             │          notifications_queue
                     (MCP tools)                                  ▼
                                                              Postgres
```

| Service | Port | Role |
| --- | --- | --- |
| `api-gateway` | 3000 | HTTP surface for humans and clients. Validates input, maps RPC failures to status codes, serves Swagger. Holds no business rules. |
| `order-service` | 3001 | Owns the orders schema and is the only writer to Postgres. Consumes `order_queue`. |
| `notification-service` | 3002 | Consumes `order.created` from `notifications_queue`. Knows nothing about HTTP or Postgres. |
| `mcp-server` | 3004 | HTTP surface for LLM agents. Exposes the same domain as MCP tools, guarded by a bearer token. Holds no business rules. |
| `libs/contracts` | — | Message patterns, DTOs and response shapes shared by every app, so the wire format is checked at compile time. |

`api-gateway` and `mcp-server` are two edges over the same core: both are thin, both speak RPC to
`order-service` over `order_queue`, and neither owns a business rule. The gateway speaks REST to
clients; the MCP server speaks JSON-RPC to agents.

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

## MCP server

`mcp-server` exposes the same domain to LLM agents over the Model Context Protocol. Endpoint is
`POST http://localhost:3004/mcp` (streamable HTTP), health on `:3004/health`. Every request needs
`Authorization: Bearer $MCP_AUTH_TOKEN`; without it the server answers `401` with a
`WWW-Authenticate` challenge and tells the caller nothing else.

| Tool | Writes | Annotations | RPC pattern |
| --- | --- | --- | --- |
| `list_orders` | no | read-only, idempotent | `orders.findAll` |
| `get_order` | no | read-only, idempotent | `orders.findOne` |
| `create_order` | yes | — | `orders.create` |
| `update_order` | yes | idempotent | `orders.update` |
| `delete_order` | yes | **destructive** | `orders.remove` |

`MCP_ALLOW_WRITES=false` skips registration of the three write tools entirely, so an agent pointed at a
read-only deployment never sees them rather than being told "no" at call time.

Tool inputs are zod schemas built from the same constants as the DTOs (`OrderStatus`, `MAX_LIMIT`,
`DEFAULT_LIMIT`), so a bad argument is rejected at the MCP boundary before it reaches RabbitMQ. Domain
rejections come back as tool errors that keep the original status code, which is what lets a model
correct itself instead of retrying blindly:

```
update_order rejected with 409 CONFLICT: Order is already SHIPPED
```

The destructive/read-only annotations are hints for the client, not enforcement — a client is free to
ignore them, which is the other reason `MCP_ALLOW_WRITES` exists.

### Why it is stateless

The transport runs with `sessionIdGenerator: undefined` and `enableJsonResponse: true`: every `POST`
gets a fresh `McpServer`, answers, and closes. There is no session map to leak and no server-initiated
SSE stream, which is all a CRUD tool surface needs; `GET` and `DELETE /mcp` answer `405`. Session mode
is worth adding back only when a tool needs to stream progress back to the client.

### Talking to it

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3004/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` } },
});

const client = new Client({ name: 'my-agent', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
const result = await client.callTool({
  name: 'create_order',
  arguments: { customerId: 'cust-1', items: [{ sku: 'SKU-A', quantity: 2, unitCents: 500 }] },
});
```

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
| `RABBITMQ_URL` | all four | Broker URL |
| `ORDER_QUEUE` | gateway, mcp-server, order-service | Queue for order RPC |
| `NOTIFICATIONS_QUEUE` | order-service, notification-service | Queue for order events |
| `API_GATEWAY_PORT` / `ORDER_SERVICE_PORT` / `NOTIFICATION_SERVICE_PORT` / `MCP_SERVER_PORT` | respective service | HTTP port |
| `RPC_TIMEOUT_MS` | gateway, mcp-server | How long to wait for order-service |
| `MCP_AUTH_TOKEN` | mcp-server | Bearer token required on `/mcp`, at least 24 characters |
| `MCP_ALLOW_WRITES` | mcp-server | `false` registers only the read-only tools |

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
- **No authentication or rate limiting** on the gateway. `mcp-server` requires a bearer token but has no
  rate limiting either, and the token in `.env.example` and `docker-compose.yml` is a development
  placeholder — replace it before exposing the port anywhere.
- **The MCP server has no per-caller scopes.** `MCP_ALLOW_WRITES` is process-wide, so read-only and
  read-write access means two deployments rather than two tokens. Per-caller scopes belong with real
  OAuth, which is out of scope here.
- **No DNS-rebinding protection on `/mcp`.** Mandatory bearer auth makes it a non-issue for a rebinding
  attacker, who cannot read the token, but a browser-facing deployment should still sit behind a proxy
  that pins `Host` and `Origin`.
- **Runtime images install from the generated `package.json`** rather than a pruned lockfile, because
  Nx's `prune-lockfile` executor expects a per-app `package.json` this layout does not use. Direct
  dependencies are exact-pinned; transitive ones can drift between builds.
- **No automated tests.**
