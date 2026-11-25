# Guesthouse Room Booking System

Team 06, Introduction to Cloud Computing (25CSCI37H).

Small guesthouses list rooms with photos, seasonal prices and stay rules. Guests search for free rooms and request stays, staff confirm or reject them, and a calendar shows occupancy. Payment is made at the guesthouse on arrival, online payment is out of scope.

## Areas and owners

The backend is one Express REST API, deployed as a single service. Each team member owns one area of it, with its own router and services:

| Area                       | Owner                  | Code in `backend/`                                                                   | Paths                                                               |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Auth                       | Shared, led by Youssef | `routes/auth.js`, `routes/admin.js`, `userService`, `guesthouseService`              | `/api/users`, `/api/sessions`, `/api/admin`                         |
| Room Catalogue and Pricing | Ali                    | `routes/rooms.js`, `roomService`, `pricingService`, `storageService`                 | `/api/rooms`                                                        |
| Booking                    | Youssef                | `routes/bookings.js`, `bookingService`, `emailService`                               | `/api/bookings`                                                     |
| Availability and Calendar  | Omar                   | `routes/availability.js`, `availabilityService`, `calendarService`, `holidayService` | `/api/availability`, `/api/blocks`, `/api/calendar`, `/api/reports` |

The areas call each other's services directly, inside the same app:

- **Booking** prices a stay with `pricingService.quote`, which also checks that the dates are free.
- **Catalogue** keeps only free rooms in a dated search with `availabilityService`, and counts upcoming confirmed stays with `bookingService.countUpcomingConfirmed` before a room is deactivated.
- **Availability** reads bookings for the calendar and reports.

One middleware verifies the JWT on every request.

## Tech stack

- **Frontend:** React (built with Vite), plain CSS, Base UI dialogs
- **Backend:** Node.js, Express 5 (ES modules), zod, dotenv, jsonwebtoken, bcryptjs, pg, serverless-http
- **Database:** Neon PostgreSQL, one database where each table belongs to one area
- **Cloud:** Vercel (main), plus Floci with Lambda, API Gateway, S3, IAM and CloudWatch Logs (additional)
- **External services:** Resend (email), Nager.Date (public holidays), Vercel Blob (room photos)

## Repository structure

```
backend/
  server.js           App entry with middleware, routers, 404 and error handler. Listens on PORT (default 3000)
                      locally, default export for Vercel, `handler` export for AWS Lambda (Floci)
  http.js             HttpError, JWT authentication, requireRole, isStaffOf, shared zod schemas
  routes/             One express.Router per area: auth.js, admin.js, rooms.js, bookings.js, availability.js
  services/           Data access (SQL) and business logic, no HTTP. db.js (pool, room lock), dates.js and
                      one service each for users, guesthouses, rooms, pricing, storage, bookings, email,
                      availability, calendar and holidays
  db/                 schema.sql, setup.js, seed.js (demo data)
  requests.http       Example requests for the VS Code REST Client
  package.json        npm run dev runs the API with --watch
  .env.example        Settings, copy to backend/.env (never committed)
frontend/             React app, src/config.js holds the API address, vercel.json security headers
docs/                 api-contract.md, api-test-plan.md
tests/                postman/ collection and environment, booking-concurrency.test.js
infra/floci/          Floci deployment (docker-compose, deploy.sh, reset.sh, zip-lambda.js, IAM policies)
```

Requests are validated with zod. Every error uses the same shape: `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }`. The codes and the file that produces each one are listed in `docs/api-contract.md`.

## Run locally

You need Node.js 22 or later and a PostgreSQL database (a Neon development branch, or a local Postgres).

1. Install everything:

   ```bash
   npm run setup
   ```

2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and `JWT_SECRET`.

3. Create the tables and the demo data:

   ```bash
   npm run db:seed
   ```

4. Start the API and the frontend:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:5173`. The API runs on `http://localhost:3000` and answers `GET /api/health`.

The demo accounts are listed at the top of `backend/db/seed.js`.

## Lint and format

The whole repository uses oxc, `oxlint` for linting and `oxfmt` for formatting, configured in `.oxlintrc.json` and `.oxfmtrc.json` at the root.

```bash
npm run lint
```

```bash
npm run format
```

`npm run format:check` reports unformatted files without changing them.

## Deploy on Vercel (main deployment)

Import the same GitHub repository into Vercel twice:

| Project          | Root Directory | Environment variables                                                                                                                                                           |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guesthouse-api` | `backend`      | `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `NODE_ENV=production`, `BLOB_READ_WRITE_TOKEN` (connect a Vercel Blob store), `RESEND_API_KEY`, `MAIL_FROM`, `HOLIDAY_COUNTRY=EG` |
| `guesthouse-web` | `frontend`     | None, the frontend has no secrets                                                                                                                                               |

Vercel's Express support picks up the default export of `server.js`, so the whole API runs as one Vercel Function and no `vercel.json` is needed in `backend`.

1. Create the Neon project and run `npm run db:seed` with `backend/.env` pointing at it.
2. Deploy `guesthouse-api` and note its production domain, for example `https://guesthouse-api.vercel.app`.
3. In `frontend/src/config.js` and in the `connect-src` list of `frontend/vercel.json`, replace `YOUR-API-PROJECT` with that domain. Then deploy `guesthouse-web`.
4. Set `CORS_ORIGINS` in `guesthouse-api` to `http://localhost:5173,https://guesthouse-web.vercel.app` (your frontend domain) and redeploy. Environment variable changes only apply to new deployments.
5. Check `https://<api domain>/api/health`, then run the Postman collection with `baseUrl` set to the API domain.

Secrets (`DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`) live only in `backend/.env` on your machine and in the Vercel dashboard, never in the code.

## Deploy on Floci (additional deployment)

The whole API runs as one Lambda function, `guesthouse-api`, with one IAM role and one CloudWatch log group, behind an API Gateway HTTP API. See `infra/floci/README.md`.

## Testing

- **Postman:** import `tests/postman/guesthouse.postman_collection.json` and `tests/postman/local.postman_environment.json`. Run the whole collection (57 requests) with the API running, after `npm run db:seed`. The one variable `baseUrl` is `http://localhost:3000` locally and the API or API Gateway URL in the cloud. The test IDs match `docs/api-test-plan.md` and section 9 of the report.
- **Concurrency test:** with the API running, `npm test` runs `tests/booking-concurrency.test.js`, which confirms two overlapping stays at the same moment and checks that only one succeeds. Set `TEST_API_URL` to run it against a deployment.
- **REST Client:** `backend/requests.http` holds example requests for the VS Code REST Client.
