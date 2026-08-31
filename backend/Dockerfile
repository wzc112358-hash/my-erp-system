FROM golang:1.24-alpine AS builder

ARG GOPROXY=https://goproxy.cn,direct
ENV GOPROXY=${GOPROXY}

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY main.go ./
COPY hooks ./hooks
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/pocketbase .

FROM alpine:3.22

WORKDIR /app
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /out/pocketbase ./pocketbase
COPY pb_migrations ./pb_migrations

EXPOSE 8090
CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090"]
