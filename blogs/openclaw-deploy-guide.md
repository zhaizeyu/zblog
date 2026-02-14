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
* **一键安装**: `curl -fsSL https://openclaw.ai/install.sh | bash`
* **向导配置**: `openclaw onboard`
* **推荐技能**: `github`, `gemini` (或 `anthropic`), `nano-banana-pro`。

### 3. 解决 IP 地区报错 (关键)
若遇到 `User location is not supported`，修改 `~/.openclaw/agents/main/agent/auth-profiles.json`，在 google 配置中添加：
`"baseUrl": "https://gateway.openclaw.ai/google"`

---

## 二、 运行篇：连接你的 AI 员工

### 1. 唤醒网关
激活 linger 确保服务常驻：
```bash
sudo loginctl enable-linger zzy
openclaw gateway restart
```

### 2. Telegram 远程控制
* **获取验证码**: `openclaw gateway logs --follow`
* **审批连接**: `openclaw pairing approve telegram [验证码]`

### 3. 内存优化 (针对 1G/2G 内存)
开启 2GB Swap 防止崩溃：
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

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

## 💡 经验总结
* **DMIT 2G**: 甜点级配置，IP 干净，基本免代理。
* **RackNerd**: 性价比高，但需配置 API 代理。
* **模型**: Claude 3.5 Sonnet 逻辑强；Gemini 1.5 看图准；DeepSeek 省钱且无限制。


---
*日期: 2026-02-14 | 字数: 249*