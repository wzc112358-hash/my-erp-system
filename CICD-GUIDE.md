# GitHub Actions CI/CD 部署指南

本文档详细介绍如何使用 GitHub Self-hosted Runner 实现自动化构建部署。

## 目录

1. [架构概述](#架构概述)
2. [GitHub 配置](#github-配置)
3. [服务器配置](#服务器配置)
4. [部署流程](#部署流程)

---

## 架构概述

```
┌─────────────┐     PR/Merge      ┌─────────────────────┐
│  Developer  │ ────────────────► │   GitHub Actions    │
└─────────────┘                   │  (Self-hosted Runner)│
                                    └─────────┬───────────┘
                                              │ Build & SCP
                                              ▼
                                    ┌─────────────────────┐
                                    │   阿里云服务器        │
                                    │  docker import      │
                                    └─────────────────────┘
```

---

## GitHub 配置

### 1. 添加 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

| Secret Name | Description | Example |
|-------------|-------------|---------|
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

# 创建镜像存储目录
sudo mkdir -p /opt/erp-system/images
sudo chown -R $USER:$USER /opt/erp-system/images
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

### 3. 初始化服务器仓库

```bash
# 在服务器上克隆仓库（或初始化空目录）
cd /opt/erp-system
git init
git remote add origin git@github.com:{owner}/{repo}.git
git fetch origin master
git checkout -b master origin/master

# 后续更新用 git pull 即可
```

### 4. 配置服务器上的 docker-compose.yml

修改 `/opt/erp-system/docker-compose.yml`，将 build 改为 image（本地镜像）:

```yaml
version: '3.8'

services:
  frontend:
    image: erp-frontend:latest
    build:
      context: ./frontend
      dockerfile: Dockerfile
    networks:
      - web

  pocketbase:
    image: erp-pocketbase:latest
    build:
      context: ./backend
      dockerfile: Dockerfile
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
3. **导出镜像**: 导出为 tar.gz 文件
4. **传输镜像**: SCP 传送到服务器
5. **部署**: SSH 登录服务器，加载镜像并重启服务

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

jobs:
  build-and-deploy:
    runs-on: self-hosted
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Build frontend image
        run: |
          docker build -t erp-frontend:latest ./frontend

      - name: Build pocketbase image
        run: |
          docker build -t erp-pocketbase:latest ./backend

      - name: Export frontend image
        run: |
          docker save erp-frontend:latest | gzip > erp-frontend.tar.gz

      - name: Export pocketbase image
        run: |
          docker save erp-pocketbase:latest | gzip > erp-pocketbase.tar.gz

      - name: Copy images to server
        env:
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
          SSH_KEY: ${{ secrets.SERVER_SSH_KEY }}
        run: |
          echo "$SSH_KEY" > /tmp/deploy_key
          chmod 600 /tmp/deploy_key
          
          scp -o StrictHostKeyChecking=no -i /tmp/deploy_key erp-frontend.tar.gz ${SERVER_USER}@${SERVER_HOST}:/opt/erp-system/images/
          scp -o StrictHostKeyChecking=no -i /tmp/deploy_key erp-pocketbase.tar.gz ${SERVER_USER}@${SERVER_HOST}:/opt/erp-system/images/
          
          rm -f /tmp/deploy_key

      - name: Deploy to server
        env:
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
          SSH_KEY: ${{ secrets.SERVER_SSH_KEY }}
        run: |
          echo "$SSH_KEY" > /tmp/deploy_key
          chmod 600 /tmp/deploy_key
          
          ssh -o StrictHostKeyChecking=no -i /tmp/deploy_key ${SERVER_USER}@${SERVER_HOST} << 'EOF'
            cd /opt/erp-system
            
            # 拉取最新代码
            git pull origin master
            
            # 加载镜像
            docker load -i images/erp-frontend.tar.gz
            docker load -i images/erp-pocketbase.tar.gz
            
            # 重新构建并启动（使用本地镜像）
            docker-compose build --no-cache frontend pocketbase
            docker-compose up -d
            
            # 清理旧镜像和 tar 文件
            docker image prune -f
            rm -f images/erp-frontend.tar.gz images/erp-pocketbase.tar.gz
          EOF
          
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

### 2. 镜像加载失败

```bash
# 检查镜像文件
ls -la /opt/erp-system/images/

# 手动加载测试
docker load -i images/erp-frontend.tar.gz
```

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

- [ ] GitHub Secrets 已配置
- [ ] Self-hosted Runner 已安装并运行
- [ ] 服务器 Docker 和 docker-compose 已安装
- [ ] SSH 免密登录已配置
- [ ] 部署目录已创建
- [ ] 服务器仓库已初始化
