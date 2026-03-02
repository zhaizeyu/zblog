# 打造你的 24 小时全自动 AI 资讯精炼工厂：Miniflux + n8n + 大模型私有化部署指南

在这个信息爆炸的时代，每天都有刷不完的 RSS 订阅和技术博客。为了对抗“信息焦虑”，我决定在自己的一台 2C3G 云服务器上，搭建一套全自动的 AI 资讯过滤与提炼系统。

它能 24 小时静默抓取全球顶尖信源，让大模型（如通义千问、Claude 等）替我读完枯燥的长文，提炼出核心要点，并准时推送到我的 Telegram 上。

今天，我将把这套系统的完整私有化部署流程和“踩坑经验”全盘托出。

## 🧠 系统架构总览

整个系统由四个核心模块组成，跑在一台普通的 Linux VPS 上即可：

*   **收集层 (Miniflux)**：极简轻量的 RSS 阅读器，负责 24 小时定时静默抓取最新文章，充当“进货员”。
*   **中枢层 (n8n)**：强大的开源自动化工作流工具，充当“调度总管”。
*   **处理层 (大模型 API)**：这里以阿里云通义千问 (qwen3-max) 为例，充当“翻译与总结员”。
*   **输出层 (Telegram)**：接收精炼后的 Markdown 简报，充当“快递员”。

## 🛠️ Phase 1: 部署信息收集器 Miniflux

首先，我们通过 Docker 部署 Miniflux。

### 1. 创建并编辑 `docker-compose.yml`

```bash
mkdir -p ~/miniflux && cd ~/miniflux
vi docker-compose.yml
```

填入以下配置（Miniflux 需要依赖 PostgreSQL 数据库）：

```yaml
services:
  miniflux:
    image: miniflux/miniflux:latest
    ports:
      - "8080:8080"
    depends_on:
      - db
    environment:
      - DATABASE_URL=postgres://miniflux:secret@db/miniflux?sslmode=disable
      - RUN_MIGRATIONS=1
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=你的超强密码
  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=miniflux
      - POSTGRES_PASSWORD=secret
    volumes:
      - miniflux-db:/var/lib/postgresql/data

volumes:
  miniflux-db:
```

### 2. 启动服务与获取 API 密钥

```bash
docker compose up -d
```

访问 `http://你的IP:8080`，使用刚才设置的账号密码登录。导入你的 OPML 订阅源后，进入 **Settings -> API Keys**，生成并保存好你的 API Token，我们后面会用到。

> 💡 **避坑指南**：
> *   如果遇到 `TLS error` 报错，可以在源设置中勾选 **Disable TLS verification**。
> *   如果遇到 `Unable to detect feed format`，通常是被 Cloudflare 等防火墙拦截了 IP，建议直接放弃该源。

## 🧠 Phase 2: 部署自动化中枢 n8n

接下来部署 n8n。这里有两个极其容易卡住的新手坑，我们在配置中直接避开。

### 1. 创建目录并解决权限坑

n8n 容器内部使用的是非 root 用户（UID 1000）。如果你用 root 启动 Docker，挂载的目录会导致 n8n 无法写入数据而无限重启。

```bash
mkdir -p ~/n8n && cd ~/n8n
mkdir n8n_data
# 必须执行这一步赋予权限！
chown -R 1000:1000 n8n_data
```

### 2. 编辑 `docker-compose.yml` 解决 HTTPS 拦截坑

n8n 默认强制要求 HTTPS 访问，否则会拦截登录。在局域网或纯 IP 测试阶段，我们需要通过环境变量关掉它。

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    container_name: n8n_app
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - NODE_ENV=production
      - GENERIC_TIMEZONE=Asia/Shanghai
      - N8N_SECURE_COOKIE=false # <--- 关掉 HTTP 拦截的关键
    volumes:
      - ./n8n_data:/home/node/.n8n
```

启动 `docker compose up -d` 后，访问 `http://你的IP:5678` 注册本地管理员账号，进入空白的工作流画布。

