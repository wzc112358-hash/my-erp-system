# GitHub Actions CI/CD 部署指南

本文档详细介绍如何使用 GitHub Self-hosted Runner 实现自动化构建部署。

## 目录

1. [架构概述](#架构概述)
2. [阿里云配置](#阿里云配置)
3. [GitHub 配置](#github-配置)
4. [服务器配置](#服务器配置)
5. [部署流程](#部署流程)

---

## 架构概述

```
┌─────────────┐     PR/Merge      ┌─────────────────────┐
│  Developer  │ ────────────────► │   GitHub Actions    │
└─────────────┘                   │  (Self-hosted Runner)│
                                   └─────────┬───────────┘
                                             │ Build & Push
                                             ▼
                                   ┌─────────────────────┐
                                   │ 阿里云 ACR 镜像仓库  │
                                   └─────────┬───────────┘
                                             │ Deploy
                                             ▼
                                   ┌─────────────────────┐
                                   │   阿里云服务器        │
                                   │  docker-compose    │
                                   └─────────────────────┘
```

---

## 阿里云配置

### 1. 创建容器镜像服务实例

1. 登录 [阿里云容器镜像服务控制台](https://cr.console.aliyun.com/)
2. 创建个人版实例或企业版实例
3. 获取实例信息：
   - **实例ID**: `your-acr-instance-id`
   - **地域**: `cn-hangzhou`
   - **访问域名**: `your-acr-instance-id.registry.cn-hangzhou.aliyuncs.com`

### 2. 创建镜像仓库

1. 在 ACR 控制台创建命名空间，如 `erp-system`
2. 创建镜像仓库：
   - **frontend**: `your-acr-instance-id.registry.cn-hangzhou.aliyuncs.com/erp-system/frontend`
   - **pocketbase**: `your-acr-instance-id.registry.cn-hangzhou.aliyuncs.com/erp-system/pocketbase`

### 3. 获取镜像凭证

1. 在 ACR 实例设置中设置访问凭证
2. 获取用户名和密码，后续用于 GitHub Secrets

---

## GitHub 配置

### 1. 添加 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `ALIYUN_ACR_INSTANCE_ID` | ACR 实例ID | `cr-xxxxx` |
| `ALIYUN_ACR_REGISTRY` | ACR 镜像仓库地址 | `cr-xxxxx.registry.cn-hangzhou.aliyuncs.com` |
| `ALIYUN_ACR_USERNAME` | ACR 用户名 | `your-username` |
| `ALIYUN_ACR_PASSWORD` | ACR 密码 | `your-password` |
| `SERVER_HOST` | 服务器 IP | `47.xxx.xxx.xxx` |
| `SERVER_USER` | SSH 用户名 | `root` |
| `SERVER_SSH_KEY` | SSH 私钥 | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

### 2. 配置 Self-hosted Runner

#### 2.1 创建 Runner

```bash
# 在服务器上创建 Runner 目录
mkdir -p /home/{user}/actions-runner && cd /home/{user}/actions-runner

# 下载 Runner
curl -o actions-runner-linux-x64-2.321.0.tar.gz https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz
tar -xzf actions-runner-linux-x64-2.321.0.tar.gz

# 配置 Runner（交互式）
./config.sh --url https://github.com/{owner}/{repo} --token {TOKEN}
# 注意：Token 需要在 GitHub 仓库设置 -> Actions -> Runners 中生成

# 安装为服务
sudo ./svc.sh install
sudo ./svc.sh start
```

#### 2.2 安装 Docker（如果服务器没有）

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker
```

#### 2.3 安装 docker-compose

```bash
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

---

## 服务器配置

### 1. 创建部署目录

```bash
sudo mkdir -p /opt/erp-system
sudo chown -R $USER:$USER /opt/erp-system
```

### 2. 配置 SSH 免密登录

```bash
# 本地生成密钥对（如已有可跳过）
ssh-keygen -t ed25519 -C "github-actions"

# 上传公钥到服务器
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@SERVER_IP

# 或者手动添加
cat ~/.ssh/id_ed25519.pub | ssh root@SERVER_IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### 3. 配置服务器上的 docker-compose.yml

在 `/opt/erp-system/docker-compose.yml`:

```yaml
version: '3.8'

services:
  frontend:
    image: ${ACR_INSTANCE_ID}.registry.cn-hangzhou.aliyuncs.com/erp-system/frontend:latest
    networks:
      - web

  pocketbase:
    image: ${ACR_INSTANCE_ID}.registry.cn-hangzhou.aliyuncs.com/erp-system/pocketbase:latest
    ports:
      - "8090:8090"
    volumes:
      - ./backend/pb_data:/app/pb_data
    networks:
      - web
    restart: unless-stopped

  traefik:
    image: traefik:v2.9
    container_name: traefik
    command:
      - "--configFile=/etc/traefik/traefik.yml"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - ./traefik:/etc/traefik
    networks:
      - web
    restart: unless-stopped
    depends_on:
      - frontend
      - pocketbase

networks:
  web:
    driver: bridge
```

---

## 部署流程

### 1. 开发流程

```
1. 从 master 创建 feature 分支
   git checkout -b feature/your-feature

2. 开发并提交代码
   git add .
   git commit -m "feat: add new feature"

3. 推送到远程并创建 PR
   git push -u origin feature/your-feature

4. 在 GitHub 上创建 Pull Request
```

### 2. CI/CD 流程说明

当创建 PR 或 push 到 feature 分支时：

1. **触发 CI**: GitHub Actions 自动运行
2. **构建镜像**: 在 Self-hosted Runner 上构建 Docker 镜像
3. **推送镜像**: 将镜像推送到阿里云 ACR
4. **部署**: SSH 登录服务器，拉取最新镜像并重启服务

---

## GitHub Actions Workflow 配置

创建文件 `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  pull_request:
    branches: [master]
    types: [opened, synchronize, reopened]
  push:
    branches: [master]

env:
  ACR_INSTANCE_ID: ${{ secrets.ALIYUN_ACR_INSTANCE_ID }}
  ACR_REGISTRY: ${{ secrets.ALIYUN_ACR_REGISTRY }}
  ACR_USERNAME: ${{ secrets.ALIYUN_ACR_USERNAME }}
  ACR_PASSWORD: ${{ secrets.ALIYUN_ACR_PASSWORD }}

jobs:
  build-and-push:
    runs-on: self-hosted
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to ACR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.ACR_REGISTRY }}
          username: ${{ env.ACR_USERNAME }}
          password: ${{ env.ACR_PASSWORD }}

      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: |
            ${{ env.ACR_REGISTRY }}/erp-system/frontend:${{ github.sha }}
            ${{ env.ACR_REGISTRY }}/erp-system/frontend:latest
          cache-from: type=registry,ref=${{ env.ACR_REGISTRY }}/erp-system/frontend:latest
          cache-to: type=inline

      - name: Build and push pocketbase
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: |
            ${{ env.ACR_REGISTRY }}/erp-system/pocketbase:${{ github.sha }}
            ${{ env.ACR_REGISTRY }}/erp-system/pocketbase:latest

  deploy:
    needs: build-and-push
    runs-on: self-hosted
    if: github.event_name == 'pull_request'
    
    steps:
      - name: Deploy to server
        env:
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
          SSH_KEY: ${{ secrets.SERVER_SSH_KEY }}
          ACR_INSTANCE_ID: ${{ secrets.ALIYUN_ACR_INSTANCE_ID }}
          ACR_REGISTRY: ${{ secrets.ALIYUN_ACR_REGISTRY }}
        run: |
          # 创建临时 SSH 密钥文件
          echo "$SSH_KEY" > /tmp/deploy_key
          chmod 600 /tmp/deploy_key
          
          # SSH 登录服务器执行部署
          ssh -o StrictHostKeyChecking=no -i /tmp/deploy_key ${SERVER_USER}@${SERVER_HOST} << 'EOF'
            cd /opt/erp-system
            
            # 拉取最新 docker-compose.yml
            git pull origin master
            
            # 重新加载 .env 文件中的镜像地址
            export ACR_INSTANCE_ID="$ACR_INSTANCE_ID"
            export ACR_REGISTRY="$ACR_REGISTRY"
            
            # 登录 ACR
            docker login --username=${ACR_USERNAME} --password=${ACR_PASSWORD} ${ACR_REGISTRY}
            
            # 拉取最新镜像
            docker-compose pull frontend pocketbase
            
            # 重启服务
            docker-compose up -d --no-build
            
            # 清理旧镜像
            docker image prune -f
          EOF
          
          # 清理临时文件
          rm -f /tmp/deploy_key
```

---

## 验证部署

### 查看容器状态

```bash
docker ps
docker-compose -f /opt/erp-system/docker-compose.yml ps
```

### 查看日志

```bash
docker-compose -f /opt/erp-system/docker-compose.yml logs -f
```

### 检查服务

```bash
# 检查前端
curl -I http://localhost

# 检查后端
curl -I http://localhost:8090
```

---

## 常见问题

### 1. Runner 离线

```bash
# 在 Runner 服务器上检查
cd ~/actions-runner
./run.sh

# 或检查服务状态
sudo ./svc.sh status
```

### 2. 镜像拉取失败

- 检查 ACR 访问凭证是否正确
- 检查服务器网络是否能访问 ACR
- 手动测试: `docker login ${ACR_REGISTRY}`

### 3. 部署后服务异常

```bash
# 查看容器日志
docker-compose logs -f --tail=100

# 重启特定服务
docker-compose restart frontend
```

---

## 配置检查清单

部署前确认以下配置：

- [ ] 阿里云 ACR 实例已创建
- [ ] 镜像仓库已创建
- [ ] GitHub Secrets 已配置
- [ ] Self-hosted Runner 已安装并运行
- [ ] 服务器 Docker 和 docker-compose 已安装
- [ ] SSH 免密登录已配置
- [ ] 部署目录已创建
