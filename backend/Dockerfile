FROM alpine:latest

WORKDIR /app
COPY pocketbase ./pocketbase
COPY pb_migrations ./pb_migrations

EXPOSE 8090
CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090"]
