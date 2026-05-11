---
title: Debian 云服务器部署 Hermes Agent + Dashboard + Open WebUI 完整指南
date: 2026-05-11
tags: [Hermes, Docker, Open WebUI, Agent, Deployment]
category: Deployment Guides
---

# Debian 云服务器部署 Hermes Agent + Dashboard + Open WebUI 完整指南

下面是一篇可以直接照着复制命令部署的流程，基于 Debian 云服务器 + Docker Compose + Hermes Agent + Open WebUI。

---

## 目标架构

- **浏览器**
  - Hermes Dashboard: `http://服务器IP:9119`
  - Open WebUI: `http://服务器IP:3001`
- **Docker**
  - **hermes 容器**
    - Hermes Gateway
    - Hermes OpenAI-compatible API: `8642`
    - Hermes Dashboard: `9119`
  - **open-webui 容器**
    - 连接 `http://hermes:8642/v1`

> Hermes 官方 Docker 文档推荐 Dashboard 作为 gateway 容器内的 side-process 启动，也就是 gateway run 和 dashboard 在同一个容器里；官方还说明单独跑 dashboard 容器不支持，因为 gateway-liveness detection 需要和 gateway 共享 PID namespace。
> Open WebUI 通过 Hermes 的 OpenAI-compatible API 接入，URL 必须带 `/v1`，例如 `http://hermes:8642/v1`。

---

## 1. 安装 Docker 和 Compose 插件

Debian 服务器先更新系统：

```bash
apt update
apt install -y ca-certificates curl gnupg lsb-release
```

安装 Docker 官方源：

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
 -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
```

添加 Docker apt 源：

```bash
echo \
 "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
 $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
 > /etc/apt/sources.list.d/docker.list
```

安装 Docker：

```bash
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

验证：

```bash
docker version
docker compose version
```

---

## 2. 创建 Hermes 数据目录

Hermes 的所有配置、API Key、sessions、skills、memory 都放在宿主机目录：

```bash
mkdir -p /root/.hermes
```

> 官方 Docker 文档说明，容器内 `/opt/data` 是 Hermes 的持久化数据目录，会映射到宿主机的 `~/.hermes`，里面包含 `.env`、`config.yaml`、`sessions`、`skills`、`logs` 等。

---

## 3. 首次初始化 Hermes 配置

运行一次 setup：

```bash
docker run -it --rm \
 -v /root/.hermes:/opt/data \
 nousresearch/hermes-agent:latest setup
```

按提示配置你的模型 API Key。

如果你已经有 `/root/.hermes/config.yaml` 和 `/root/.hermes/.env`，可以跳过这一步。

---

## 4. 配置 Hermes API Server 和 Dashboard

编辑 Hermes 的 `.env`：

```bash
cat >> /root/.hermes/.env <<'EOF'
# ===== Hermes OpenAI-compatible API Server =====
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
API_SERVER_KEY=change-me-hermes-123456
API_SERVER_MODEL_NAME=hermes-agent
# ===== Hermes Gateway =====
GATEWAY_ALLOW_ALL_USERS=true
EOF
```

这里 `API_SERVER_KEY` 是 Open WebUI 连接 Hermes 时使用的 Bearer Token，后面要保持一致。

**说明：**
- `API_SERVER_ENABLED=true` 开启 Hermes OpenAI-compatible API
- `API_SERVER_HOST=0.0.0.0` 允许 Docker 网络和宿主机访问
- `API_SERVER_PORT=8642` Hermes API 端口
- `API_SERVER_KEY=xxx` Open WebUI 连接时的 API Key
- `API_SERVER_MODEL_NAME=xxx` Open WebUI 里显示的模型名

---

## 5. 创建部署目录

```bash
mkdir -p /root/hermes-deploy
cd /root/hermes-deploy
```

创建 Open WebUI 数据目录：

```bash
mkdir -p /root/open-webui-data
```

---

## 6. 创建 Docker Compose 环境变量文件

注意：这个 `.env` 是 Docker Compose 用的，不是 Hermes 的 `/root/.hermes/.env`。

```bash
cat > /root/hermes-deploy/.env <<'EOF'
HERMES_DATA_DIR=/root/.hermes
OPEN_WEBUI_DATA_DIR=/root/open-webui-data
HERMES_API_KEY=change-me-hermes-123456
EOF
```

其中 `HERMES_API_KEY` 必须和 `grep API_SERVER_KEY /root/.hermes/.env` 里的值一致。

