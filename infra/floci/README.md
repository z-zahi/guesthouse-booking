# Deploy on Floci

Floci emulates AWS on your machine (`http://localhost:4566`). The whole API runs as one Lambda function, zipped from `backend` with its `node_modules`. Its handler is `server.handler`, the `handler` export of the same `server.js` used locally and on Vercel (serverless-http wraps the Express app). One API Gateway HTTP API sends every request to the function, and the React app is served from S3.

| Resource             | Name                         | Purpose                                                                                       |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| Lambda function      | `guesthouse-api`             | The Express API, handler `server.handler`                                                     |
| IAM role             | `guesthouse-api-role`        | CloudWatch logs (`guesthouse-lambda-logs`) and the photos bucket (`guesthouse-photos` policy) |
| CloudWatch log group | `/aws/lambda/guesthouse-api` | Logs of every request                                                                         |
| API Gateway HTTP API | `guesthouse-http-api`        | Routes `ANY /` and `ANY /{proxy+}` to the function, stage `$default`                          |
| S3 bucket            | `guesthouse-web`             | Static website hosting for the React build                                                    |
| S3 bucket            | `guesthouse-photos`          | Room photos, written only by the Lambda role                                                  |

The frontend is built with `VITE_API_URL` set to the API URL.

## Files

| File                 | Purpose                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `docker-compose.yml` | Starts Floci (and an optional local Postgres with the `local-db` profile)                |
| `deploy.sh`          | Creates or updates every resource above, in 7 numbered steps                             |
| `reset.sh`           | Deletes everything `deploy.sh` created                                                   |
| `zip-lambda.js`      | Builds `build/api.zip` from `backend`, without `.env` (`node infra/floci/zip-lambda.js`) |
| `floci.env.example`  | Settings the function needs, copy to `floci.env` (never committed)                       |
| `iam/`               | Trust policy, logs policy, photos policy, public-read bucket policies                    |

## Prepare

Install Docker with Compose, the AWS CLI, and Node.js 22 or later. Run every command from the project folder in Git Bash or a terminal.

```bash
npm run setup
docker compose -f infra/floci/docker-compose.yml up -d
cp infra/floci/floci.env.example infra/floci/floci.env
```

In `infra/floci/floci.env` set `DATABASE_URL` and `JWT_SECRET`. Use a separate Neon branch for Floci and load the schema and demo data into it once with `npm run db:seed` (set `DATABASE_URL` in `backend/.env` to that branch first).

To use a local Postgres instead of Neon, start Compose with the `local-db` profile:

```bash
export FLOCI_DB_PASSWORD="$(openssl rand -hex 18)"
docker compose -f infra/floci/docker-compose.yml --profile local-db up -d
```

Seed it through `localhost:55432`, and in `floci.env` use the host name the Lambda containers see, `postgres://guesthouse:<password>@postgres:5432/guesthouse`.

## Deploy and verify

```bash
bash infra/floci/deploy.sh
```

The script prints the API and website URLs after `/api/health` and `/api/rooms` answer. Rerun it to update code or settings. Then:

- Open the website URL and run the main scenario (search, request, confirm, calendar).
- Run the Postman collection with `baseUrl` set to the API URL, or `npm test` with `TEST_API_URL` set to it.
- Read the logs with `aws logs tail /aws/lambda/guesthouse-api --since 30m`.
- Look at the function, routes and log group in Floci Dash at `http://localhost:4566/_floci/ui`.

The site is built with hash routes (`VITE_HASH_ROUTER=true`) so links survive a refresh on S3.

## Reset

```bash
bash infra/floci/reset.sh
```

## Notes

- Floci stores IAM policies but does not enforce them by default. The role still documents what the function may do.
- Resend needs `RESEND_API_KEY` and a verified sender in `MAIL_FROM`. Without a key, emails are skipped and recorded as `skipped`.
- The website and API URL formats are the ones Floci documents. If the website does not open, Floci Dash shows the exact URL under S3.
