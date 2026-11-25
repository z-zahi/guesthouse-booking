#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."

export AWS_PAGER="" MSYS_NO_PATHCONV=1 AWS_DEFAULT_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
unset AWS_SESSION_TOKEN AWS_PROFILE AWS_DEFAULT_PROFILE
export AWS_ENDPOINT_URL=http://localhost:4566

INFRA=infra/floci
BUILD=$INFRA/build
ACCOUNT=000000000000
REGION=$AWS_DEFAULT_REGION
NAME=guesthouse-api
ROLE=guesthouse-api-role
API_NAME=guesthouse-http-api
WEB_BUCKET=guesthouse-web
PHOTOS_BUCKET=guesthouse-photos
WEB_URL=http://$WEB_BUCKET.s3-website-us-east-1.localhost.floci.io:4566

[ -f "$INFRA/floci.env" ] || { echo "Copy $INFRA/floci.env.example to $INFRA/floci.env and fill it in first."; exit 1; }
[ "$(aws sts get-caller-identity --query Account --output text)" = "$ACCOUNT" ]
mkdir -p "$BUILD"
ENV_DIR=$(mktemp -d "$BUILD/env.XXXXXX")
trap 'rm -rf "$ENV_DIR"' EXIT

echo "1/7 S3 buckets"
for bucket in "$PHOTOS_BUCKET" "$WEB_BUCKET"; do
  aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1 ||
    aws s3api create-bucket --bucket "$bucket" >/dev/null
  aws s3api put-public-access-block --bucket "$bucket" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
  aws s3api put-bucket-policy --bucket "$bucket" --policy "file://$INFRA/iam/public-read-$bucket.json"
done
aws s3 website "s3://$WEB_BUCKET" --index-document index.html --error-document index.html

echo "2/7 IAM role"
logs_policy="arn:aws:iam::$ACCOUNT:policy/guesthouse-lambda-logs"
photos_policy="arn:aws:iam::$ACCOUNT:policy/guesthouse-photos"
aws iam get-policy --policy-arn "$logs_policy" >/dev/null 2>&1 ||
  aws iam create-policy --policy-name guesthouse-lambda-logs --policy-document "file://$INFRA/iam/lambda-logs-policy.json" >/dev/null
aws iam get-policy --policy-arn "$photos_policy" >/dev/null 2>&1 ||
  aws iam create-policy --policy-name guesthouse-photos --policy-document "file://$INFRA/iam/photos-policy.json" >/dev/null
aws iam get-role --role-name "$ROLE" >/dev/null 2>&1 ||
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document "file://$INFRA/iam/trust-policy.json" >/dev/null
aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$logs_policy"
aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$photos_policy"

