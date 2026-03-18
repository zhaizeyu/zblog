# Debian 云服务器基于 Xray 搭建 VLESS-XTLS-Reality 节点保姆级教程

在当前的各种代理协议中，**VLESS + TCP + Reality** 方案以其极高的隐匿性（模拟真实网站 TLS 流量）和卓越的性能表现，成为了目前的主流选择。本文将详细记录在 Debian 系统上从零开始搭建的全过程。

---

## 🚀 核心优势

* **无需域名**：Reality 协议通过借用他人服务器的证书，省去了购买和维护域名的成本。
* **极高性能**：配合 XTLS-Vision 流控，速度几乎接近裸奔。
* **难以识别**：伪装成正常的 HTTPS 流量，有效应对特征检测。

---

## 🛠️ 第一步：环境准备与内核优化

首先，确保你的服务器系统为 **Debian 11/12**，并以 `root` 用户登录。

### 1. 安装 Xray 内核

使用官方一键脚本进行安装：

```bash
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

```

### 2. 开启 BBR 加速

BBR 拥塞控制算法能显著提升在高延迟环境下的传输速度。

```bash
echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
sysctl -p

```

---

## 🔑 第二步：生成关键凭证

Reality 协议需要一组唯一的 ID 和密钥对。

### 1. 生成用户 UUID

```bash
xray uuid

```

*（请记录输出的 UUID，例如：`10a8c2e4-a989-42b8-8803-d739007f3bec`）*

### 2. 生成 Reality 密钥对

```bash
xray x25519

```

* **Private key**: 填入服务端配置文件。
* **Public key**: 记录下来，稍后在客户端连接时使用。

---

## 📝 第三步：配置服务端

编辑 Xray 配置文件：
`nano /usr/local/etc/xray/config.json`

**直接复制以下内容（请替换其中的 UUID 和 私钥）：**

```json
{
    "log": {
        "loglevel": "warning"
    },
    "inbounds": [
        {
            "port": 443,
            "protocol": "vless",
            "settings": {
                "clients": [
                    {
                        "id": "你的UUID",
                        "flow": "xtls-rprx-vision"
                    }
                ],
                "decryption": "none"
            },
            "streamSettings": {
                "network": "tcp",
                "security": "reality",
                "realitySettings": {
                    "show": false,
                    "dest": "www.microsoft.com:443",
                    "xver": 0,
                    "serverNames": ["www.microsoft.com"],
                    "privateKey": "你的私钥",
                    "shortIds": ["6a8b9c1d"]
                }
            }
        }
    ],
    "outbounds": [
        {
            "protocol": "freedom",
            "tag": "direct"
        }
    ]
}

```

---

## 🚦 第四步：启动服务

保存文件并退出后，执行以下命令：

```bash
# 重启 Xray
systemctl restart xray

# 检查服务状态
systemctl status xray

```

如果看到绿色的 **`active (running)`**，说明你的服务端已经搭建成功。

---

## 📱 第五步：客户端连接 (OneXray/v2rayN)

你可以手动填写参数，也可以使用下面的通用链接模板（将参数替换为你自己的）：

### 链接格式

`vless://你的UUID@服务器IP:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.microsoft.com&fp=chrome&pbk=你的公钥&sid=6a8b9c1d#My_Debian_Node`

### 参数速查表

| 参数项 | 值 |
| --- | --- |
| **地址** | 你的服务器 IP |
| **端口** | 443 |
| **协议** | VLESS |
| **传输方式** | TCP |
| **安全类型** | REALITY |
| **流控 (Flow)** | xtls-rprx-vision |
| **SNI** | [www.microsoft.com](https://www.microsoft.com) |
| **PublicKey** | 你刚才生成的公钥 |
| **ShortId** | 6a8b9c1d (需与服务端一致) |

---

## ⚠️ 常见排错

1. **端口放行**：请确保云服务商控制台的安全组已放行 **TCP 443** 端口。
2. **时间误差**：服务器和手机/电脑的时间误差必须在 **90秒** 以内，否则握手会失败。可以使用 `date` 命令核对。
3. **日志查看**：若连接不畅，可查看实时日志：`journalctl -u xray -f`。

---
*日期: 2026-03-18 | 字数: 2155*