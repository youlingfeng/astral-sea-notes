---
title: 3x-ui 安装与使用（服务端面板）
tags:
  - 3x-ui
  - xray
  - vless
  - reality
  - 代理
  - 面板
created: 2026-11-04
updated: 2026-11-04
status: 可实操
---

# 3x-ui 安装与使用

> [!abstract] 相关笔记（三篇互相引用）
> - [[escape/oracle云服务器申请.md|Oracle 云服务器申请]] ← **前置**：注册、过审、开实例、SSH、三层端口放行
> - [[escape/3x-ui 安装与使用.md|3x-ui 安装与使用]] ← 本篇：服务端面板部署、加固、加节点、订阅、排障
> - [[escape/v2rayN 使用教程.md|v2rayN 使用教程]] ← **后续**：Windows 客户端导入节点、系统代理 / TUN、分流、测速

> [!info] 一句话定位
> 3x-ui 是 **Xray-core 的 Web 管理面板**。你在这里点鼠标就能建入站、加客户端、生成分享链接和订阅，不用手写 JSON。
> 它管的是**服务器端**；电脑/手机上的客户端看 [[escape/v2rayN 使用教程.md|v2rayN 使用教程]]。

**整条链路**：

```
Oracle 免费实例（Oracle 笔记 §5）
        ↓  SSH + 三层端口（Oracle 笔记 §7 §8）
装 3x-ui（本篇 §3）
        ↓  加固面板（本篇 §5）
建 VLESS+REALITY 入站（本篇 §8）
        ↓  生成链接 / 订阅（本篇 §9）
v2rayN 导入并开代理（v2rayN 笔记 §5 §7）
```

---

## 目录