## ⚙️ Phase 3: 组装自动化工作流 (Workflow)

在 n8n 的画布中，我们将依次添加 6 个节点，完成数据的流转：

### Step 1: Schedule Trigger (定时触发)

添加定时器节点，设置为 **Every 1 hour** 或 **Every 2 hours**。

### Step 2: HTTP Request (去 Miniflux 拿未读文章)

*   **Method**: GET
*   **URL**: `http://你的IP:8080/v1/entries?status=unread&limit=3` (每次拿最新的 3 篇未读)
*   **Send Headers**: 添加 `X-Auth-Token`，值为 Miniflux 中生成的 API 密钥。

### Step 3: Item Lists (拆分数据)

由于 Miniflux 返回的是一个包含多篇文章的数组，添加此节点，选择 **Split Out Items**，字段填入 `entries`，将其拆分为单篇文章，方便大模型逐一处理。

### Step 4: HTTP Request (呼叫大模型 AI)

这里以直接调用通义千问 API 为例：

*   **Method**: POST
*   **URL**: `https://coding.dashscope.aliyuncs.com/v1/chat/completions`
*   **Headers**: `Authorization: Bearer 你的API_KEY`，`Content-Type: application/json`

> 🔥 **核心避坑：如何防止 HTML 代码搞崩 JSON？**
> 文章的正文（content）通常带有 HTML 标签和双引号。如果直接在 n8n 里拼 JSON，必定会报 `Invalid JSON` 错误。
> **解法**：清空 Body 输入框，点击齿轮使用 **Expression (表达式)**，填入以下 JavaScript 代码，让 n8n 自动帮你安全转义：
> ```javascript
> {{ { "model": "qwen3-max-2026-01-23", "messages": [ { "role": "system", "content": "你是一位资深的 IT 技术编辑。阅读文章，写一段简短精炼的中文摘要，并提取 3 个核心要点。" }, { "role": "user", "content": "标题：" + $json.title + "\n\n正文内容：" + $json.content } ] } }}
> ```

### Step 5: Telegram (发送私家快讯)

*   添加 Telegram 节点，配置你的 Bot Token 和个人的 Chat ID。
*   **Text 表达式拼装**：
    ```
    *{{ $('Item Lists').item.json.title }}*
    
    🤖 *AI 摘要与核心要点：*
    {{ $json.choices[0].message.content }}
    
    🔗 [阅读原文]({{ $('Item Lists').item.json.url }})
    ```
*   **Options**: 务必添加 **Parse Mode**，并选择 **Markdown (Legacy)**，保证排版优美且超链接可点击。

### Step 6: HTTP Request (状态回写，防止无限死循环轰炸)

这是极其重要的一步！如果不把文章标记为已读，下一个小时 n8n 还会抓到这些旧文章再发给你。

*   **Method**: PUT
*   **URL**: `http://你的IP:8080/v1/entries`
*   **Headers**: 带上 Miniflux 的 Token 和 JSON 声明。
*   **Body 表达式**: 让它跨节点找回文章 ID 并标记 read：
    ```javascript
    {{ { "entry_ids": [ $('Split Out').item.json.id ], "status": "read" } }}
    ```

> 💡 **避坑指南**： Miniflux 标记成功后不返回 JSON 数据，会导致 n8n 报错挂起。请在节点最下方的 **Options** 中，添加 **Response Format**，并将其强行设置为 **Text** 或 **String** 即可完美解决。

## 🎉 结语

完成这 6 步，点击右上角的 **Publish** 激活工作流，你的“数字工厂”就正式开始运转了！

有了这套系统，所有的噪音都被隔绝在外。你手机里收到的，永远是大模型咀嚼过后的纯干货。未来，还可以轻松扩展这套系统：比如把 AI 总结的高价值内容，利用 n8n 的 GitHub 节点全自动推送到静态博客中，实现自动化日更。

折腾的乐趣，莫过于让技术真正服务于你的生活。

---
*日期: 2026-03-02 | 字数: 3832*