echo "3/7 Lambda code"
(cd backend && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
node "$INFRA/zip-lambda.js"

echo "4/7 API Gateway HTTP API"
api_id=$(aws apigatewayv2 get-apis --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text)
if [[ -z "$api_id" || "$api_id" == None ]]; then
  api_id=$(aws apigatewayv2 create-api --name "$API_NAME" --protocol-type HTTP --query ApiId --output text)
fi
api_url="http://$api_id.execute-api.localhost.floci.io:4566"
aws apigatewayv2 get-stage --api-id "$api_id" --stage-name '$default' >/dev/null 2>&1 ||
  aws apigatewayv2 create-stage --api-id "$api_id" --stage-name '$default' --auto-deploy >/dev/null

echo "5/7 Lambda function"
env_file="$ENV_DIR/env.json"
node -e '
  const fs = require("node:fs");
  const [file, out, webUrl] = process.argv.slice(1);
  const all = require("node:util").parseEnv(fs.readFileSync(file, "utf8"));
  if (!all.DATABASE_URL || !all.JWT_SECRET) throw new Error("Set DATABASE_URL and JWT_SECRET in floci.env");
  const vars = {
    NODE_ENV: "production",
    DATABASE_URL: all.DATABASE_URL,
    JWT_SECRET: all.JWT_SECRET,
    CORS_ORIGINS: [webUrl, all.CORS_ORIGINS].filter(Boolean).join(","),
    PHOTOS_BUCKET: "guesthouse-photos",
    AWS_ENDPOINT_URL: all.AWS_ENDPOINT_URL || "http://floci:4566",
    PHOTOS_PUBLIC_URL: all.PHOTOS_PUBLIC_URL || "http://localhost:4566",
    RESEND_API_KEY: all.RESEND_API_KEY,
    MAIL_FROM: all.MAIL_FROM,
    HOLIDAY_COUNTRY: all.HOLIDAY_COUNTRY || "EG",
  };
  for (const k of Object.keys(vars)) if (!vars[k]) delete vars[k];
  fs.writeFileSync(out, JSON.stringify({ Variables: vars }));
' "$INFRA/floci.env" "$env_file" "$WEB_URL"

zip="fileb://$BUILD/api.zip"
if aws lambda get-function --function-name "$NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$NAME" --zip-file "$zip" >/dev/null
  aws lambda wait function-updated --function-name "$NAME"
  aws lambda update-function-configuration --function-name "$NAME" --handler server.handler --environment "file://$env_file" >/dev/null
  aws lambda wait function-updated --function-name "$NAME"
else
  aws lambda create-function --function-name "$NAME" --runtime nodejs24.x --handler server.handler \
    --role "arn:aws:iam::$ACCOUNT:role/$ROLE" --zip-file "$zip" --timeout 20 --memory-size 512 \
    --environment "file://$env_file" >/dev/null
  aws lambda wait function-active --function-name "$NAME"
fi
aws logs create-log-group --log-group-name "/aws/lambda/$NAME" 2>/dev/null || true

echo "6/7 API routes"
arn="arn:aws:lambda:$REGION:$ACCOUNT:function:$NAME"
integration=$(aws apigatewayv2 get-integrations --api-id "$api_id" \
  --query "Items[?IntegrationUri=='$arn'].IntegrationId | [0]" --output text)
if [[ -z "$integration" || "$integration" == None ]]; then
  integration=$(aws apigatewayv2 create-integration --api-id "$api_id" --integration-type AWS_PROXY \
    --payload-format-version 2.0 --integration-uri "$arn" --query IntegrationId --output text)
fi
if ! aws lambda get-policy --function-name "$NAME" --query Policy --output text 2>/dev/null | grep -q apigw-invoke; then
  aws lambda add-permission --function-name "$NAME" --statement-id apigw-invoke --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT:$api_id/*" >/dev/null
fi
for key in 'ANY /' 'ANY /{proxy+}'; do
  route=$(aws apigatewayv2 get-routes --api-id "$api_id" --query "Items[?RouteKey=='$key'].RouteId | [0]" --output text)
  if [[ -z "$route" || "$route" == None ]]; then
    aws apigatewayv2 create-route --api-id "$api_id" --route-key "$key" --target "integrations/$integration" >/dev/null
  else
    aws apigatewayv2 update-route --api-id "$api_id" --route-id "$route" --target "integrations/$integration" >/dev/null
  fi
done
curl -fsS --retry 3 --retry-all-errors "$api_url/api/health"
curl -fsS "$api_url/api/rooms" >/dev/null

echo "7/7 Frontend"
(cd frontend && npm ci --no-audit --no-fund --loglevel=error && VITE_API_URL="$api_url" VITE_HASH_ROUTER=true npm run build)
aws s3 sync frontend/dist "s3://$WEB_BUCKET" --delete
curl -fsS "$WEB_URL/index.html" >/dev/null
printf '\nAPI      %s\nWebsite  %s/\nLogs     aws logs tail /aws/lambda/guesthouse-api --since 30m\n' "$api_url" "$WEB_URL"
