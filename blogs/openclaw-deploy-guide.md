# 云服务器部署 OpenClaw：全流程安装、避坑与卸载指南

这份指南总结了在 **RackNerd** 和 **DMIT** 服务器上的实操经验，包含应对 IP 地区限制和内存管理的解决方案。

## 一、 安装篇：搭建你的 AI 基地

### 1. 准备工作：权限与依赖
OpenClaw 建议使用普通用户运行，且依赖 Homebrew。

* **创建普通用户**:
  ```bash
  apt update && apt install -y sudo
  adduser zzy && usermod -aG sudo zzy
  su - zzy
sudo loginctl enable-linger zzy
export XDG_RUNTIME_DIR=/run/user/$(id -u)
  ```
* **安装核心依赖**:
  ```bash
  sudo apt update && sudo apt install -y build-essential curl file git
  ```
* **部署 Homebrew**:
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
  ```

### 2. 核心安装与配置
准备好Telegram创建机器人得到的token、大模型的key
* **一键安装**: `curl -fsSL https://openclaw.ai/install.sh | bash`
* **向导配置**: `openclaw onboard`
* **推荐技能**: `github`, `gemini` (或 `anthropic`), `nano-banana-pro`。
openclaw onboard可以进行重新配置

hetzner芬兰服务器不能访问qwen大模型时，使用Cloudflare的vpn能解决问题
# 安装 Cloudflare WARP 
wget -N https://gitlab.com/fscarmen/warp/-/raw/main/menu.sh && bash menu.sh
# 选 1 安装，之后流量会走 Cloudflare 网络，通常能解决跨海 API 超时


### 3. 内存优化 (针对 1G/2G 内存可以考虑)
开启 2GB Swap 防止崩溃：
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```
---

## 二、 运行篇：连接你的 AI 员工

### 1. 唤醒网关
```bash
openclaw doctor --repair
openclaw gateway restart
```

### 2. Telegram 远程控制
* **获取验证码**: 登录Telegram与机器人对话发送/start
* **审批连接**: `openclaw pairing approve telegram [验证码]`

---

## 三、 卸载篇：优雅地推倒重来

1. **停止服务**: 
   ```bash
   openclaw gateway stop
   systemctl --user disable openclaw-gateway
   ```
2. **清理文件**:
   ```bash
   rm -rf ~/.openclaw
   sudo rm $(which openclaw)
   sudo loginctl disable-linger zzy
   ```

---
*日期: 2026-02-24 | 字数: 239*