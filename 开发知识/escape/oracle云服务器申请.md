---
title: Oracle 云免费服务器申请（注册 → 开实例 → 通网）
tags:
  - oracle-cloud
  - vps
  - 建站
created: 2026-11-04
updated: 2026-11-04
status: 可实操
---

# Oracle 云免费服务器申请

> [!info] 这篇笔记解决什么
> 从「注册甲骨文云账号」→「过审」→「开出免费实例」→「SSH 连上」→「端口放通」的完整链路。
> 服务端软件（3x-ui）和客户端（v2rayN）各自单独成篇，见下方相关笔记。

> [!abstract] 相关笔记（三篇互相引用）
> - [[escape/oracle云服务器申请.md|Oracle 云服务器申请]] ← 本篇：注册、过审、开实例、SSH、端口
> - [[escape/3x-ui 安装与使用.md|3x-ui 安装与使用]]：面板部署、加固、VLESS+REALITY、订阅、排障
> - [[escape/v2rayN 使用教程.md|v2rayN 使用教程]]：Windows 客户端导入、系统代理 / TUN、分流、测速

**总耗时预估**：注册 10–20 分钟（可能卡审核 1–3 天）；开实例 5 分钟（ARM 抢不到可能几天）；后续装面板约 10 分钟。

---

## 目录

