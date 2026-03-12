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

在 GitHub 仓库的 **Settings** → **Secrets and variables** → **Actions** 中添加：

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `SERVER_HOST` | 服务器 IP | `47.xxx.xxx.xxx` |
| `SERVER_USER` | SSH 用户名 | `root` |
| `SERVER_SSH_KEY` | SSH 私钥 | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

### 2. 配置 Self-hosted Runner

在**服务器**上执行：

```bash
# 创建 Runner 目录
mkdir -p ~/actions-runner && cd ~/actions-runner

# 下载 Runner
curl -o actions-runner-linux-x64-2.321.0.tar.gz https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz
tar -xzf actions-runner-linux-x64-2.321.0.tar.gz

# 配置 Runner（需要先在 GitHub 生成 token）
./config.sh --url https://github.com/{owner}/{repo} --token {TOKEN}

# 安装为服务并启动
sudo ./svc.sh install
sudo ./svc.sh start
```

**生成 Runner Token**：
- GitHub 仓库 → Settings → Actions → Runners → "New self-hosted runner"
- 选择 Linux → x64，复制生成的 token 命令

---

## 服务器配置

### 1. 创建部署目录

```bash
sudo mkdir -p /opt/erp-system/images
sudo chown -R $USER:$USER /opt/erp-system
```

### 2. 初始化 Git 仓库

```bash
cd /opt/erp-system
git init
git remote add origin git@github.com:{owner}/{repo}.git
git fetch origin master
git checkout -b master origin/master

# 后续更新部署只需
git pull origin master
```

---

## 部署流程

### 开发流程

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

### CI/CD 自动流程

创建 PR 后自动触发：

1. **构建镜像** - 在 Runner 上构建 Docker 镜像
2. **导出镜像** - 导出为 tar.gz 文件
3. **传输镜像** - SCP 传送到服务器
4. **部署** - 加载镜像并重启服务

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

### 重启服务

```bash
cd /opt/erp-system
docker-compose restart
```

---

## 常见问题

### Runner 离线

```bash
cd ~/actions-runner
./run.sh

# 或检查服务状态
sudo ./svc.sh status
```

### 部署后服务异常

```bash
docker-compose logs -f --tail=100
docker-compose restart
```
