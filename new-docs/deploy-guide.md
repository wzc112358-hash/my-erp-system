# 部署指南

## 前置条件

- 本地已完成 `npm run build`（前端）和 `go build`（后端）
- 服务器地址：`182.92.78.227`
- 服务器项目目录：`/root/my-erp-system`

## 上传步骤

### 1. 上传前端

```bash
# 先删掉服务器上的旧 dist，避免 scp 产生嵌套目录
ssh root@182.92.78.227 "rm -rf /root/my-erp-system/frontend/dist"

# 上传新的 dist（注意：不要带尾部斜杠写法容易出问题）
scp -r ~/projects/my-erp-system/frontend/dist root@182.92.78.227:/root/my-erp-system/frontend/dist
```

### 2. 上传后端

```bash
scp ~/projects/my-erp-system/backend/pocketbase root@182.92.78.227:/root/my-erp-system/backend/pocketbase
```

### 3. 重建容器

```bash
ssh root@182.92.78.227 "cd /root/my-erp-system && docker compose build --no-cache && docker compose up -d"
```

如果只改了前端，可以只重建前端容器：

```bash
ssh root@182.92.78.227 "cd /root/my-erp-system && docker compose build --no-cache frontend && docker compose up -d frontend"
```

如果只改了后端，可以只重建后端容器：

```bash
ssh root@182.92.78.227 "cd /root/my-erp-system && docker compose build --no-cache pocketbase-beijing pocketbase-lanzhou && docker compose up -d pocketbase-beijing pocketbase-lanzhou"
```

### 4. 验证

```bash
# 检查容器是否正常运行
ssh root@182.92.78.227 "docker compose -f /root/my-erp-system/docker-compose.yml ps"

# 检查前端文件是否是新的（看文件日期）
ssh root@182.92.78.227 "ls -la /root/my-erp-system/frontend/dist/assets/ | head -5"

# 检查容器内文件是否是新的
ssh root@182.92.78.227 "docker exec erp-frontend ls -la /usr/share/nginx/html/assets/ | head -5"
```

## 常见问题

### Q: 上传后页面没有变化？

1. 必须用 `--no-cache` 构建，否则 Docker 使用缓存不会更新文件
2. PWA Service Worker 缓存：浏览器 F12 → Application → Service Workers → Unregister，然后刷新
3. 用无痕窗口访问验证

### Q: scp 上传后服务器文件还是旧的？

确保先 `rm -rf` 删除旧目录再上传。直接 `scp -r dist/ server:/path/dist/` 在目标目录已存在时可能产生嵌套 `dist/dist/`。

### Q: 后端更新会影响数据吗？

不会。数据存储在 `pb_data_beijing/` 和 `pb_data_lanzhou/` 目录中，`scp` 只替换二进制文件，不碰数据。

## PocketBase 后台新增字段步骤

部署后如果新增了字段，需要在北京和兰州两个系统的 PocketBase 后台分别操作：

1. 访问 `https://api-beijing.henghuacheng.cn/_/` 和 `https://api-lanzhou.henghuacheng.cn/_/`
2. 进入对应集合 → Edit → New field 添加字段
3. 旧记录会自动获得默认值（hooks 中设置的）