- [[#1. 免费额度到底给多少（2026 官方口径）]]
- [[#2. 申请前准备：四样东西]]
- [[#3. 注册流程（step by step）]]
- [[#4. 注册 / 审核常见坑]]
- [[#5. 创建实例（AMD 与 ARM 两条路）]]
- [[#6. 抢 ARM 实例的实战策略]]
- [[#7. 首次 SSH 连接]]
- [[#8. 放行端口：三层防火墙，少一层都连不上]]
- [[#9. 下一步：装 3x-ui 面板]]
- [[#10. 踩坑速查清单]]
- [[#11. 日常维护与防回收]]
- [[#12. 命令速查表（系统与端口）]]
- [[#13. 参考资料]]

---

## 1. 免费额度到底给多少（2026 官方口径）

来源：[Oracle 官方 Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)（页面版权 2026）。

| 资源 | 额度 | 备注 |
| --- | --- | --- |
| **AMD 微型实例** `VM.Standard.E2.1.Micro` | **2 台** | 1/8 OCPU（可突发）、**1 GB 内存**、50 Mbps 出网 |
| **ARM 实例** `VM.Standard.A1.Flex` | 每月 **1500 OCPU 小时 + 9000 GB 小时** → 折算 **2 OCPU / 12 GB** | 可拆成 1–2 台，弹性分配 |
| **块存储**（引导卷 + 块卷合计） | **200 GB** | 引导卷默认 50 GB，最小 47 GB |
| **卷备份** | 5 个 | |
| **出站流量** | **10 TB / 月** | 对个人用完全够 |
| **VCN** | 免费账户最多 2 个 | |
| 对象存储 / 负载均衡 / 监控等 | 另有额度 | 一般用不到 |

> [!warning] ⚠️ 关于「4 核 24G」的旧教程
> 大量 2023–2024 年的中文教程写「ARM 免费 4 OCPU / 24 GB」，**那是旧额度**。现在官方文档和控制台给的是 **2 OCPU / 12 GB**。别照着旧教程填 4/24，会提示超出免费额度、产生扣费风险。
> **以控制台 `Always Free-eligible` 标注和 Limits 页面为准。**

> [!danger] ⚠️ 闲置实例会被回收（官方政策，很多人不知道）
> 官方明确：在 **连续 7 天**内同时满足以下条件，实例被判定为 idle，**可能被直接回收**：
> - CPU 利用率 P95 < 20%
> - 网络利用率 < 20%
> - 内存利用率 < 20%（**仅对 ARM A1 生效**）
>
> 反制办法见 [[#11. 日常维护与防回收]]。

> [!tip] 两个区域限制
> - `E2.1.Micro` 只能在家区域的**某一个**可用性域创建（AD-1 常见）。
> - `A1.Flex` 可在任意 AD 创建，**韩国春川（Chuncheon）除外**。

---

## 2. 申请前准备：四样东西

### 2.1 邮箱
- 用 **Gmail / Outlook / 自建域名邮箱**。国内 QQ、163 邮箱通过率明显偏低，且容易被判为高风险。
- 一个邮箱只注册一个账号。

### 2.2 支付方式（最关键的卡点）
- 必须 **Visa 或 Mastercard**，支持美元、支持 **3D Secure**（会拉起银行 App / 短信验证）。
- **银联单标卡不行**；预付卡、礼品卡几乎必拒；JCB/Amex/Discover 成功率低。
- 推荐顺序：**国内主流银行实体 Visa/MC 信用卡 > 双币借记卡 > 海外虚拟卡**。
- **账单地址必须和发卡行记录一致**（国内卡就填真实地址的拼音，国家选 China）。⚠️ 拿国内卡却填美国地址，是 AVS 校验失败和风控触发的第一号原因。
- 卡里留足额度：会做 **$1 左右预授权**（验证后撤销，不是真扣）。部分卡会显示为 $1 冻结。

### 2.3 手机号
- +86 手机号可以收验证码，正常用。

### 2.4 网络环境
- 全程使用**同一个干净出口 IP**，最好是自己 VPS 的 IP 或干净的住宅 IP。
- **不要**用公共/免费节点（IP 信誉差、共享人数多）、**不要**中途切换国家、不要用指纹浏览器过度伪装。
- 浏览器用 Chrome 无痕窗口，清空 Cookie，避免和其他 Oracle 账号串味。

> [!important] 一句话原则
> 让 Oracle 认为你是一个**真实的、资料前后一致的普通用户**。所有信息（IP 国家、地址、卡的发卡国）尽量自洽，不要「一半中国一半美国」。

---

## 3. 注册流程（step by step）

### 3.1 入口
- 简体中文注册页：<https://www.oracle.com/cn/cloud/free/>
- 点「**免费开始使用**」→ 进入 `signup.cloud.oracle.com`

### 3.2 填写步骤

1. **国家 / 地区**：填 **China**（用国内卡就用中国，别造假）。
2. **姓名**：用**拼音**，与银行卡持卡人一致（如 `ZHANG SAN`）。
3. **邮箱** + 验证码验证。
4. **设置密码**：12 位以上、大小写+数字+符号。
5. **账户类型**：选「**个人**（Individual）」。
6. **手机号**：+86，收短信验证码。
7. **地址**：省/市/区/详细地址，用拼音或英文填写，**邮编必须正确**（AVS 会校验）。
8. **信用卡信息**：卡号、有效期、CVV、持卡人姓名（拼音）、账单地址（同上）。
9. **⚠️ 选择主区域（Home Region）** —— 见下方重点。
10. 勾选同意条款 → 提交。

### 3.3 ⚠️ 主区域（Home Region）选定后**永久不可更改**

这是最大的坑之一。选错了只能**注销账号重新注册**。选择建议：

| 区域 | Region 标识 | 国内延迟 | ARM 容量 | 适合 |
| --- | --- | --- | --- | --- |
| 日本大阪 | `ap-osaka-1` | 低（30–60 ms） | 紧张 | 首选，国内访问快 |
| 日本东京 | `ap-tokyo-1` | 低 | 极紧张 | 快但难抢 |
| 韩国首尔 | `ap-seoul-1` | 低 | 紧张 | 备选 |
| 新加坡 | `ap-singapore-1` | 中（60–90 ms） | 极紧张 | 东南亚业务 |
| 美国凤凰城 | `us-phoenix-1` | 高（150–200 ms） | **相对宽松** | 只求开得出来机器 |
| 美国阿什本 | `us-ashburn-1` | 高 | 相对宽松 | 同上 |

> [!tip] 决策思路
> - **目的只是跑通、拿到机器** → 选美西（`us-phoenix-1`），ARM 好抢，延迟忍一忍。
> - **目的要低延迟** → 日本大阪，但做好「ARM 可能几天抢不到」的准备，先用 AMD Micro 顶着。
> - 注意：**只有家区域**才有 Always Free 额度，跨区域创建的资源是要收费的。

### 3.4 提交之后会发生什么

| 结果 | 现象 | 处理 |
| --- | --- | --- |
| ✅ 立刻通过 | 直接进控制台，收到欢迎邮件 | 正常继续 |
| ⏳ 人工审核 | 提示 24 小时内邮件通知 | **耐心等 1–3 天**，不要重复注册 |
| ❌ 被拒 | "We're unable to complete your request" | 见下节 |

---

## 4. 注册 / 审核常见坑

### 4.1 注册被拒的六大原因

| 原因 | 说明 | 规避 |
| --- | --- | --- |
| **资料造假** | 姓名/地址/卡信息对不上，AVS 失败 | 全程真实信息，地址拼音 + 正确邮编 |
| **卡不合规** | 银联单标、预付卡、虚拟卡 BIN 被拉黑 | 用实体 Visa/MC 信用卡 |
| **IP 不干净** | 公共机场节点、数据中心 IP、频繁切换国家 | 独享/干净 IP，全程同一出口 |
| **一卡多号** | 同一张卡/同一手机号注册多个账号 | **一卡一号，一人一号** |
| **邮箱域名差** | QQ/163/临时邮箱 | Gmail / Outlook / 域名邮箱 |
| **重复注册** | 被拒后马上换邮箱再注册，被判关联 | 失败后**等 1–2 天**再换全套资料 |

### 4.2 账号被停用 / 被回收的常见原因
- 长期不登录、实例长期空闲（触发 idle 回收）。
- 被判定滥用（大量发信、扫描、跑代理农场）。
- 关联账号被风控波及。
- 出站 25 端口：⚠️ **免费账户默认禁止出站 TCP 25**，想发邮件要单独提 Service Limit 申请，别以为是配置错了。

### 4.3 想提高成功率、还想抢 ARM：升 PAYG（按需付费）

社区共识：**升级 PAYG 是「白嫖甲骨文」的最优解**——Always Free 额度内的资源继续免费，账单仍是 $0，但：
- ARM 抢机成功率**大幅提升**（不再只盯着免费池）
- 账号更稳定，不易被回收
- 可以用更多实例类型

**升级要点（来自社区踩坑汇总）：**
1. 必须 Visa/MC + 3DS + AVS 通过。
2. **全程同一干净 IP**：登录 → 加卡 → 点升级，不要中途切 IP、不要刷新、不要重复点击。
3. 失败后**别狂点**，等几小时或换天，换卡 + 清 Cookie 再试。
4. 一卡一账号。
5. 升级成功**立刻设预算告警**：`Billing & Cost Management → Budgets`，防止误开付费资源。

> [!warning] PAYG 的真实风险
> 升 PAYG 后你的账户**真的能扣费**。以下东西会花钱：Windows 镜像、超出 2 OCPU/12 GB 的 ARM、超过 200 GB 的块存储、超出 10 TB 的出站、跨区域资源、高规格 shape。**只创建带 `Always Free-eligible` 标签的资源。**

---

## 5. 创建实例（AMD 与 ARM 两条路）

### 5.1 进入创建页
控制台右上角切到 **家区域** → 左上汉堡菜单 → **Compute → Instances** → **Create instance**。

### 5.2 逐项填写

| 字段 | 填什么 | 注意 |
| --- | --- | --- |
| **Name** | `3xui-osaka` 之类 | 随意 |
| **Compartment** | 保持默认（root） | |
| **Image** | `Canonical Ubuntu` → **22.04** 或 **24.04** | 也可 `Oracle Linux 9`；⚠️ Windows 镜像**不免费** |
| **Shape** | 见下方二选一 | 必须带 `Always Free-eligible` 标签 |
| **Primary VNIC** | 选已有 VCN / 新建，**Subnet 选 Public**，勾选 **Assign a public IPv4 address** | ⚠️ 不勾就没公网 IP，等于白开 |
| **SSH keys** | 见 5.4 | ⚠️ 私钥只给一次 |
| **Boot volume** | 默认 50 GB，可改大到 200 GB | 全部实例引导卷之和 ≤ 200 GB |

**Shape 二选一：**

- **AMD 路线（开得出来最重要）**
  `Shape` 里选 **`VM.Standard.E2.1.Micro`** → 1/8 OCPU / 1 GB。
  够跑 3x-ui 面板 + 轻量代理，但内存小，**别装 Docker**。
- **ARM 路线（性能好，可能抢不到）**
  选 **`VM.Standard.A1.Flex`** → OCPU 填 **2**、内存填 **12 GB**（免费上限）。
  或者拆成 **1 OCPU / 6 GB × 2 台**。
  - 想省着用：1 OCPU / 6 GB 单台也够跑 3x-ui。
  - ⚠️ 填超 2/12 就会开始计费。

### 5.3 创建
点 **Create** → 状态从 `PROVISIONING` → `RUNNING`（约 1–2 分钟）。
记下 **Public IP address**（形如 `123.45.67.89`）。

> [!note] 公网 IP 默认是临时的
> 默认分配的是 **临时公网 IP（Ephemeral）**，实例**终止后 IP 会变**。
> 想固定：`Networking → Reserved public IPs → Reserve`，再把实例的公网 IP 换成保留 IP（免费额度内）。或者干脆**绑定域名**。

### 5.4 SSH 密钥（两种方式，别选错）

**方式 A：让 Oracle 生成（最简单）**
- 选 `Generate a key pair for me` → **立刻下载私钥** `ssh-key-xxx.key`（只给一次，关掉就没了）。
- 私钥文件权限要收紧（Windows 用 `icacls`，Linux `chmod 600`）。

**方式 B：用自己的公钥（推荐，可复用）**
- 本地生成：`ssh-keygen -t ed25519 -C "oracle-3xui"`
- 选 `Paste public keys`，粘贴 `~/.ssh/id_ed25519.pub` 的内容。

> [!danger] ⚠️ Oracle 不给你 root 密码
> 默认**只允许密钥登录**，用户名为：
> - Ubuntu 镜像 → `ubuntu`
> - Oracle Linux 镜像 → `opc`
> 忘了下载私钥 = 实例白开（只能重建）。

---

## 6. 抢 ARM 实例的实战策略

报错 `Out of host capacity` = 家区域免费 ARM 池没容量。官方建议：**换可用性域（AD）** 或 **等一会儿再试**。

按性价比排序：

1. **换 AD**：实例创建页 `Availability domain` 换 `AD-1 / AD-2 / AD-3` 逐个试。多 AD 区域（如大阪、凤凰城）成功率高得多。
2. **手动错峰**：社区经验，凌晨、整点前后、月末/月初释放较多，可以每天点几次。
3. **缩小规格**：要 2/12 抢不到，先试 **1 OCPU / 6 GB**，开出来后再「编辑 shape」扩到 2/12（通常不需要重新抢容量，但改大也可能再次报容量不足，做好回滚准备）。
4. **上自动化脚本**：社区有 `oci-arm-host-capacity` 系列脚本，用 OCI API 定时重试创建，抢到就停。
   - 仓库：<https://github.com/JBX2060/oci-arm-host-capacity>
   - 需要先在 OCI 生成 **API Key**（`Profile → My profile → API keys`）和 `config` 文件。
   - ⚠️ 脚本里要写死 compartment OCID、image OCID、AD、SSH 公钥；间隔建议 ≥ 60 秒，别把账号刷进风控。
5. **升级 PAYG**（见 4.3）：对容量帮助最大，但要想清楚计费风险。

---

## 7. 首次 SSH 连接

### 7.1 命令行（Linux / macOS / Windows 10+ 自带 OpenSSH）

```bash
# 权限收紧
chmod 600 ~/Downloads/ssh-key-2026-11-04.key

# 连接（Ubuntu 镜像）
ssh -i ~/Downloads/ssh-key-2026-11-04.key ubuntu@123.45.67.89

# Oracle Linux 镜像
ssh -i ~/Downloads/ssh-key-2026-11-04.key opc@123.45.67.89
```

### 7.2 Windows 上私钥权限问题

报错 `WARNING: UNPROTECTED PRIVATE KEY FILE` 或 `Permission denied`：

```powershell
icacls "C:\Users\你\Downloads\ssh-key.key" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

### 7.3 常见连接失败

| 现象 | 原因 |
| --- | --- |
| `Connection timed out` | 安全列表没放行 22 端口 / 实例没公网 IP |
| `Permission denied (publickey)` | 用户名错（别用 root）、私钥不对、公钥没写进 `~/.ssh/authorized_keys` |
| `Host key verification failed` | 换了 IP 但旧指纹还在：`ssh-keygen -R 123.45.67.89` |

---

## 8. 放行端口：三层防火墙，少一层都连不上

这是新手 90% 的「面板打不开 / 节点连不上」原因。Oracle 有**三层**：

```
① 云安全列表 Security List（在 OCI 控制台）
        ↓
② 系统防火墙 iptables / firewalld（在实例内）
        ↓
③ 应用监听（3x-ui / Xray 自己 bind 的端口）
```

### 8.1 第一层：OCI 安全列表（Ingress 规则）

控制台路径：
`Compute → Instances → 点实例 → Primary VNIC 里的 Subnet → Security Lists → Default Security List → Add Ingress Rules`

典型规则：

| Stateless | Source Type | Source CIDR | IP Protocol | Destination Port Range | 用途 |
| --- | --- | --- | --- | --- | --- |
| No | CIDR | `0.0.0.0/0` | TCP | `22` | SSH（可收紧到自家 IP） |
| No | CIDR | `0.0.0.0/0` | TCP | `443` | 节点 / TLS |
| No | CIDR | `0.0.0.0/0` | TCP | `2096` | 订阅端口 |
| No | CIDR | `自家IP/32` | TCP | `面板端口` | 面板（强烈建议限 IP） |
| No | CIDR | `0.0.0.0/0` | UDP | `443` | 若用 Hysteria/QUIC |

> [!warning] ⚠️ 别图省事开「全部端口对 0.0.0.0/0」
> 面板端口暴露在公网会被爆破。面板端口**只放行自己的 IP**，或用 SSH 隧道。

### 8.2 第二层：实例内防火墙

#### Ubuntu（Oracle 的 Ubuntu 镜像预置了 iptables REJECT 规则）

先看现状：

```bash
sudo iptables -L INPUT -n --line-numbers
```

如果末尾有 `REJECT --reject-with icmp-host-prohibited`，说明默认拒绝。

**临时放行（立即生效，重启丢失）：**

```bash
# 插入位置要在 REJECT 之前，所以用 -I INPUT <行号>
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 2096 -j ACCEPT
```

**持久化（推荐：直接改规则文件）：**

```bash
sudo nano /etc/iptables/rules.v4
# 在 *filter 段落里、COMMIT 之前，加入：
# -A INPUT -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT
# -A INPUT -p tcp -m state --state NEW -m tcp --dport 2096 -j ACCEPT

sudo netfilter-persistent save     # 或：
sudo iptables-restore < /etc/iptables/rules.v4
```

#### Oracle Linux / CentOS / Rocky（用 firewalld）

```bash
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=2096/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

#### ufw

```bash
# ⚠️ 先放行 SSH，再 enable，否则锁死自己
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw allow 2096/tcp
sudo ufw enable
sudo ufw status verbose
```

### 8.3 第三层：应用监听
3x-ui 面板端口和 Xray 入站端口是**两个独立监听**。只放行面板端口 ≠ 节点能用。

### 8.4 自检命令

```bash
# 本机监听（0.0.0.0:443 正常；127.0.0.1:443 则外部连不上）
sudo ss -tlnp | grep -E '443|2096'

# 从外部测（在你本地机器跑）
nc -vz 123.45.67.89 443
```

---

## 9. 下一步：装 3x-ui 面板

实例通了、端口放行了，接下来是服务端面板和 Windows 客户端。这两块单独成篇，避免主线笔记越写越长：

| 要做的事 | 看哪篇 |
| --- | --- |
| 装 3x-ui、加固面板、加 VLESS+REALITY 节点、配订阅、排障、备份卸载 | [[escape/3x-ui 安装与使用.md\|3x-ui 安装与使用]] |
| Windows 电脑导入节点、系统代理 / TUN、分流、测速 | [[escape/v2rayN 使用教程.md\|v2rayN 使用教程]] |

装 3x-ui 之前只需要确认三件事：

1. SSH 能连上 —— 见 [[#7. 首次 SSH 连接]]
2. 443 / 2096 / 面板端口已在 OCI 安全列表放行 —— 见 [[#8. 放行端口：三层防火墙，少一层都连不上]]
3. 系统已 `apt update`，且装了 `curl`、`socat`

---

## 10. 踩坑速查清单

### 注册阶段
- [ ] 用了 **Gmail/Outlook**，不是 QQ/163
- [ ] **实体 Visa/MC 信用卡**，账单地址与发卡行一致（国内卡 → 国家 China + 地址拼音）
- [ ] 全程**同一干净 IP**，无痕窗口
- [ ] **Home Region 一次选对**（选定不可改！）
- [ ] 一卡一号，被拒后**等 1–2 天**再换全套资料
- [ ] 知道 $1 预授权是验证不是扣费

### 开实例阶段
- [ ] Shape 打了 **`Always Free-eligible`** 标签
- [ ] ARM 填 **2 OCPU / 12 GB**（不是旧教程的 4/24）
- [ ] Subnet 是 **Public** 且勾了 **Assign public IPv4**
- [ ] **私钥下载并保存好了**（只给一次）
- [ ] 引导卷总量 ≤ 200 GB
- [ ] ARM 抢不到 → 换 AD / 缩规格 / 脚本 / 考虑 PAYG

### 端口阶段（最容易翻车）
- [ ] OCI **Security List** Ingress 放行了目标端口
- [ ] **系统防火墙**（iptables / firewalld / ufw）放行
- [ ] 面板端口 ≠ 节点端口，两个都要放行
- [ ] 改 SSH 端口前**先放行新端口**，并保持一个会话不断

### 后续（细节见对应笔记）
- [ ] 3x-ui 装完立刻改密码 / 改端口 / 随机路径 / 开 2FA → [[escape/3x-ui 安装与使用.md\|3x-ui 笔记 §5]]
- [ ] REALITY 的 dest 是 TLS1.3+H2 真站点、SNI 匹配、flow 两端都填 → [[escape/3x-ui 安装与使用.md\|3x-ui 笔记 §8]]
- [ ] v2rayN 导入后能用真连接延迟测通，而不是只看 Tcping → [[escape/v2rayN 使用教程.md\|v2rayN 笔记 §9]]

### 长期
- [ ] 设了 **Budget 告警**
- [ ] 知道 **7 天 idle 会被回收**（CPU/网络 <20%，ARM 还看内存）
- [ ] 定期登录，定期备份面板数据库

---

## 11. 日常维护与防回收

### 11.1 防闲置回收（针对 ARM）

官方规则是 7 天内 CPU P95 / 网络 / 内存都 < 20% 才会被回收。日常用起来基本不会触发；但机器闲置太久，与其提心吊胆，不如：

- 保持跑点轻量东西（面板本身、监控、定时备份），自然就有活动量。
- 真长期不用：主动降级或释放，免得哪天被回收丢数据。

> [!note] 说明
> 这里不建议用「制造假负载」去绕开平台的闲置检测——那属于规避条款，账号风险自负。

### 11.2 账单安全

- `Billing & Cost Management → Budgets` 设 **$1 预算告警**，超出立刻邮件。
- 每月看一眼 `Billing → Cost Analysis`，确认是 $0。
- 只创建带 `Always Free-eligible` 的资源。

---

## 12. 命令速查表（系统与端口）

```bash
# ── 端口与监听 ─────────────────────────────
sudo ss -tlnp | grep -E '443|2096|面板端口'
sudo iptables -L INPUT -n --line-numbers
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo firewall-cmd --permanent --add-port=443/tcp && sudo firewall-cmd --reload
sudo ufw allow 443/tcp && sudo ufw status

# ── 系统 ───────────────────────────────────
sudo timedatectl set-timezone Asia/Shanghai
sudo timedatectl set-ntp true
sysctl net.ipv4.tcp_congestion_control    # 应是 bbr
df -h && free -h
sudo journalctl -u x-ui -n 100 --no-pager

# ── 外部连通性测试（本地机器上跑）────────────
nc -vz 123.45.67.89 443
```

> 3x-ui 自己的命令/菜单速查在 [[escape/3x-ui 安装与使用.md#12. 命令速查表|3x-ui 笔记 §12]]。

---

## 13. 参考资料

**Oracle 官方**
- [Always Free Resources（免费额度权威口径）](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Oracle 云免费套餐 FAQ（中文）](https://www.oracle.com/cn/cloud/free/faq/)
- [免费套餐注册入口（简体中文）](https://www.oracle.com/cn/cloud/free/)
- [Launching Your First Linux Instance（建实例官方教程）](https://docs.oracle.com/en-us/iaas/Content/GSG/Reference/overviewworkflow.htm)

**社区实战**
- [甲骨文云账户升级 PAYG 避坑指南（华为云社区）](https://bbs.huaweicloud.com/blogs/490261) — 信用卡、IP、风控、失败补救
- [Oracle Cloud 免费 VPS 申请指南（duanku-guides）](https://github.com/wlzh/duanku-guides/blob/main/articles/oracle-vps.md)
- [oci-arm-host-capacity（抢 ARM 脚本）](https://github.com/JBX2060/oci-arm-host-capacity)
- [Open Ports on Oracle Cloud（安全列表 + iptables）](https://github.com/ivansaul/blog/blob/master/docs/linux/guides/open-ports-on-oracle-cloud.md)

**本系列另两篇**
- [[escape/3x-ui 安装与使用.md|3x-ui 安装与使用]] · 官方文档 [安装](https://docs.sanaei.dev/zh/docs/guide/installation/) / [REALITY](https://docs.sanaei.dev/zh/docs/config/reality/)
- [[escape/v2rayN 使用教程.md|v2rayN 使用教程]] · 官方仓库 [2dust/v2rayN](https://github.com/2dust/v2rayN)

---

> [!caution] 免责
> 本文为技术操作记录。云厂商政策、免费额度、风控规则会随时变化，**以控制台和官方文档为准**。请遵守 Oracle 服务条款及所在地法律法规，勿用于滥用、扫描、发垃圾邮件等行为；账号因违规被封的后果自负。
