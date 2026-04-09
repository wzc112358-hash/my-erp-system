# GitHub Self-hosted Runner CI/CD 部署指南

## 目录

1. [架构概述](#1-架构概述)
2. [阿里云服务器准备](#2-阿里云服务器准备)
3. [GitHub Self-hosted Runner 配置](#3-github-self-hosted-runner-配置)
4. [GitHub Secrets 配置](#4-github-secrets-配置)
5. [CI/CD Workflow 详解](#5-cicd-workflow-详解)
6. [完整 Workflow 配置](#6-完整-workflow-配置)
7. [部署流程演示](#7-部署流程演示)
8. [故障排查](#8-故障排查)

---

## 1. 架构概述

```
┌─────────────┐     PR/Merge      ┌─────────────────────┐
│  Developer  │ ───────────────► │   GitHub Actions   │
│ (feature/)  │                  │  (self-hosted runner)│
└─────────────┘                  └──────────┬──────────┘
                                             │
                                             ▼
                                    ┌─────────────────────┐
                                    │   Build Docker      │
                                    │   Images (tar.gz)  │
                                    └──────────┬──────────┘
                                               │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
                    ▼                           ▼                           ▼
           ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
           │  Upload via   │         │  Upload via   │         │   SCP to       │
           │  GitHub       │         │  GitHub        │         │   Server       │
           └───────┬────────┘         └───────┬────────┘         └────────┬────────┘
                   │                           │                           │
                   └───────────────────────────┼───────────────────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │   Aliyun Server     │
                                    │  - Load tar.gz      │
                                    │  - Docker Compose   │
                                    │  - Restart Services │
                                    └─────────────────────┘
```

---

## 2. 阿里云服务器准备

### 2.1 安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 启动 Docker
systemctl start docker
systemctl enable docker

# 添加当前用户到 docker 组（可选）
sudo usermod -aG docker $USER
```

### 2.2 安装 Docker Compose

```bash
# 安装 Docker Compose V2
mkdir -p ~/.docker/cli-plugins/
curl -SL https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose

# 验证安装
docker compose version
```

### 2.3 创建部署目录

```bash
# 创建项目目录结构
sudo mkdir -p /root/{images,backup,logs}

# 设置目录权限（假设使用 root 用户部署）
sudo chown -R root:root /root
sudo chmod -R 755 /root
```

### 2.4 配置服务器 SSH 密钥

```bash
# 在服务器上生成 SSH 密钥（如果还没有）
ssh-keygen -t ed25519 -C "github-runner@aliyun" -f ~/.ssh/id_ed25519

# 将公钥添加到 authorized_keys
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys

# 私钥留给本地 GitHub Secrets 使用
cat ~/.ssh/id_ed25519
```

### 2.5 防火墙配置

```bash
# 开放必要端口
sudo firewall-cmd --permanent --add-port=80/tcp   # HTTP
sudo firewall-cmd --permanent --add-port=443/tcp # HTTPS
sudo firewall-cmd --permanent --add-port=8090/tcp # PocketBase (可选)
sudo firewall-cmd --permanent --add-port=8080/tcp # Traefik Dashboard (可选)

# 重载防火墙
sudo firewall-cmd --reload
```

---

## 3. GitHub Self-hosted Runner 配置

### 3.1 在 GitHub 仓库添加 Self-hosted Runner

1. 进入 GitHub 仓库 → Settings → Actions → Runners
2. 点击 "New self-hosted runner"
3. 选择 Linux x64
4. 按照指示下载并配置

### 3.2 安装 Runner

```bash
# 创建运行目录
mkdir -p actions-runner && cd actions-runner

# 下载 Runner（选择对应版本）
# 链接在 GitHub Actions Runners 页面获取
curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz

# 解压
tar xzf ./actions-runner.tar.gz

# 配置 Runner
./config.sh --url https://github.com/YOUR_USERNAME/my-erp-system --token YOUR_TOKEN

# 安装为服务（推荐）
sudo ./svc.sh install
sudo ./svc.sh start
```

### 3.3 安装 Runner 依赖

```bash
# 安装 Docker（如果 runner 用户需要构建镜像）
sudo usermod -aG docker $USER

# 安装其他必要工具
sudo apt-get update
sudo apt-get install -y docker.io docker-compose git curl
```

---

## 4. GitHub Secrets 配置

在 GitHub 仓库 → Settings → Secrets and variables → Actions 中添加：

| Secret 名称 | 说明 | 示例值 |
|------------|------|-------|
| `SERVER_HOST` | 服务器 IP 或域名 | 139.XXX.XXX.XXX |
| `SERVER_USER` | SSH 用户名 | root |
| `SERVER_SSH_KEY` | 私钥内容 | -----BEGIN OPENSSH PRIVATE KEY-----\n... |

### 生成 SSH 密钥步骤

```bash
# 本地生成密钥
ssh-keygen -t ed25519 -C "github-actions@erp"

# 复制公钥到服务器
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@139.XXX.XXX.XXX

# 复制私钥内容到 GitHub Secrets
cat ~/.ssh/id_ed25519
```

---

## 5. CI/CD Workflow 详解

### 5.1 触发条件

- **Pull Request**: 从任何 feature 分支合并到 master 时触发
- **Push to master**: 直接推送到 master 分支时触发

### 5.2 Workflow 流程

```
1. Checkout 代码
       ▼
2. 构建 Frontend Docker 镜像
       ▼
3. 导出 Frontend 镜像为 tar.gz
       ▼
4. 复制镜像到服务器
       ▼
5. 服务器加载镜像
       ▼
6. 使用 Docker Compose 启动服务
       ▼
7. 清理临时文件
```

---

## 6. 完整 Workflow 配置

在 `.github/workflows/deploy.yml` 中配置：

```yaml
name: Build and Deploy

on:
  pull_request:
    branches: [master]
    types: [opened, synchronize, reopened, closed]
  push:
    branches: [master]

jobs:
  build-and-deploy:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action == 'closed' && github.event.pull_request.merged == true)
    runs-on: self-hosted

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Build frontend Docker image
        run: |
          docker build -t erp-frontend:${{ github.sha }} ./frontend
          docker build -t erp-frontend:latest ./frontend

      - name: Export frontend image to tar.gz
        run: |
          docker save erp-frontend:latest | gzip > erp-frontend.tar.gz

      - name: Copy image to Aliyun server
        env:
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
          SSH_KEY: ${{ secrets.SERVER_SSH_KEY }}
        run: |
          echo "$SSH_KEY" > /tmp/deploy_key
          chmod 600 /tmp/deploy_key
          
          scp -o StrictHostKeyChecking=no -i /tmp/deploy_key erp-frontend.tar.gz ${SERVER_USER}@${SERVER_HOST}:/root/images/
          
          rm -f /tmp/deploy_key

      - name: Deploy to Aliyun server
        env:
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
          SSH_KEY: ${{ secrets.SERVER_SSH_KEY }}
        run: |
          echo "$SSH_KEY" > /tmp/deploy_key
          chmod 600 /tmp/deploy_key
          
          ssh -o StrictHostKeyChecking=no -i /tmp/deploy_key ${SERVER_USER}@${SERVER_HOST} << 'DEPLOY_SCRIPT'
            set -e
            
            cd /root
            
            # 备份当前数据（可选）
            if [ -d "backup" ]; then
              timestamp=$(date +%Y%m%d_%H%M%S)
              mkdir -p backup/$timestamp
              cp -r backend/pb_data backup/$timestamp/ 2>/dev/null || true
            fi
            
            # 加载 Docker 镜像
            docker load -i images/erp-frontend.tar.gz
            
            # 重新构建并启动前端服务
            docker-compose build --no-cache frontend
            docker-compose up -d
            
            # 清理旧镜像和临时文件
            docker image prune -f
            rm -f images/erp-frontend.tar.gz
            
            echo "Deployment completed successfully!"
            docker-compose ps
          DEPLOY_SCRIPT
          
          rm -f /tmp/deploy_key

      - name: Cleanup local artifacts
        if: always()
        run: |
          rm -f erp-frontend.tar.gz
```

---

## 7. 部署流程演示

### 7.1 开发流程

```bash
# 1. 创建 feature 分支
git checkout -b feature/your-feature

# 2. 开发并提交代码
git add .
git commit -m "feat: add new feature"

# 3. 推送到远程并创建 PR
git push -u origin feature/your-feature
```

### 7.2 GitHub 上的操作

1. **创建 Pull Request**
   - 进入仓库 → Pull requests → New pull request
   - 选择 base: master, compare: feature/your-feature
   - 填写 PR 描述并创建

2. **触发 CI/CD**
   - PR 创建时自动触发 workflow
   - 在 Actions 页面查看构建进度

3. **合并 PR**
   - 代码审查通过后
   - 点击 "Merge pull request"
   - 合并后会自动触发部署到生产服务器

### 7.3 查看部署结果

```bash
# 在服务器上查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 查看容器资源使用
docker stats
```

---

## 8. 故障排查

### 8.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| Runner 不执行任务 | Runner 未启动 | 检查 runner 状态 `sudo ./svc.sh status` |
| SSH 连接失败 | 密钥格式错误 | 确保 Secrets 中的密钥是完整私钥 |
| 镜像加载失败 | tar.gz 文件损坏 | 检查传输过程，确保文件完整 |
| 服务启动失败 | 端口被占用 | 检查 `docker-compose logs` |

### 8.2 手动部署命令

如果 CI/CD 失败，可以手动部署：

```bash
# SSH 连接到服务器
ssh root@139.XXX.XXX.XXX

cd /root

# 手动加载镜像
docker load -i images/erp-frontend.tar.gz

# 重启服务
docker-compose up -d

# 查看状态
docker-compose ps
docker-compose logs -f
```

### 8.3 查看 Runner 日志

```bash
# Runner 服务日志
sudo ./svc.sh log

# 或者直接查看日志文件
cat _diag/*.log
```

---

## 附录：项目结构

```
my-erp-system/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD 配置
├── frontend/
│   ├── Dockerfile              # 前端镜像构建
│   ├── package.json
│   └── src/
├── backend/
│   ├── Dockerfile              # 后端镜像构建
│   ├── go.mod
│   └── pb_data/                # PocketBase 数据（服务器上）
├── docker-compose.yml          # 服务编排
├── traefik/
│   └── traefik.yml             # Traefik 配置
└── README.md
```

---

## 注意事项

1. **安全性**
   - 定期更换 SSH 密钥
   - 不要将私钥提交到代码仓库
   - 使用 GitHub Secrets 存储敏感信息

2. **数据备份**
   - 定期备份 `backend/pb_data` 目录
   - 可以在 workflow 中添加自动备份步骤

3. **监控**
   - 配置 Traefik Dashboard 监控路由
   - 使用 `docker stats` 监控资源使用
   - 设置日志轮转避免磁盘空间不足

4. **更新**
   - 每次部署会自动重建镜像
   - 可以添加版本标签便于回滚
