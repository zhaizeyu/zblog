# 实战教程：如何用 Docker Compose 优雅部署 Hindsight AI 记忆引擎

在开发 AI 智能体（Agent）时，如何让大模型拥有像人类一样的“长期记忆”一直是个难题。传统的 RAG（检索增强生成）往往在处理复杂时间线和多轮对话时力不从心。而 Hindsight 作为一个仿生记忆系统，凭借其“写入提纯、多路召回”的架构脱颖而出。

今天，我将带大家完整走一遍 Hindsight 的 Docker Compose 部署流程。为了实现**极致的轻量化和低成本**，我们将采用“全云端模型调度 + 本地数据库直挂”的架构，哪怕是 1核2G 的入门级云服务器也能轻松跑满！

## 核心架构思路：为什么选 Slim 镜像？

Hindsight 官方提供了两种部署镜像：

1.  **全量版 (`latest`)**：内置了 PyTorch 和 BAAI/bge 等本地向量模型，体积高达数 GB，吃 CPU 和内存。
2.  **极简版 (`latest-slim`)**：体积仅 500MB，剥离了所有本地 AI 算力负担。

在我们的方案中，我们将使用 **Slim 镜像**。把最耗费算力的“文本生成（LLM）”和“向量化（Embedding）”全部外包给 OpenAI 或云端大模型，同时将检索重排设置为纯算法（RRF）。这样，您的本地服务器就只剩下一个轻量级的 API 路由和 PostgreSQL 数据库。

---

## 步骤一：准备环境变量 (`.env`)

在您的项目根目录下创建一个 `.env` 文件。这里以接入 OpenAI 体系为例（兼顾高性能与 1536 维的标准向量）：

```ini
# ==========================================
# 1. 文本生成与推理 (LLM)
# ==========================================
HINDSIGHT_API_LLM_PROVIDER=openai
HINDSIGHT_API_LLM_API_KEY=sk-你的_OpenAI_API_Key
HINDSIGHT_API_LLM_MODEL=gpt-4o-mini # 推荐使用高性价比模型

# ==========================================
# 2. 向量化嵌入 (Embeddings)
# ==========================================
HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=text-embedding-3-small

# ==========================================
# 3. 检索重排 (纯算法，零本地模型负担)
# ==========================================
HINDSIGHT_API_RERANKER_PROVIDER=rrf

# ==========================================
# 4. 数据库配置
# ==========================================
HINDSIGHT_DB_USER=hindsight_user
HINDSIGHT_DB_PASSWORD=your_secure_password
HINDSIGHT_DB_NAME=hindsight_db
HINDSIGHT_API_DATABASE_URL=postgresql://hindsight_user:your_secure_password@db:5432/hindsight_db
```

> **避坑指南**：如果你使用的是 Google Gemini 的 Embedding 模型（通过 LiteLLM SDK 接入），一定要在 `.env` 中加上 `LITELLM_DROP_PARAMS=True`，否则会因为 Gemini API 不兼容底层的 `encoding_format` 参数而导致容器启动报错挂掉！

## 步骤二：编写 docker-compose.yml

这是部署的核心。我们需要特别注意两点：**数据库的健康检查指令**，以及**数据卷的本地化挂载**。

在同级目录下创建 `docker-compose.yml`：

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    container_name: hindsight-db
    restart: always
    environment:
      POSTGRES_USER: ${HINDSIGHT_DB_USER}
      POSTGRES_PASSWORD: ${HINDSIGHT_DB_PASSWORD}
      POSTGRES_DB: ${HINDSIGHT_DB_NAME}
    volumes:
      # 【关键优化】将数据库文件直接挂载到宿主机当前目录的 ./pg_data 文件夹
      # 方便直观管理、备份以及跨服务器迁移
      - ./pg_data:/var/lib/postgresql/data
    healthcheck:
      # 【关键修复】必须加上 -d 指定数据库名，否则 pg_isready 会因找不到同名库而报错
      test: ["CMD-SHELL", "pg_isready -U ${HINDSIGHT_DB_USER} -d ${HINDSIGHT_DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 5

  hindsight:
    # 使用极简版镜像
    image: ghcr.io/vectorize-io/hindsight:latest-slim
    container_name: hindsight-app
    restart: always
    ports:
      - "8888:8888" # API 服务端点
      - "9999:9999" # Control Plane 可视化管理面板
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
```

## 步骤三：一键启动与验证

确认文件无误后，执行以下命令启动服务：

```bash
docker compose up -d
```

启动后，强烈建议跟踪一下日志，确保数据库和 Embedding 模型初始化成功：

```bash
docker compose logs -f hindsight
```

当你看到 `Application startup complete` 的提示时，恭喜你，部署成功！

## 步骤四：享受你的 AI 记忆库

现在，你可以通过浏览器访问你的服务了：

*   **可视化控制台**：打开 `http://localhost:9999`，你可以在这里创建记忆库（Bank），直观地查阅 World Facts（世界事实），或者配置固化的 Mental Models（心智模型）。
*   **API 端点**：你的 AI 应用现在可以通过 `http://localhost:8888` 的 API 接口，随时调用 `retain` 存入记忆，调用 `recall` 检索背景知识了。

---

### 🚨 终极排错：令人头疼的“向量维度超限 (Dimension Mismatch)”

在测试过程中，如果你频繁更换 Embedding 模型（比如从 768 维的 Gemini 换成了 1536 维的 OpenAI），你极有可能会在日志中看到类似这样的致命错误：

`RuntimeError: Embedding dimension 1536 ... exceeds pgvector HNSW index limit...`

**原因**：PostgreSQL 的 pgvector 插件一旦在第一次启动时按某个维度建了表，之后就不允许更改了。旧维度的数据会固化在你的数据卷里。

**解决杀手锏**：
直接修改 `docker-compose.yml` 中的挂载目录名称（例如把 `./pg_data` 改成 `./pg_data_v2`），让系统在一张“白纸”上重新创建一个匹配新维度的干净数据库，然后 `docker compose down && docker compose up -d` 即可完美解决。

---
*日期: 2026-03-16 | 字数: 3309*
