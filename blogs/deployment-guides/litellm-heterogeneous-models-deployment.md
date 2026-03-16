# 构建坚如磐石的异构大模型 API 网关：LiteLLM + WARP 代理实战部署指南

在当今的大模型生态中，我们常常需要同时调用多个不同厂商的模型服务，例如通义千问（Qwen）和 DeepSeek。然而，这些服务可能面临复杂的网络环境限制：通义千问在国内访问顺畅，但在某些海外服务器上可能被地域限制；而 DeepSeek 则可能正好相反。

本文将手把手教你如何利用 **LiteLLM** 作为统一的 API 网关，并巧妙结合 **Cloudflare WARP** 代理，构建一个能同时稳定访问国内外异构大模型的坚如磐石的 API 网关。

## 核心挑战与解决方案

*   **挑战 1**: 外部无法直接访问部署在 Docker 容器内的 LiteLLM 服务。
    *   **方案**: 使用 `network_mode: "host"`，让容器共享宿主机的网络命名空间。
*   **挑战 2**: LiteLLM 内部组件对代理支持不完善，导致部分模型无法通过代理访问。
    *   **方案**: 在模型名称前添加 `openai/` 前缀，强制使用兼容性更好的 OpenAI 客户端。
*   **挑战 3**: 需要为直连模型（如 DeepSeek）和代理模型（如 Qwen）建立隔离的网络策略。
    *   **方案**: 利用 `NO_PROXY` 环境变量，精确控制哪些流量走代理，哪些不走。

## 🛠️ 第一步：环境准备

确保你的服务器已安装 **Docker** 和 **Docker Compose**。

## 📝 第二步：创建配置文件

### 1. 创建 `.env` 文件

```bash
mkdir -p ~/litellm-gateway && cd ~/litellm-gateway
```

创建 `~/litellm-gateway/.env` 文件，填入你的 API Keys：

```ini
# 你的 LiteLLM 主密钥 (用于验证外部请求)
LITELLM_MASTER_KEY=your_strong_master_key_here

# 模型提供商的 API Keys
OPENAI_API_KEY=sk-... # 用于 DeepSeek 等
DASHSCOPE_API_KEY=sk-... # 用于通义千问

# 数据库配置
POSTGRES_USER=llm_user
POSTGRES_PASSWORD=llm_pass
POSTGRES_DB=litellm_db
```

### 2. 创建 `docker-compose.yml` 文件

创建 `~/litellm-gateway/docker-compose.yml` 文件：

```yaml
services:
  litellm:
    image: ghcr.io/berriai/litellm:latest
    container_name: litellm
    restart: always
    network_mode: "host" # 关键！解决外部访问问题
    environment:
      - LITELLM_MASTER_KEY_FILE=/run/secrets/master_key
      - DATABASE_URL=postgresql://llm_user:llm_pass@localhost:5432/litellm_db
      - DASHSCOPE_API_KEY_FILE=/run/secrets/dashscope_api_key
      - OPENAI_API_KEY_FILE=/run/secrets/openai_api_key
      # 关键！为通义千问等国内模型设置代理
      - HTTP_PROXY=http://127.0.0.1:40000
      - HTTPS_PROXY=http://127.0.0.1:40000
      # 关键！为 DeepSeek 等海外模型设置直连
      - NO_PROXY=localhost,127.0.0.1,api.deepseek.com
    secrets:
      - master_key
      - dashscope_api_key
      - openai_api_key
    command: ["--port", "4000"]

  db:
    image: postgres:16-alpine
    container_name: litellm-db
    environment:
      POSTGRES_USER: llm_user
      POSTGRES_PASSWORD: llm_pass
      POSTGRES_DB: litellm_db
    ports:
      - "5432:5432" # 必须暴露端口，让处于 Host 网络的 LiteLLM 能连上数据库
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U llm_user -d litellm_db"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: always

volumes:
  pgdata:

secrets:
  master_key:
    file: ./master_key.txt
  dashscope_api_key:
    file: ./dashscope_api_key.txt
  openai_api_key:
    file: ./openai_api_key.txt
```

### 3. 创建密钥文件

为了安全，我们将 API Key 存放在独立的文件中：

```bash
# 创建主密钥文件
echo "your_strong_master_key_here" > ~/litellm-gateway/master_key.txt

# 创建 DashScope (通义千问) API Key 文件
echo "sk-..." > ~/litellm-gateway/dashscope_api_key.txt

# 创建 OpenAI API Key 文件 (用于 DeepSeek)
echo "sk-..." > ~/litellm-gateway/openai_api_key.txt
```

## 🔌 第三步：启动 Cloudflare WARP 代理

在服务器上启动 WARP 代理，并监听 `127.0.0.1:40000`。具体命令取决于你使用的 WARP 客户端。例如，如果你使用 `wgcf` 或其他 WireGuard 客户端，请确保其配置了正确的监听地址。

## 🚀 第四步：一键启动与跨主机验证

### 启动服务

```bash
cd ~/litellm-gateway
docker compose up -d
```

### 查看日志

```bash
docker compose logs -f litellm
```

### 跨主机测试

找一台**另外的电脑或服务器**进行测试，验证双链路是否工作正常：

✅ **测试 1：DeepSeek（直连链路验证）**
```bash
curl -X POST http://<服务器公网IP>:4000/v1/chat/completions \
  -H "Authorization: Bearer <你的LiteLLM_Master_Key>" \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "你好"}]}'
```

✅ **测试 2：通义千问（WARP 代理链路验证）**
```bash
curl -X POST http://<服务器公网IP>:4000/v1/chat/completions \
  -H "Authorization: Bearer <你的LiteLLM_Master_Key>" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/qwen3-max", "messages": [{"role": "user", "content": "你好"}]}'
```

注意：调用通义千问时，模型名需加上 `openai/` 前缀。

## 🎉 总结

通过 `network_mode: "host"` 解决外部入站被阻挡的问题，通过 `openai/` 前缀解决 LiteLLM 内部特定组件对代理支持卡死的 Bug，最后通过 `NO_PROXY` 环境变量构建代理隔离墙。

这套架构不仅跑通了极度挑剔的异构模型网络环境，还借助 PostgreSQL 为团队或个人项目提供了一个具备计费追踪、无限额度 Key 拆分的坚如磐石的大模型 API 网关！

---
*日期: 2026-03-16 | 字数: 3335*