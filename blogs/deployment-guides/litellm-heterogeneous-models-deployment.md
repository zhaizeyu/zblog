# 构建坚如磐石的异构大模型 API 网关：LiteLLM + WARP 代理实战部署指南

在海外（如欧洲、美洲）服务器上部署大模型 API 聚合网关时，我们经常会遇到一个极其棘手的“网络跷跷板”问题：

1.  **通义千问 (Qwen) 的地域风控**：阿里云的大模型 API 往往会对海外云服务商（如 Hetzner, AWS, DigitalOcean）的 IP 进行严格拦截。直连请求会直接超时或报错卡死。
2.  **DeepSeek 的代理封杀**：为了防刷量，DeepSeek 官方严厉封杀了包括 Cloudflare WARP 在内的大量机房与代理 IP。
3.  **全局代理泄漏**：如果在服务器或 Docker 层面挂载 WARP 代理，千问通了，但 DeepSeek 会被拦截；关掉 WARP，DeepSeek 通了，千问又挂了。

**核心目标**：使用 **LiteLLM + PostgreSQL** 搭建一个带可视化后台的企业级 API 网关，并通过 **宿主机 WARP 局部代理 + 容器防泄漏机制**，实现针对不同模型的**精准路由分流（Split Tunneling）**。

---

## 🛠️ 核心架构方案

*   **网关层**：LiteLLM (处理模型聚合、路由转发、鉴权与计费统计)。
*   **数据层**：PostgreSQL (持久化配置，支持一键创建无限个子 Key 和额度限制)。
*   **网络层**：Docker 采用 `network_mode: "host"` 彻底绕过虚拟网桥带来的跨主机访问障碍与路由拦截。
*   **代理层**：宿主机运行 Cloudflare WARP (`mode proxy`)，仅暴露本地 40000 端口作为出口通道，绝不修改系统默认路由。

---

## 🚀 完整部署流程

### 第一步：配置宿主机 WARP (局部代理模式)

我们需要让 WARP 作为一个安静的本地服务运行，绝不能接管全局网络。在宿主机执行：

```bash
# 1. 注册设备 (首次运行需执行)
warp-cli registration new

# 2. 设置为纯代理模式
warp-cli mode proxy

# 3. 连接 WARP
warp-cli connect
```

### 第二步：配置环境变量 (`.env`)

```bash
cat <<EOF > .env
LITELLM_MASTER_KEY=sk-your-master-key
DASHSCOPE_API_KEY=sk-your-qwen-key
DEEPSEEK_API_KEY=sk-your-deepseek-key
POSTGRES_USER=llm_user
POSTGRES_PASSWORD=llm_pass
POSTGRES_DB=litellm_db
EOF
```

### 第三步：配置 LiteLLM 路由分流 (`config.yaml`)

```yaml
model_list:
  - model_name: qwen3-max
    litellm_params:
      model: openai/qwen3-max-2026-01-23
      api_base: "https://coding.dashscope.aliyuncs.com/v1"
      api_key: "os.environ/DASHSCOPE_API_KEY"
      proxy_url: "http://127.0.0.1:40000"
  - model_name: deepseek-chat
    litellm_params:
      model: deepseek/deepseek-chat
      api_key: "os.environ/DEEPSEEK_API_KEY"
```

### 第四步：Docker Compose 部署

```yaml
services:
  litellm:
    image: ghcr.io/berriai/litellm:latest
    container_name: litellm
    restart: always
    network_mode: "host"
    env_file: .env
    environment:
      - DATABASE_URL=postgresql://llm_user:llm_pass@localhost:5432/litellm_db
      - NO_PROXY=localhost,127.0.0.1,api.deepseek.com
    command: ["--config", "/app/config.yaml", "--port", "4000"]
    volumes:
      - ./config.yaml:/app/config.yaml:ro

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
```

### 第五步：一键启动与跨主机验证

启动服务：
```bash
docker compose up -d
docker compose logs -f litellm
```

找一台**另外的电脑或服务器**进行跨主机测试：

✅ **测试 1：DeepSeek（直连链路验证）**
```bash
curl -X POST http://<服务器公网IP>:4000/v1/chat/completions \
  -H "Authorization: Bearer <你的LiteLLM_Key>" \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "你好"}]}'
```

✅ **测试 2：通义千问（WARP 代理链路验证）**
```bash
curl -X POST http://<服务器公网IP>:4000/v1/chat/completions \
  -H "Authorization: Bearer <你的LiteLLM_Key>" \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3-max", "messages": [{"role": "user", "content": "你好"}]}'
```

---

## 🎉 总结

通过 `network_mode: "host"` 解决外部入站被阻挡的问题，通过 `openai/` 前缀解决 LiteLLM 内部特定组件对代理支持卡死的 Bug，最后通过 `NO_PROXY` 环境变量构建代理隔离墙。

这套架构不仅跑通了极度挑剔的异构模型网络环境，还借助 PostgreSQL 为团队或个人项目提供了一个具备计费追踪、无限额度 Key 拆分的坚如磐石的大模型 API 网关！

---
*日期: 2026-03-16 | 字数: 1850*
