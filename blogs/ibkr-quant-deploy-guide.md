# 盈透证券 (IBKR) 量化系统云服务器部署终极指南

这是一份基于实战调试整理出的生产级部署方案，解决了时区对齐、网络映射、算法本地化（无需 TA-Lib）以及实盘/模拟盘无缝切换的核心痛点。

## 一、 环境初始化 (Root 用户)

### 1. 设置美东时间 (EST/EDT)
确保日志和定时任务与美股交易时间同步。
```bash
timedatectl set-timezone America/New_York
date # 验证显示 EST 或 EDT
```

### 2. 创建目录结构
```bash
mkdir -p /root/quant_bot/src
cd /root/quant_bot
```

## 二、 配置文件部署 (Host 网络模式)

### 1. 账号环境 (.env)
```bash
cat > .env <<EOF
IB_USER=你的用户名
IB_PASS=你的密码
TRADING_MODE=paper  # 默认模拟盘
VNC_PASS=StrongPass123
SOCAT_ACTIVE=false  # Host模式不需要转发
EOF
```

### 2. Docker Compose 配置
使用 `network_mode: host` 彻底解决 NAT 和端口映射导致的连接失败。
```yaml
version: '3.8'
services:
  ib-gateway:
    image: ghcr.io/gnzsnz/ib-gateway:stable
    container_name: ib-gateway
    restart: always
    env_file: .env
    volumes:
      - ./jts.ini:/home/ibgateway/Jts/jts.ini
    network_mode: host
```

### 3. 网关配置 (jts.ini)
**重要**：写入后必须修正权限。
```ini
[IBGateway]
LocalServerPort=4000
ApiOnly=true
[Logon]
TimeZone=America/New_York
tradingMode=p # p 为模拟盘，l 为实盘
[API]
ApiPort=4002  # 模拟盘 4002，实盘 4001
ReadOnlyApi=false
```
```bash
chown 1000:1000 jts.ini && chmod 664 jts.ini
```

## 三、 Python 策略部署 (Pandas 东财算法版)

无需安装复杂的 `TA-Lib`，直接使用纯 `Pandas` 实现与东方财富/同花顺对齐的 MACD 和 RSI 算法。

### 1. 算法核心 (calc_indicators.py)
- **RSI Wilder 平滑**: `gain.ewm(alpha=1/period).mean()`
- **MACD (东财版)**: `macd_bar = (dif - dea) * 2`

### 2. 策略运行
```bash
python3 -m venv venv
source venv/bin/activate
pip install pandas numpy ib_insync
python src/main.py
```

## 四、 模拟盘 (Paper) <-> 实盘 (Live) 切换手册

### 场景 A：切换到实盘 (Live)
1. **环境变量**: `sed -i 's/TRADING_MODE=paper/TRADING_MODE=live/g' .env`
2. **网关设置**: 
   - 修改 `tradingMode=l`
   - 修改 `ApiPort=4001`
   - `chown 1000:1000 jts.ini`
3. **代码修改**: 将 Python 代码中的 `PORT` 改为 `4001`。
4. **重启**: `docker compose down && docker compose up -d` (准备手机 2FA 批准)。

### 场景 B：切回模拟盘 (Paper)
1. **环境变量**: `sed -i 's/TRADING_MODE=live/TRADING_MODE=paper/g' .env`
2. **网关设置**: 修改 `tradingMode=p` 及 `ApiPort=4002`。
3. **代码修改**: 端口改为 `4002`。
4. **重启**: `docker compose down && docker compose up -d`。

---
*日期: 2026-02-17 | 字数: 1500*
