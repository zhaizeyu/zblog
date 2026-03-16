# 海外服务器部署 LiteLLM 企业级网关：完美解决通义千问风控与 DeepSeek 代理冲突

## 💡 背景与痛点

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

### 第零步（可选）：在宿主机安装 Cloudflare WARP

*如果你已经安装好了 WARP，可直接跳过此步。*

以 Debian/Ubuntu 系统为例，官方源安装方式如下：

```bash
# 1. 添加 Cloudflare GPG 密钥
curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg

# 2. 添加 Cloudflare 软件源
echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list

# 3. 更新源并安装 WARP 客户端
sudo apt-get update && sudo apt-get install cloudflare-warp -y

# 4. 启动并设置开机自启后台守护进程
sudo systemctl start warp-svc
sudo systemctl enable warp-svc
```

### 第一步：配置宿主机 WARP (局部代理模式)

我们需要让 WARP 作为一个安静的本地服务运行，绝不能接管全局网络，否则会导致 SSH 断连或外部机器无法访问你的网关。

在宿主机执行：

```bash
# 1. 注册设备 (首次运行需执行)
warp-cli registration new

# 2. 断开可能残留的连接并设置为纯代理模式
warp-cli disconnect
warp-cli mode proxy

# 3. 重新连接 WARP
warp-cli connect

# 4. 验证本地代理是否畅通 (如果返回 404 及阿里云的 acw_tc Cookie 即为成功)
curl -x http://127.0.0.1:40000 -I https://coding.dashscope.aliyuncs.com
```

### 第二步：配置环境变量 (`.env`)

为了安全起见，所有 API Key 都不应该明文写在配置文件里。创建一个 `.env` 文件来存放它们：

```bash
cat <<EOF > .env
# 阿里云 (通义千问) API Key
DASHSCOPE_API_KEY="sk-你的阿里Key..."
# DeepSeek API Key
DEEPSEEK_API_KEY="sk-你的DeepSeekKey..."
# Gemini API Key
GEMINI_API_KEY="AIzaSy你的GeminiKey..."
# 设置你的 LiteLLM 管理员主密钥 (自定义一个密码用于访问 UI 和主接口)
LITELLM_MASTER_KEY="sk-my-super-secret-master-key"
# 数据库配置
POSTGRES_USER=llm_user
POSTGRES_PASSWORD=llm_pass
POSTGRES_DB=litellm_db
