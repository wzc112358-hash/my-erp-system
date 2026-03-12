# 使用 node 镜像作为构建阶段
FROM node:20-alpine AS builder

# 设置 npm 镜像
RUN npm config set registry https://registry.npmmirror.com

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 构建项目
RUN npm run build

# 使用 nginx 作为运行阶段
FROM nginx:alpine

# 复制构建产物到 nginx 默认目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露 80 端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
