# Vibe Restaurant Manager

Full-stack restaurant control room: menu, reservations, and order rail in one page. Frontend is vanilla HTML/CSS/JS; backend is Express + SQLite for persistence.

## Quick Start
1) Install deps (already vendored in `package-lock.json`):  
   `npm install`
2) Start the server (serves API + static UI):  
   `npm start`
3) Open http://localhost:4000 in your browser.

The database lives at `data/vibe.db`. On first launch the server auto-seeds demo dishes, reservations, and orders. If the DB is missing, it will be recreated and reseeded.

### Dev mode
- Auto-reload server: `npm run dev`
- Reset database: `npm run db:reset` (next start will reseed)
- Frontend-only static host (expects API elsewhere): `npm run client` (serves at http://localhost:4173). Point it to a remote API by defining `window.API_BASE` in a script tag or devtools console, e.g. `window.API_BASE='https://your-api.example.com/api';` then reload.

## API Overview
Base URL: `http://localhost:4000/api`

- `GET /menu` - list dishes  
- `POST /menu` - create dish  
- `PUT /menu/:id` - update dish  
- `DELETE /menu/:id` - delete dish (also removes related order items)

- `GET /reservations` - list reservations  
- `POST /reservations` - create reservation  
- `PUT /reservations/:id` - update reservation  
- `DELETE /reservations/:id` - delete reservation (unlinks from orders)

- `GET /orders` - list orders with items  
- `POST /orders` - create order `{ table, reservationId?, status, taxRate, items:[{menuId,qty}] }`  
- `PUT /orders/:id` - update order (replaces items)  
- `DELETE /orders/:id` - delete order

- `GET /health` - simple check

## Frontend Notes
- The UI boots by fetching data from the API at `window.API_BASE || /api`. If the API is unreachable it falls back to the last cached state in `localStorage`.
- CRUD in the forms calls the API then refreshes the board. Menu items drive selectable order lines; keep at least one dish to open orders.

## Deploying
- Production: run `npm install --production` and `npm start` on a server. The app is static + API in one process; reverse-proxy with Nginx/Caddy if desired.
- Docker (single container):  
  - Build: `docker build -t vibe .`  
  - Run: `docker run -p 4000:4000 -v "$(pwd)/data:/app/data" --name vibe vibe`
- Docker Compose: `docker-compose up --build` (persists SQLite at `./data`).
- Database: SQLite file is safe for single-instance deployments. For multi-instance, swap `sqlite3` usage in `db.js` for Postgres/MySQL and adjust queries.

## Testing / Lint
- Quick syntax check: `node -e "require('./assets/app.js')"`
- API smoke (while server is running): `curl http://localhost:4000/api/health`

