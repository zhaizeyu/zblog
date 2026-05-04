# 使用 Docker Compose 部署 Hermes，并通过 SSH Backend 检查 Kubernetes 集群

本文记录一套可落地的 Hermes 部署流程，目标是：

Hermes Docker
 ↓ SSH backend
宿主机 / ops-runner
 ↓ kubectl
Kubernetes API Server

这个方案适合把 Hermes 用作 K8s 只读诊断助手。Hermes 本体运行在 Docker 中，真正执行 kubectl 的位置是宿主机或 ops-runner。这样比直接在容器内塞 kubeconfig、kubectl 更清晰，也方便后续做 SSH 命令白名单和权限收敛。

Hermes 官方 Docker 模式会把配置、API keys、sessions、skills、memories 等用户数据统一挂载到容器内 `/opt/data`，镜像本身是无状态的；SSH backend 则允许命令在远程服务器上执行，并要求配置 `TERMINAL_SSH_HOST` 和 `TERMINAL_SSH_USER` 等环境变量。

---

## 1. 部署目标

最终架构：

浏览器
 ↓
Cloudflare 域名
 ↓
Caddy HTTPS + Basic Auth
 ↓
Hermes Dashboard

以及：

Hermes 容器
 ↓ SSH
宿主机 root / ops-runner 用户
 ↓
kubectl
 ↓
Kubernetes 集群

当前为了先跑通流程，SSH 使用 root 用户。生产环境建议后续切换为专用低权限用户，例如 hermes，并配只读 kubeconfig、RBAC 和 SSH forced-command 白名单。

---

## 2. 准备 Hermes 数据目录

```bash
mkdir -p ~/.hermes
chmod 700 ~/.hermes
```

Hermes 的持久化目录是 `~/.hermes`，在容器中对应 `/opt/data`。

---

## 3. 初始化 Hermes

首次运行 setup：

```bash
docker run -it --rm \
 -v ~/.hermes:/opt/data \
 nousresearch/hermes-agent:latest setup
```

这里会生成：
- `~/.hermes/.env` (Hermes 读取的环境变量)
- `~/.hermes/config.yaml`

---

## 4. Docker Compose 部署 Hermes

创建部署目录：

```bash
mkdir -p ~/hermes-deploy
cd ~/hermes-deploy
```

创建 Compose 用的 `.env`：

```bash
cat > .env <<EOF
HERMES_DATA_DIR=/root/.hermes
EOF
```

创建 `docker-compose.yml`：

```yaml
services:
 hermes:
   image: nousresearch/hermes-agent:latest
   container_name: hermes
   restart: unless-stopped
   command: gateway run
   env_file:
     - /root/.hermes/.env
   ports:
     - "8642:8642"
   volumes:
     - ${HERMES_DATA_DIR}:/opt/data
   networks:
     - hermes-net
   shm_size: "1g"

 dashboard:
   image: nousresearch/hermes-agent:latest
   container_name: hermes-dashboard
   restart: unless-stopped
   command: dashboard --host 0.0.0.0 --insecure
   ports:
     - "172.17.0.1:9119:9119"
   volumes:
     - ${HERMES_DATA_DIR}:/opt/data
   environment:
     - GATEWAY_HEALTH_URL=http://hermes:8642
   networks:
     - hermes-net
   depends_on:
     - hermes

networks:
 hermes-net:
   driver: bridge
```

**说明：**
- **hermes**: 运行 gateway，用于后续 Telegram/Slack/cron 等入口。
- **dashboard**: 运行 Hermes Dashboard。需加 `--insecure` 允许监听 `0.0.0.0`，但通过 `172.17.0.1` 限制仅内网访问。

启动：

```bash
docker compose up -d
```

---

## 5. 使用 Caddy 反代 Hermes Dashboard

配置 Caddy 以提供 HTTPS 和 Basic Auth 保护。

创建 `Caddyfile`：

```caddy
rn.animaseed.com {
 encode zstd gzip
 basicauth {
   admin <替换为 caddy hash-password 生成的 hash>
 }
 reverse_proxy 172.17.0.1:9119
}
```

Cloudflare 配置 A 记录指向服务器 IP 并开启代理。

---

## 6. 配置 SSH Backend

编辑 `~/.hermes/config.yaml`，将 terminal backend 改为 `ssh`：

```yaml
terminal:
  backend: ssh
  timeout: 180
  persistent_shell: true
```

---

## 7. 生成 SSH Key

```bash
mkdir -p ~/.hermes/ssh
chmod 700 ~/.hermes/ssh
ssh-keygen -t ed25519 -C "hermes_root_key" -f ~/.hermes/ssh/hermes_root_key
cat ~/.hermes/ssh/hermes_root_key.pub >> /root/.ssh/authorized_keys
```

---

## 8. 修正 SSH 私钥权限

Hermes 容器内以 `hermes` 用户（UID 1000）运行，需调整私钥属主：

```bash
chown -R 1000:1000 ~/.hermes/ssh
chmod 600 ~/.hermes/ssh/hermes_root_key
```

---

## 9. 配置 Hermes 的 .env

编辑 `~/.hermes/.env`：

```env
TERMINAL_SSH_HOST=172.17.0.1
TERMINAL_SSH_USER=root
TERMINAL_SSH_PORT=22
TERMINAL_SSH_KEY=/opt/data/ssh/hermes_root_key
```

---

## 10. 重启与测试

```bash
cd ~/hermes-deploy
docker compose restart hermes
```

在容器内测试链路：

```bash
docker exec -it hermes ssh -i /opt/data/ssh/hermes_root_key root@172.17.0.1 'kubectl get pods -A'
```

---

## 11. 让 Hermes 检查 Kubernetes

在 TUI 或 CLI 中输入提示词：

> 你是 Kubernetes 只读诊断助手。请通过终端执行 kubectl get nodes 和 kubectl get pods -A，找出异常节点、异常 Pod 和重启次数高的 Pod。禁止执行任何修改命令。

---

## 12. 安全建议

- **专用用户**: 切换 root 为低权限 `hermes` 用户。
- **RBAC**: 使用只读 K8s RBAC。
- **命令白名单**: 限制 SSH 只能执行 `kubectl get/describe/logs` 等只读操作。

---

总结：这套方案通过 Docker 隔离了环境，通过 SSH Backend 实现了对宿主机资源的受控访问，是构建 K8s AI 运维助手的理想起点。
