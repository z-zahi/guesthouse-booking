#!/usr/bin/env bash
set -euo pipefail
export AWS_PAGER="" MSYS_NO_PATHCONV=1 AWS_DEFAULT_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
unset AWS_SESSION_TOKEN AWS_PROFILE AWS_DEFAULT_PROFILE
export AWS_ENDPOINT_URL=http://localhost:4566
ACCOUNT=000000000000

[ "$(aws sts get-caller-identity --query Account --output text)" = "$ACCOUNT" ]
api_id=$(aws apigatewayv2 get-apis --query "Items[?Name=='guesthouse-http-api'].ApiId | [0]" --output text)
if [[ -n "$api_id" && "$api_id" != None ]]; then
  aws apigatewayv2 delete-api --api-id "$api_id"
fi

logs_policy=arn:aws:iam::$ACCOUNT:policy/guesthouse-lambda-logs
photos_policy=arn:aws:iam::$ACCOUNT:policy/guesthouse-photos
if aws lambda get-function --function-name guesthouse-api >/dev/null 2>&1; then
  aws lambda delete-function --function-name guesthouse-api
fi
aws logs delete-log-group --log-group-name /aws/lambda/guesthouse-api 2>/dev/null || true
if aws iam get-role --role-name guesthouse-api-role >/dev/null 2>&1; then
  aws iam detach-role-policy --role-name guesthouse-api-role --policy-arn "$logs_policy" 2>/dev/null || true
  aws iam detach-role-policy --role-name guesthouse-api-role --policy-arn "$photos_policy" 2>/dev/null || true
  aws iam delete-role --role-name guesthouse-api-role
fi
for policy in "$logs_policy" "$photos_policy"; do
  if aws iam get-policy --policy-arn "$policy" >/dev/null 2>&1; then
    aws iam delete-policy --policy-arn "$policy"
  fi
done

for bucket in guesthouse-web guesthouse-photos; do
  if aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    aws s3 rb "s3://$bucket" --force
  fi
done
echo "Floci resources removed."
