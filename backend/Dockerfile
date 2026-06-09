FROM alpine:latest

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY pocketbase .
COPY pb_migrations ./pb_migrations

EXPOSE 8090

CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090"]