---

## 7. 创建 docker-compose.yml

这个版本是推荐最终版：

```yaml
services:
 hermes:
 image: nousresearch/hermes-agent:latest
 container_name: hermes
 restart: unless-stopped
 command: gateway run
 ports:
 # Hermes OpenAI-compatible API
 - "8642:8642"
 # Hermes Dashboard
 - "9119:9119"
 volumes:
 - ${HERMES_DATA_DIR}:/opt/data
 environment:
 # Dashboard 必须作为容器环境变量传入，因为它由 Docker entrypoint 启动
 - HERMES_DASHBOARD=1
 - HERMES_DASHBOARD_HOST=0.0.0.0
 - HERMES_DASHBOARD_PORT=9119
 networks:
 - hermes-net
 shm_size: "1g"

 open-webui:
 image: ghcr.io/open-webui/open-webui:latest
 container_name: open-webui
 restart: unless-stopped
 ports:
 # 宿主机 3001 -> Open WebUI 容器内 8080
 - "3001:8080"
 volumes:
 - ${OPEN_WEBUI_DATA_DIR}:/app/backend/data
 environment:
 # Open WebUI 自动连接 Hermes API，必须带 /v1
 - OPENAI_API_BASE_URL=http://hermes:8642/v1
 - OPENAI_API_KEY=${HERMES_API_KEY}
 # 禁用默认 Ollama，避免模型列表里出现空 Ollama 后端
 - ENABLE_OLLAMA_API=false
 networks:
 - hermes-net
 depends_on:
 - hermes

networks:
 hermes-net:
 driver: bridge
```

> 注意：这里没有配置 `HERMES_DASHBOARD_TUI=1`。原因是 Dashboard 的内嵌 Chat/TUI 在部分版本或环境下可能不稳定，容易出现 [session ended]。建议把 Dashboard 当管理页使用，真正 TUI 用单独的临时容器启动。

---

## 8. 启动服务

```bash
cd /root/hermes-deploy
docker compose up -d
```

查看容器：

```bash
docker ps
```

正常应该看到：
- hermes: `0.0.0.0:8642->8642/tcp, 0.0.0.0:9119->9119/tcp`
- open-webui: `0.0.0.0:3001->8080/tcp`

---

## 9. 验证 Hermes API

测试 health：

```bash
curl -i http://127.0.0.1:8642/health
```

测试模型列表：

```bash
curl -i http://127.0.0.1:8642/v1/models \
 -H "Authorization: Bearer change-me-hermes-123456"
```

---

## 10. 访问页面

- **Hermes Dashboard:** `http://服务器IP:9119`
- **Open WebUI:** `http://服务器IP:3001` (第一次进入注册的账号会成为管理员)

---

## 11. Open WebUI 如果没有模型怎么办

如果之前保存过错误连接，改环境变量不一定覆盖，需要去 Admin UI 修改。

**手动配置：**
Admin Settings -> Connections -> OpenAI
- URL: `http://hermes:8642/v1`
- API Key: `change-me-hermes-123456`
- API Type: `Chat Completions`

---

## 12. 使用 Hermes 原生 TUI

建议使用单独临时容器启动 TUI。最稳方式是先停 gateway：

```bash
cd /root/hermes-deploy
docker compose stop hermes

docker run -it --rm \
 --name hermes-tui \
 -v /root/.hermes:/opt/data \
 --shm-size=1g \
 nousresearch/hermes-agent:latest --tui

cd /root/hermes-deploy
docker compose start hermes
```

---

## 13. 常用维护命令

- 查看日志：`docker compose logs -f`
- 更新镜像：`docker compose pull && docker compose up -d`
- 停止服务：`docker compose down`

---

## 14. 常见问题总结

- **Open WebUI 能打开但没模型**：先测 `curl` 模型接口，不通则查 Hermes API Server 配置。
- **Dashboard 打不开**：检查环境变量 `HERMES_DASHBOARD=1`。
- **回复卡在 loading**：复杂工具调用可能非流式，建议关闭 Open WebUI 的自动标题生成等功能以减少冗余请求。

---

## 15. 最终推荐用法

- **Open WebUI**: 日常网页聊天
- **Hermes Dashboard**: 管理配置、查看状态、sessions、skills、logs
- **Hermes TUI**: 真正需要 Hermes 原生交互体验时，用临时 `docker run --tui` 启动
