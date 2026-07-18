# Kitoz Burger — PocketBase backend for Railway
# Serves the kitchen dashboard (pb_public/) + the orders API + realtime.
#
# ⚠️ Set PB_VERSION to the latest PocketBase release:
#    https://github.com/pocketbase/pocketbase/releases
FROM alpine:3.20

ARG PB_VERSION=0.22.21

RUN apk add --no-cache unzip ca-certificates

# Download PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/

# Dashboard (served at the site root) — pb_data holds the database (attach a
# Railway Volume mounted at /pb/pb_data so orders survive redeploys).
COPY ./pb_public /pb/pb_public

EXPOSE 8080

# Railway injects $PORT; fall back to 8080 locally.
CMD ["sh", "-c", "/pb/pocketbase serve --http=0.0.0.0:${PORT:-8080}"]
