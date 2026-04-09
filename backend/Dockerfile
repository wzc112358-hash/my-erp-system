# 使用 golang 镜像作为构建阶段
FROM golang:1.24-alpine AS builder

# 设置 Go 代理
ENV GOPROXY=https://goproxy.cn,direct

# 安装 gcc 和 musl-dev (编译 CGO 需要)
RUN apk add --no-cache gcc musl-dev

# 设置工作目录
WORKDIR /app

# 复制 go.mod 和 go.sum
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制源代码
COPY . .

# 构建可执行文件 (CGO_ENABLED=1 是因为 pocketbase 需要)
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o pocketbase .

# 使用轻量级 alpine 镜像运行
FROM alpine:latest

# 安装 ca-certificates (HTTPS 需要)
RUN apk add --no-cache ca-certificates

# 设置工作目录
WORKDIR /app

# 从 builder 阶段复制可执行文件
COPY --from=builder /app/pocketbase .

# 暴露 8090 端口
EXPOSE 8090

# 启动 PocketBase (绑定到所有接口)
CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090"]