- [[#1. 装 3x-ui 需要先有什么]]
- [[#2. 架构速览：面板、内核、端口]]
- [[#3. 安装]]
- [[#4. 拿到凭据并首次登录]]
- [[#5. 面板加固（装完立刻做）]]
- [[#6. 端口放行：面板端口 ≠ 节点端口]]
- [[#7. x-ui 管理菜单全表]]
- [[#8. 添加节点：VLESS + REALITY + Vision]]
- [[#9. 客户端与订阅]]
- [[#10. 排障手册]]
- [[#11. 备份 / 更新 / 卸载]]
- [[#12. 命令速查表]]
- [[#13. 参考资料]]

---

## 1. 装 3x-ui 需要先有什么

按顺序确认，缺一条就先去补：

- [ ] **一台境外 Linux 服务器**（Ubuntu 22.04/24.04 或 Oracle Linux 9），能 SSH 登录
      → [[escape/oracle云服务器申请.md#5. 创建实例（AMD 与 ARM 两条路）|Oracle 笔记 §5]]
- [ ] **SSH 连得上**，密钥权限正常
      → [[escape/oracle云服务器申请.md#7. 首次 SSH 连接|Oracle 笔记 §7]]
- [ ] 心里有「**三层端口**」这个概念：云安全列表 → 系统防火墙 → 应用监听
      → [[escape/oracle云服务器申请.md#8. 放行端口：三层防火墙，少一层都连不上|Oracle 笔记 §8]]
- [ ] 服务器上 `curl`、`socat` 可用；系统时间正确（REALITY / TLS 对时间敏感）
- [ ] 1 GB 内存的 AMD Micro 实例：**别装 Docker**，用脚本直装更省资源

> [!tip] 端口规划（先规划再动手，能省一半排障时间）
> | 用途 | 建议端口 | 谁监听 | 要不要对公网开放 |
> | --- | --- | --- | --- |
> | 面板 Web | 随机高位端口（如 38472） | 3x-ui 自己 | ⚠️ 只对自己 IP / SSH 隧道 |
> | 节点入站 | 443（TCP） | Xray-core | ✅ 对 0.0.0.0/0 |
> | 订阅 | 2096 | 订阅服务 | ✅ 但建议配 TLS |
> | SSH | 22 或改成高位端口 | sshd | ✅（可限源 IP） |

---

## 2. 架构速览：面板、内核、端口

装 3x-ui 一次，你会得到四样东西：

| 东西 | 位置 | 作用 |
| --- | --- | --- |
| **面板进程**（3x-ui） | systemd 服务 `x-ui` | Web 界面，管配置、账号、订阅 |
| **Xray-core** | 由面板生成配置并拉起 | 真正处理代理流量的内核 |
| **管理命令** | `/usr/local/x-ui/x-ui` → `x-ui` | 菜单、更新、改密码、看日志 |
| **数据库** | `/etc/x-ui/x-ui.db`（SQLite） | 入站、客户端、设置、流量统计 |

> [!important] 面板端口和节点端口是**两个独立监听**
> 只放行面板端口 ≠ 节点能用；反过来只放行 443 ≠ 面板能打开。
> 面板重启 ≠ Xray 重启（菜单 15 单独重启 Xray）。

---

## 3. 安装

官方文档：[安装](https://docs.sanaei.dev/zh/docs/guide/installation/)

### 3.1 系统准备

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl ca-certificates socat

# Oracle Linux / RHEL 系
sudo dnf update -y && sudo dnf install -y curl socat

# 时间与时区（REALITY / 证书都依赖正确时间）
sudo timedatectl set-ntp true
sudo timedatectl set-timezone Asia/Shanghai
date
```

### 3.2 一键安装（官方脚本，推荐）

```bash
bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)
```

变体：

```bash
# 指定版本
bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh) v3.4.0

# 滚动开发版（不稳定，别上生产）
bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh) dev-latest

# 全程非交互（自动化 / cloud-init）
XUI_NONINTERACTIVE=1 bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)
```

> [!warning] 这个脚本是以 root 执行的
> 先用 `curl -fSLo /tmp/3xui.sh https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh` 下载、`less` 看一眼再跑，是更稳的习惯。
> **不要**在服务器上装来路不明的「一键增强 / 汉化破解」脚本——它们和 root 权限等价。

> [!tip] 下载卡住怎么办
> VPS 在海外，GitHub raw 一般直连即可。卡住多半是 DNS：先试 `curl -4 -fSLo /tmp/i.sh --connect-timeout 10 https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh`。
> 官方也提供中文本地化安装脚本镜像（仅翻译提示、不改逻辑）：<https://github.com/V2RaySSR/3x-ui-cn-installer>

### 3.3 Docker 安装（可选）

适合想「文件夹备份 = 全套备份」的场景。注意 `ports` 必须把面板端口、订阅端口、**每个入站端口**都映射出来，否则容器内开着、外面连不上。

```yaml
services:
  3xui:
    image: ${XUI_IMAGE:?填一个审过的 tag}
    container_name: 3xui_app
    volumes:
      - ./db/:/etc/x-ui/
      - ./cert/:/root/cert/
    environment:
      XUI_ENABLE_FAIL2BAN: "false"
    ports:
      - "127.0.0.1:2053:2053/tcp"   # 面板只绑本机，走 SSH 隧道最安全
      - "443:443/tcp"
      - "2096:2096/tcp"
    restart: unless-stopped
```

```bash
docker compose up -d && docker compose logs -f 3xui
```

> 1 GB 内存的 Micro 实例不建议 Docker：镜像 + 运行时就要吃掉一半内存。

---

## 4. 拿到凭据并首次登录

官方文档：[首次登录](https://docs.sanaei.dev/zh/docs/guide/first-login/)

### 4.1 ⚠️ 脚本会**随机生成**用户名、密码、面板端口、Web 根路径

安装结束时会打印一份摘要，同时写入仅 root 可读的文件：

```bash
sudo cat /etc/x-ui/install-result.env
```

```
XUI_USERNAME=xxxx
XUI_PASSWORD=xxxx
XUI_PANEL_PORT=38472
XUI_WEB_BASE_PATH=/aBcD9fGh/
XUI_ACCESS_URL=http://IP:38472/aBcD9fGh/
XUI_API_TOKEN=...
XUI_DB_TYPE=sqlite
```

错过了、或者想再查一遍：

```bash
x-ui                # 进菜单 → 选 11（View Current Settings）
x-ui settings       # 一条命令直接打印
```

### 4.2 打开面板

```
http://<服务器IP>:<面板端口><Web根路径>
例：http://123.45.67.89:38472/aBcD9fGh/
```

打不开 → 99% 是端口没放行，回 [[#6. 端口放行：面板端口 ≠ 节点端口]]。

### 4.3 内置保护（不用配，知道就好）

| 机制 | 默认行为 |
| --- | --- |
| 暴力破解限制 | 同 IP/用户名 5 分钟内失败 5 次 → 封 15 分钟 |
| 错误提示 | 账号错、2FA 错都只提示 "wrong username or password" |
| 会话时长 | `sessionMaxAge`，默认 360 分钟 |
| 改凭据 | 立即注销所有会话；如开了 2FA 会一并关闭 |

> 如果面板还在用 `admin` / `admin`，说明你装到了很旧的版本 —— **立刻改**。

---

## 5. 面板加固（装完立刻做）

> [!danger] 顺序：先加固，再加节点
> 一个裸奔在公网 2053 端口的 3x-ui，几小时内就会被扫描器爆破。

### 5.1 必做四件事

| # | 动作 | 怎么点 |
| --- | --- | --- |
| 1 | 换强密码（12 位随机） | 菜单 `7`，或面板「面板设置」 |
| 2 | 换端口 + 随机 Web 根路径 | 菜单 `10` 改端口、`8` 随机化路径 |
| 3 | 开 2FA（TOTP） | 面板设置里启用，用 Google Authenticator / Aegis |
| 4 | 面板走 HTTPS | 菜单 `20` 申请 Let's Encrypt（需域名），或反代 |

### 5.2 面板入口只给自己

按推荐度排序：

1. **安全列表限源 IP**：把面板端口那条 Ingress 规则的来源改成 `你的公网IP/32`
   → [[escape/oracle云服务器申请.md#8.1 第一层：OCI 安全列表（Ingress 规则）|Oracle 笔记 §8.1]]
2. **SSH 隧道**（最干净，面板完全不上公网）：菜单 `24` 把面板绑到 `127.0.0.1`，本地：

```bash
ssh -L 8080:127.0.0.1:38472 -i key ubuntu@123.45.67.89
# 然后浏览器开 http://127.0.0.1:8080/aBcD9fGh/
```

3. **域名 + Cloudflare 代理 + IP 白名单**（Access / WAF 规则）

### 5.3 系统侧顺手加固

```bash
# 改 SSH 端口：⚠️ 先在安全列表放行新端口，并留一个已连上的会话
sudo nano /etc/ssh/sshd_config     # Port 22222 / PasswordAuthentication no
sudo systemctl restart ssh

# 防爆破
sudo apt-get install -y fail2ban && sudo systemctl enable --now fail2ban

# 开 BBR
x-ui      # 菜单 26
# 或手动
echo "net.core.default_qdisc=fq" | sudo tee -a /etc/sysctl.conf
echo "net.ipv4.tcp_congestion_control=bbr" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p && sysctl net.ipv4.tcp_congestion_control
```

### 5.4 建 API Token（想自动化时用）

面板设置里生成 Token，之后调 `/panel/api/*` 用 `Authorization: Bearer <token>`，比拿账号密码安全。常用只读接口：

```bash
curl -fsS -H "Authorization: Bearer $XUI_API_TOKEN" "http://IP:PORT/PATH/panel/api/server/status"
curl -fsS -H "Authorization: Bearer $XUI_API_TOKEN" "http://IP:PORT/PATH/panel/api/inbounds/list/slim"
```

---

## 6. 端口放行：面板端口 ≠ 节点端口

三层要全部对上，最后一层是应用自己监听。完整原理与 OCI 安全列表操作见
→ [[escape/oracle云服务器申请.md#8. 放行端口：三层防火墙，少一层都连不上|Oracle 笔记 §8]]

### 6.1 OCI 安全列表（第一层）

`Compute → Instances → 点实例 → Subnet → Security Lists → Default Security List → Add Ingress Rules`

| 端口 | 协议 | 来源 | 用途 |
| --- | --- | --- | --- |
| `443` | TCP | `0.0.0.0/0` | 节点入站 |
| `2096` | TCP | `0.0.0.0/0` | 订阅 |
| 面板端口 | TCP | `你的IP/32` | 面板（别开 0.0.0.0/0） |
| `22` 或自定义 | TCP | `你的IP/32` | SSH |

### 6.2 系统防火墙（第二层）

```bash
# Ubuntu（Oracle 镜像默认带 iptables REJECT，先看）
sudo iptables -L INPUT -n --line-numbers

# 临时放行（插到 REJECT 之前）
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 2096 -j ACCEPT

# 持久化：改 /etc/iptables/rules.v4 后
sudo netfilter-persistent save        # 或 sudo iptables-restore < /etc/iptables/rules.v4
```

```bash
# Oracle Linux / Rocky（firewalld）
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=2096/tcp
sudo firewall-cmd --reload && sudo firewall-cmd --list-all
```

```bash
# ufw（菜单 23 也是这套）
sudo ufw allow 22/tcp && sudo ufw allow 443/tcp && sudo ufw allow 2096/tcp
sudo ufw enable && sudo ufw status verbose     # ⚠️ 先放行 22 再 enable
```

### 6.3 自检

```bash
sudo ss -tlnp | grep -E '443|2096|x-ui'    # 0.0.0.0:443 才对；127.0.0.1 外部连不上

# 在自己电脑上测
nc -vz 123.45.67.89 443
curl -I http://123.45.67.89:38472/aBcD9fGh/
```

---

## 7. x-ui 管理菜单全表

运行 `x-ui` 进入交互菜单：

| 编号 | 功能 | 备注 |
| --- | --- | --- |
| 1 | Install | 从远程脚本（重）安装 |
| 2 | Update | 更新到最新**稳定版**（= `x-ui update`） |
| 3 | Update to Dev Channel | 更新到 `dev-latest` |
| 4 | Update Menu | 只更新菜单脚本 |
| 5 | Legacy Version | 装指定旧版本 |
| 6 | Uninstall | 卸载（**删数据库**） |
| 7 | Reset Username & Password | 改账号密码，可同时关 2FA |
| 8 | Reset Web Base Path | 随机化 Web 根路径 |
| 9 | Reset Settings | 重置面板设置（保留账户） |
| 10 | Change Port | 改面板端口 |
| 11 | View Current Settings | 看用户名/端口/路径/证书路径 |
| 12–14 | Start / Stop / Restart | 控制面板服务 |
| 15 | Restart Xray | 只重载内核 |
| 16 | Check Status | 服务状态 |
| 17 | Logs Management | 看 / 清日志 |
| 18–19 | Autostart Enable / Disable | 开机自启 |
| 20 | SSL Certificate | Let's Encrypt（域名或 IP）、自定义、续期/吊销 |
| 21 | Cloudflare SSL | DNS-01 通配符证书 |
| 22 | IP Limit | 基于 Fail2ban 的按客户端 IP 限制 |
| 23 | Firewall | `ufw` 安装与规则 |
| 24 | SSH Port Forwarding | 面板绑 localhost + 隧道访问 |
| 25 | PostgreSQL | 安装 / 迁移 / 管理 |
| 26 | Enable BBR | BBR 开关 |
| 27 | Update Geo Files | geoip / geosite |
| 28 | Speedtest | Ookla 测速 |
| 0 | Exit | 退出 |

命令行子命令：

```bash
x-ui start|stop|restart     # 控制服务
x-ui restart-xray           # 只重启内核
x-ui status                 # 状态
x-ui settings               # 当前设置
x-ui enable|disable         # 开机自启
x-ui log                    # 实时日志
x-ui banlog                 # Fail2ban 封禁日志
x-ui update | update-dev    # 更新
x-ui update-all-geofiles    # 更新 geo 文件
x-ui uninstall              # 卸载
```

---

## 8. 添加节点：VLESS + REALITY + Vision

官方文档：[REALITY](https://docs.sanaei.dev/zh/docs/config/reality/)

**为什么选它**：不用买域名、不用配证书，借用真实大站的 TLS 握手做伪装，抗 DPI 强、速度快。

### 8.1 面板操作（1 → 6）

1. 左侧 **入站列表 → 添加入站**
2. 基础项：备注 `vless-reality-443`、协议 `vless`、端口 `443`、**安全 `reality`**
3. REALITY 参数（见下表）
4. **添加客户端**：填 email（如 `me-pc`），UUID 自动生成，**flow 填 `xtls-rprx-vision`**
5. 保存 → 确认 443 已在安全列表 + 系统防火墙放行
6. 客户端右侧 **二维码 / 复制链接** → 拿去客户端（[[escape/v2rayN 使用教程.md#5. 导入节点的三种方式|v2rayN 笔记 §5]]）

### 8.2 参数对照表

| 字段 | 填什么 | 说明 |
| --- | --- | --- |
| **Dest (target)** | `www.microsoft.com:443` 这类 | 真实站点，**支持 TLS 1.3 + HTTP/2**，且你所在地区可访问 |
| **SNI / Server Names** | 与 dest 证书一致 | 填错就是握手暴露 |
| **Public / Private key** | 点按钮生成（x25519） | **私钥只在服务器**，客户端只拿公钥 |
| **Short IDs** | 生成 1–2 个十六进制串 | 客户端用其中一个 |
| **Flow** | `xtls-rprx-vision` | 服务端 + 客户端都要填 |
| **Fingerprint (uTLS)** | `chrome` | 常用、兼容好 |

生成的链接形如：

```
vless://<uuid>@<IP>:443?type=tcp&security=reality&encryption=none
&flow=xtls-rprx-vision&sni=www.microsoft.com&fp=chrome
&pbk=<公钥>&sid=<short-id>&spx=%2F#vless-reality-443
```

### 8.3 ⚠️ 五个经典坑

| 坑 | 表现 | 解决 |
| --- | --- | --- |
| **dest 选得差** | 连不上 / 明显被识别 | 选真实、TLS1.3+H2、你这边能访问的大站 |
| **SNI 不匹配** | 握手失败 | SNI 必须等于 dest 证书域名 |
| **flow 漏填** | 能连但不通、速度异常 | 两端都写 `xtls-rprx-vision` |
| **REALITY 套 CDN** | 完全不通 | REALITY **不能**挂 CDN / 反代 |
| **客户端太老** | 密钥对仍被拒 | 新版 Xray 涉及 ML-KEM 兼容，升级客户端；必要时按官方文档处理 `X25519MLKEM768` |

### 8.4 备选方案

| 方案 | 端口 | 证书 | 特点 |
| --- | --- | --- | --- |
| **Trojan + TLS** | 443 | 需要真证书 | 兼容面广，可套 CDN |
| **VLESS / VMess + WS + TLS** | 443 | 需要真证书 | CDN 友好，可 80/443 反代 |
| **Hysteria2** | **UDP** 443 | 自带 | 弱网/高丢包环境快；客户端要选 sing-box 内核 |

有域名时的最快路径：

1. 域名 A 记录指向 VPS IP（申请证书时先关 Cloudflare 小黄云，或用 DNS-01）
2. `x-ui` 菜单 `20` → 输入域名 → 申请 Let's Encrypt
3. 面板设置里把**面板本身**也指向这张证书

---

## 9. 客户端与订阅

### 9.1 单节点导入

入站列表 → 客户端 → **二维码 / 复制 `vless://` 链接** → 客户端粘贴导入。
电脑端详细步骤（含手动逐项填写对照）见 [[escape/v2rayN 使用教程.md|v2rayN 使用教程]]。

### 9.2 订阅（多设备 / 多人）

官方文档：[订阅](https://docs.sanaei.dev/zh/docs/config/subscription/)

面板 **设置 → 订阅**：

| 设置项 | 默认 | 说明 |
| --- | --- | --- |
| `subEnable` | 开启 | 订阅服务总开关 |
| `subPort` | **2096** | 独立于面板端口，**必须放行** |
| `subPath` | 每个面板随机 | 基础路径 |
| `subDomain` | 空 | 设置后只响应这个 Host |
| `subEncrypt` | true | 内容 base64 |
| `subUpdates` | 12 | 提示客户端刷新间隔（小时） |

URL 形态：

```
https://<域名或IP>:2096/<subPath>/<客户端 subId>
```

**按客户端选端点：**

| 客户端 | 用哪个端点 |
| --- | --- |
| v2rayN / v2rayNG / Shadowrocket | `subPath`（原始链接，base64） |
| Clash Verge Rev / Mihomo | `/mihomo/<sub-id>` |
| 老版 Clash for Windows | `/clash-legacy/<sub-id>`（只含兼容节点，可能 422） |
| Xray JSON 配置 | `subJsonPath` |

> [!warning] 订阅内容就是节点凭据
> 别用 `http://IP:2096` 明文长期裸奔。给订阅端口配 TLS（`subCertFile` / `subKeyFile`）或走反代。
> 同一个 `subId` 泄露 = 别人可以蹭你的流量、看到你的节点。

### 9.3 多用户 / 限流

客户端属性里可以设：

| 字段 | 含义 |
| --- | --- |
| `totalGB` | 流量上限（0 = 不限） |
| `expiryTime` | 到期时间（0 = 永不） |
| `limitIp` | 同时在线 IP 数（⚠️ 依赖 Fail2ban + Xray access log） |
| `reset` | 每 N 天自动重置流量 |

---

## 10. 排障手册

### 10.1 分层定位

```
面板打不开？
├─ 是 → ① 服务在跑吗：x-ui status
│        ② 端口在听吗：ss -tlnp | grep 面板端口
│        ③ 安全列表放行了吗（OCI 控制台）
│        ④ 系统防火墙放行了吗（iptables / firewalld / ufw）
│        ⑤ 路径对不对（Web 根路径、http vs https）
└─ 否 → Xray 在跑吗：x-ui 菜单 16 / x-ui log
         ├─ 否 → 配置错，看日志 → 菜单 15 重启 Xray
         └─ 是 → 只有某个客户端不行？
                 ├─ 是 → enable / 到期 / 流量超限 / 链接过期 → 重生成链接
                 └─ 否 → 入站端口、协议、REALITY 参数、CDN、服务器网络
```

### 10.2 对照表

| 现象 | 排查重点 | 处理 |
| --- | --- | --- |
| 面板连不上 / 502 | 服务、端口、三层防火墙 | `x-ui status`、`ss -tlnp`、回 §6 |
| 节点全都不通 | 入站端口没放行 / Xray 没跑 | 放行端口、菜单 15、看 `x-ui log` |
| REALITY 连不上 | SNI / pbk / sid / fp / flow / 套了 CDN | 面板重新生成链接；REALITY 不挂 CDN |
| 能连但打不开网页 | 内核没跑 / 路由错 / DNS 污染 | 看客户端日志与真连接延迟（v2rayN 笔记 §9） |
| 流量一直 0 | Xray 配置错、客户端 email 缺失、旧模板 | 看日志 + 重置默认模板保存一次 |
| `limitIp` 不生效 | Fail2ban 没装、access log 没开 | 开 access log、装 Fail2ban |
| 订阅 0 个节点 | 订阅没开、2096 没放行、subId 错、客户端过期 | 逐项核对；面板里预览订阅内容 |
| 磁盘满 | access/error 日志暴涨 | 关 access log 或轮转：`journalctl --vacuum-size=200M` |
| `database is locked` | SQLite + 慢盘 + 频繁写 | 减日志；大规模迁 PostgreSQL（菜单 25） |
| 部分网站 403 | 出口 IP 被目标站限制 | 配 WARP / 分流，别全量走代理 |
| TLS / REALITY 报时间错 | 系统时间漂移 | `sudo timedatectl set-ntp true`、`date` 核对 |

### 10.3 一条命令看状态

```bash
x-ui status; sudo ss -tlnp | grep -E '443|2096|x-ui'; sudo tail -n 50 /usr/local/x-ui/*.log 2>/dev/null
```

---

## 11. 备份 / 更新 / 卸载

### 11.1 备份（改任何东西之前）

```bash
# 停服务后拷贝最稳（WAL 模式下热拷可能丢数据）
sudo systemctl stop x-ui
sudo cp /etc/x-ui/x-ui.db /root/x-ui-$(date +%F).db
sudo systemctl start x-ui

# 或用 sqlite 在线备份
sudo sqlite3 /etc/x-ui/x-ui.db ".backup '/root/x-ui-$(date +%F).db'"
```

再把备份**拉到本地**。Docker 部署就备份 `./db/` 和 `./cert/` 两个目录。

### 11.2 更新

```bash
x-ui update        # 稳定版（= 菜单 2）
x-ui update-dev    # 滚动 dev 版，慎用
```

跨大版本前**先备份数据库**，否则回滚很痛苦（要旧版本 + 兼容的旧库）。

### 11.3 卸载

```bash
x-ui uninstall     # = 菜单 6
```

⚠️ 会删掉 `/etc/x-ui/`（含数据库）和安装目录。先备份。

---

## 12. 命令速查表

```bash
# 安装
bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)

# 凭据 / 设置
sudo cat /etc/x-ui/install-result.env
x-ui settings

# 服务与内核
x-ui start | stop | restart
x-ui restart-xray
x-ui status
x-ui log
x-ui banlog

# 更新 / 卸载
x-ui update
x-ui uninstall

# 端口与监听
sudo ss -tlnp | grep -E '443|2096|x-ui'
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo firewall-cmd --permanent --add-port=443/tcp && sudo firewall-cmd --reload
sudo ufw allow 443/tcp && sudo ufw status

# 备份
sudo cp /etc/x-ui/x-ui.db /root/x-ui-$(date +%F).db

# 访问面板
http://<IP>:<端口><Web根路径>
ssh -L 8080:127.0.0.1:<端口> -i key ubuntu@<IP>
```

---

## 13. 参考资料

- 官方文档：[安装](https://docs.sanaei.dev/zh/docs/guide/installation/) · [首次登录](https://docs.sanaei.dev/zh/docs/guide/first-login/) · [更新与卸载](https://docs.sanaei.dev/zh/docs/guide/update-uninstall/)
- 配置篇：[REALITY](https://docs.sanaei.dev/zh/docs/config/reality/) · [订阅](https://docs.sanaei.dev/zh/docs/config/subscription/) · [客户端](https://docs.sanaei.dev/zh/docs/config/clients/) · [入站与协议](https://docs.sanaei.dev/zh/docs/config/inbounds/)
- [GitHub MHSanaei/3x-ui](https://github.com/MHSanaei/3x-ui)
- [3x-ui 最佳实践（含 API、备份、排障决策树）](https://github.com/XKHoshizora/cross-border-network-best-practices/blob/master/3x-ui-best-practices/README.md)
- [3x-ui 中文本地化安装脚本](https://github.com/V2RaySSR/3x-ui-cn-installer)

**本系列另两篇**
- [[escape/oracle云服务器申请.md|Oracle 云服务器申请]]
- [[escape/v2rayN 使用教程.md|v2rayN 使用教程]]

---

> [!caution] 免责
> 本文为技术操作记录。请遵守所在云厂商服务条款及当地法律法规，勿用于滥用、扫描、垃圾邮件等行为。
