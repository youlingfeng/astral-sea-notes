---
title: Docker 使用教程
tags:
  - docker
  - 容器
  - compose
  - 部署
created: 2026-11-06
updated: 2026-11-06
status: 可实操
---

# Docker 使用教程

> [!info] 这篇怎么用
> 从「装 Docker」到「跑起自己的服务」，命令全部可复制。
> 章节按**使用顺序**排，不是按知识体系排——遇到问题直接跳到 [[#13. 排障手册]]。
> 平台差异用标签标出：`Ⓦ` Windows、`Ⓛ` Linux、`Ⓜ` macOS。没标就是三平台通用。

> [!warning] 本机现状（2026-11-06 实测）
> 当前机器是 **Windows**，`docker` 命令不存在，WSL 也**未安装**（提示需要 `wsl --install`）。
> 所以第一次用，请从 [[#2. 安装]] 的 2.1 开始，别跳到后面。

> [!abstract] 相关笔记
> - [[escape/3x-ui 安装与使用.md|3x-ui 安装与使用]] —— 里面有一份用 Docker 部署 3x-ui 的 compose 示例
> - [[AI/AI名词字典.md|AI 名词字典]] —— 遇到 AI 侧术语时对照

## 目录

- [[#1. 心智模型：先想通三件事]]
- [[#2. 安装]]
- [[#3. 五个核心概念]]
- [[#4. 第一个容器：跑通再谈其他]]
- [[#5. docker run 参数详解]]
- [[#6. 常用命令速查]]
- [[#7. 数据持久化]]
- [[#8. 网络]]
- [[#9. 构建自己的镜像（Dockerfile）]]
- [[#10. Docker Compose]]
- [[#11. 实战：三套可直接用的部署]]
- [[#12. 优化：体积、缓存、构建速度]]
- [[#13. 排障手册]]
- [[#14. 安全基线]]
- [[#15. 清理与磁盘]]
- [[#16. 命令总表]]
- [[#17. 参考资料]]

---

## 1. 心智模型：先想通三件事

### 1.1 容器不是虚拟机

|  | 虚拟机 | 容器 |
| --- | --- | --- |
| 隔离层 | 硬件虚拟化，各自跑完整 OS | 共享宿主机内核，进程级隔离 |
| 启动 | 几十秒 | 几十毫秒到几秒 |
| 体积 | GB 级 | MB 级 |
| 本质 | 一台电脑 | **一个被隔离的进程** |

> [!important] 想通这一句就够了
> **容器 = 一个进程 + 一份只读文件系统 + 一套隔离规则。进程退出，容器就结束。**
> 所以「容器起来就退出」不是 bug，是你的程序前台没活干/报错了——见 [[#13. 排障手册]]。

### 1.2 镜像、容器、仓库的关系

```
Dockerfile  --build-->  镜像(image)  --run-->  容器(container)
                          ↑
                   仓库(registry)  ← push/pull
```

- **镜像**：只读模板（分层叠加）。
- **容器**：镜像 + 一层可写层 + 运行时状态。
- **仓库**：存镜像的地方（Docker Hub、GHCR、阿里云 ACR、自建 Harbor）。

### 1.3 容器里的数据天生会丢

容器删了，可写层就没了。**要留住的东西必须放进卷（volume）或绑定宿主机目录**——见 [[#7. 数据持久化]]。

---

## 2. 安装

### 2.1 Ⓦ Windows：两条路，选一条

#### 路线 A（推荐给绝大多数人）：Docker Desktop + WSL2

```powershell
# 1) 以管理员身份打开 PowerShell，先装 WSL2（会要求重启）
wsl --install
wsl --set-default-version 2
wsl --status          # 确认默认版本是 2

# 2) 去官网下 Docker Desktop for Windows 并安装
#    https://www.docker.com/products/docker-desktop/
#    安装时保持勾选 "Use WSL 2 instead of Hyper-V"

# 3) 重启后打开 Docker Desktop，等右下角小鲸鱼变绿

# 4) 验证
docker version
docker run --rm hello-world
```

> [!note] 前置条件（不满足会装不上）
> - Windows 10 21H2+ / Windows 11
> - BIOS 里开启虚拟化（VT-x / AMD-V / SVM）
> - `wsl --install` 需要管理员权限，装完必须重启

> [!warning] Docker Desktop 的授权
> 个人使用、教育、小型企业（员工 < 250 且年收入 < 1000 万美元）免费；**超过就要买订阅**。公司电脑上装之前先确认。

#### 路线 B：只要命令行（WSL2 里装原生 Docker Engine）

适合服务器思路、不想接受 Desktop 授权约束：

```bash
# 在 WSL2 的 Ubuntu 里
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # 免 sudo，重开终端生效
sudo service docker start          # WSL 里需要手动起（或配 systemd）
docker run --rm hello-world
```

> WSL2 默认不自带 systemd，需要 `sudo nano /etc/wsl.conf` 写入 `[boot]` + `systemd=true`，然后 `wsl --shutdown` 重进。

### 2.2 Ⓛ Linux（服务器最常见）

```bash
# 官方脚本（最快，生产环境更推荐按官方 apt/yum 仓库分步装）
curl -fsSL https://get.docker.com | sudo sh

sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker

docker version && docker compose version
```

> [!tip] 想更安全可以上 rootless 模式
> `dockerd-rootless-setuptool.sh install`，容器不再以 root 身份跑。代价是部分功能（低端口、某些网络模式）受限。

### 2.3 Ⓜ macOS

装 Docker Desktop for Mac（Apple Silicon 选 arm64 版）。命令行等价：

```bash
brew install --cask docker
open -a Docker        # 等鲸鱼图标稳定
docker run --rm hello-world
```

### 2.4 装完必做：三件小事

```bash
# 1) 确认 compose 是 v2（用空格，不是横杠）
docker compose version        # ✅ v2.x
# docker-compose version      # ❌ v1 已于 2023 年停止支持，别再用

# 2) 看磁盘占用
docker system df

# 3) 配镜像加速（可选，拉镜像慢时才需要）
```

**镜像加速（可选）**：Docker Desktop → Settings → Docker Engine，在 JSON 里加：

```json
{
  "registry-mirrors": ["https://<你的加速器地址>"]
}
```

> [!warning] 别乱抄网上的公共镜像站
> 2024 年之后大量公共 Docker 镜像站已关停或被滥用。优先用：官方源、云厂商给的**专属加速地址**（阿里云 ACR 需自己开通）、或自建 registry。来路不明的镜像站等于让别人替你决定跑什么代码。

---

## 3. 五个核心概念

| 概念 | 一句话 | 对应命令前缀 |
| --- | --- | --- |
| **镜像** Image | 只读模板，分层存储 | `docker image` / `docker pull` |
| **容器** Container | 镜像跑起来的一个进程实例 | `docker container` / `docker run` |
| **卷** Volume | Docker 管理的持久化存储 | `docker volume` |
| **网络** Network | 容器之间/容器与外部通信的虚拟网络 | `docker network` |
| **仓库** Registry | 存放镜像的服务 | `docker login/pull/push` |

**镜像名的完整格式**：

```
[registry/][namespace/]repository[:tag]
docker.io/library/nginx:1.27-alpine
└ 默认 ┘ └ 默认 ┘ └ 名称 ┘ └ 标签 ┘
```

> [!danger] 不写 tag 就等于 `:latest`
> `docker pull nginx` 拉的是 `nginx:latest`，随时可能变。**生产必须写明确版本**（`nginx:1.27-alpine`），否则哪天重建容器就换了个大版本。

---

## 4. 第一个容器：跑通再谈其他

```bash
# 前台跑一个 nginx（Ctrl+C 结束）
docker run -p 8080:80 nginx:1.27-alpine

# 换个终端或浏览器打开 http://localhost:8080
```

跑通之后，把刚才那条命令拆开看它做了什么：

```bash
docker run -d --name web -p 8080:80 nginx:1.27-alpine
#          ↑后台   ↑起名    ↑端口映射  ↑镜像
```

验证与观察：

```bash
docker ps                      # 正在跑的容器
docker ps -a                   # 包括已退出的
docker logs -f web             # 跟踪日志（排查第一件事）
docker exec -it web sh         # 进容器（alpine 用 sh，debian/ubuntu 用 bash）
docker stop web && docker rm web
```

> [!tip] 端口映射的读法
> `-p 8080:80` = **宿主机 8080 → 容器 80**。左边是外面，右边是里面。
> 反了就是最常见的新手错误。

---

## 5. docker run 参数详解

只列真正会用到的，按重要性排序：

| 参数 | 作用 | 例子 | 备注 |
| --- | --- | --- | --- |
| `-d` | 后台运行 | `-d` | 生产基本都加 |
| `--name` | 给容器起名 | `--name db` | 不起名就只能用随机 ID |
| `-p` | 端口映射 | `-p 8080:80` | `宿主机:容器` |
| `-v` | 挂载 | `-v data:/var/lib/x` | 卷 / 绑定目录，见 §7 |
| `-e` | 环境变量 | `-e TZ=Asia/Shanghai` | 密码别写在命令行，见 §14 |
| `--env-file` | 从文件读环境变量 | `--env-file .env` | 推荐做法 |
| `--restart` | 重启策略 | `--restart unless-stopped` | 服务器必加 |
| `--network` | 加入网络 | `--network mynet` | 见 §8 |
| `--rm` | 退出即删 | `--rm` | 一次性任务用 |
| `-it` | 交互 + 伪终端 | `-it` | 调试进容器用 |
| `--entrypoint` | 覆盖入口点 | `--entrypoint sh` | 镜像起不来时救命 |
| `-m` / `--cpus` | 资源限制 | `-m 512m --cpus 1.5` | 防单容器吃光机器 |
| `--health-cmd` | 健康检查 | 见 §10 | Compose 里更常用 |
| `--platform` | 指定架构 | `--platform linux/amd64` | ARM 机器跑 x86 镜像 |
| `--add-host` | 加 hosts | `--add-host=host.docker.internal:host-gateway` | Linux 上访问宿主机 |

**重启策略怎么选**：

| 值 | 含义 |
| --- | --- |
| `no` | 默认，不自动重启 |
| `on-failure[:N]` | 非 0 退出才重启，可限次数 |
| `always` | 总是重启（手动 stop 也会被拉起来） |
| `unless-stopped` | **服务器推荐**：除非你手动停，否则一直拉起 |

---

## 6. 常用命令速查

```bash
# ── 镜像 ──────────────────────────────
docker pull nginx:1.27-alpine       # 拉
docker images                       # 本地镜像列表
docker rmi <镜像ID>                  # 删镜像
docker image prune -f               # 清掉悬空镜像（<none>）

# ── 容器 ──────────────────────────────
docker ps -a                        # 列表
docker run ...                      # 新建并启动
docker start|stop|restart <名称>     # 启停
docker rm <名称>                     # 删除（-f 强制）
docker logs --tail 200 -f <名称>     # 日志
docker exec -it <名称> sh            # 进容器
docker inspect <名称>                # 全量信息（JSON）
docker stats                        # 实时资源占用
docker cp <名称>:/path ./local       # 拷文件出来
docker top <名称>                    # 容器内进程
docker port <名称>                   # 端口映射

# ── 卷 / 网络 ─────────────────────────
docker volume ls | inspect | rm
docker network ls | inspect | create | rm

# ── 系统 ──────────────────────────────
docker system df                    # 各部分占多少
docker system info                  # 环境信息
docker system prune                 # 清无用对象（见 §15）
```

---

## 7. 数据持久化

### 7.1 三种挂载方式

| 方式 | 写法 | 存在哪 | 适合 |
| --- | --- | --- | --- |
| **命名卷** volume | `-v mydata:/var/lib/mysql` | Docker 管理的区域 | 数据库、要备份的状态数据 |
| **绑定挂载** bind | `-v ./html:/usr/share/nginx/html` | 你指定的宿主机目录 | 配置文件、代码、静态资源 |
| **tmpfs** | `--tmpfs /tmp` | 内存 | 临时缓存，重启即失 |

```bash
# 命名卷（推荐给数据库）
docker run -d --name db -v pgdata:/var/lib/postgresql/data postgres:16

# 绑定挂载（推荐给配置/代码）
docker run -d --name web -p 8080:80 -v ./html:/usr/share/nginx/html:ro nginx:1.27-alpine
#                                                              ↑只读，更安全

# 查卷真实位置
docker volume inspect pgdata
```

### 7.2 ⚠️ 三个必踩的坑

1. **路径写错不报错，只是悄悄新建了一个空目录**
   `-v ./conf/nginx.conf:/etc/nginx/nginx.conf` 如果宿主机文件不存在，Docker 会创建**目录**，容器里就得到一个叫 `nginx.conf` 的文件夹 → nginx 启动失败。
   **先确认宿主机路径存在，且是文件还是目录。**

2. **权限问题（Linux 最常见）**
   容器内 uid 和宿主机 uid 不一致 → `Permission denied`。三种解法：
   - 用命名卷而不是绑定挂载
   - `--user $(id -u):$(id -g)` 以当前用户跑
   - 在镜像里 `chown` 好目录，或用 rootless 模式

3. **Ⓦ Windows 上跨文件系统性能差**
   代码放在 `D:\...` 再挂进容器，IO 会慢一个数量级。
   **把项目放进 WSL2 的文件系统**（`\\wsl$\Ubuntu\home\you\proj`），从 WSL 里 `docker compose`，速度正常。

### 7.3 备份与恢复（数据库必备）

```bash
# 备份
docker exec db pg_dump -U postgres mydb > backup.sql
# 恢复
cat backup.sql | docker exec -i db psql -U postgres mydb

# MySQL 版
docker exec db mysqldump -uroot -p"$PW" mydb > backup.sql
cat backup.sql | docker exec -i db mysql -uroot -p"$PW" mydb
```

---

## 8. 网络

### 8.1 四种网络模式

| 模式 | 含义 | 什么时候用 |
| --- | --- | --- |
| `bridge`（默认） | 私有虚拟网桥 + NAT，容器有内网 IP | 绝大多数场景 |
| `host` | 容器直接用宿主机网络栈 | 需要极致性能/特殊端口时；**Desktop 上行为不一致，别依赖** |
| `none` | 只有 loopback | 完全隔离的批处理 |
| 自定义 bridge | 自己建的 bridge 网络 | **多容器互访必须用这个** |

### 8.2 容器之间怎么互相访问

> [!important] 关键规则
> **默认 bridge 网络里容器只能靠 IP 互访；自定义网络里可以用容器名当域名。**

```bash
docker network create appnet

docker run -d --name db  --network appnet postgres:16
docker run -d --name api --network appnet -p 3000:3000 myapi

# api 容器里可以直接连：postgres://db:5432/...
```

### 8.3 容器访问宿主机

| 平台 | 用什么地址 |
| --- | --- |
| Ⓦ Ⓜ Docker Desktop | `host.docker.internal` |
| Ⓛ Linux | 加 `--add-host=host.docker.internal:host-gateway` 后同样可用；或直接用网桥地址 `172.17.0.1` |

### 8.4 外部访问容器

只有 `-p` 映射出来的端口才能从外面访问。**`EXPOSE` 只是声明，不等于开放。**

```bash
# Ⓦ 查端口冲突
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
# ⓁⓂ
ss -tlnp | grep 8080
```

---

## 9. 构建自己的镜像（Dockerfile）

### 9.1 最小可用的 Node 应用

```dockerfile
FROM node:20-alpine

WORKDIR /app

# ① 先只拷依赖清单 → 依赖不变时这层缓存一直命中
COPY package*.json ./
RUN npm ci --omit=dev

# ② 再拷源码 → 改代码不会让上面重装依赖
COPY . .

# ③ 别用 root 跑
RUN addgroup -S app && adduser -S app -G app
USER app

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t myapi:1.0.0 .
docker run -d --name api -p 3000:3000 myapi:1.0.0
```

### 9.2 多阶段构建（体积能砍 90%）

```dockerfile
# 构建阶段：带编译器、devDependencies
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 运行阶段：只要产物
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
```

### 9.3 十条实用规则

| # | 规则 | 为什么 |
| --- | --- | --- |
| 1 | 用**具体版本标签**，不用 `latest` | 可复现 |
| 2 | 优先 `alpine` / `slim` / `distroless` | 体积与攻击面 |
| 3 | 先 COPY 依赖清单，再 COPY 源码 | 层缓存 |
| 4 | 写 `.dockerignore`（`node_modules`、`.git`、`.env`） | 构建快、不泄密 |
| 5 | 一个容器一个进程 | 否则日志、重启、扩缩容全乱 |
| 6 | `USER` 切非 root | 见 §14 |
| 7 | 用 `COPY` 不用 `ADD` | `ADD` 会偷偷解压/下载 |
| 8 | 不要把密码写进 `ENV`/`ARG` | 镜像层可被提取出来 |
| 9 | 入口用 exec 形式 `["node","x.js"]` | 信号能正确传给进程 |
| 10 | 需要健康检查就写 `HEALTHCHECK` | 编排器才知道它「活着」还是「能干活」 |

### 9.4 直接生成模板

```bash
docker init        # 交互式生成 Dockerfile / compose / .dockerignore
```

---

## 10. Docker Compose

### 10.1 为什么需要它

`docker run` 跑三四个容器时，参数会长到不可维护，而且**顺序、网络、环境变量、重启策略全靠人记**。Compose 就是把这些写进一个 YAML。

### 10.2 完整示例（带健康检查和依赖顺序）

```yaml
# compose.yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD:?缺少 DB_PASSWORD}
      POSTGRES_DB: appdb
      TZ: Asia/Shanghai
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d appdb"]
      interval: 10s
      timeout: 5s
      retries: 5
    # 不映射端口 → 只在 compose 内网可达，更安全

  api:
    build: .
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy    # ⚠️ 关键：等 db 真就绪，不只是「已启动」
    environment:
      DATABASE_URL: postgres://postgres:${DB_PASSWORD}@db:5432/appdb
      TZ: Asia/Shanghai
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

配套 `.env`（**不要提交到 git**）：

```
DB_PASSWORD=换成强密码
```

### 10.3 常用命令

```bash
docker compose up -d                 # 起（后台）
docker compose up -d --build         # 改了代码重新构建
docker compose ps                    # 状态（含健康状态）
docker compose logs -f api           # 跟日志
docker compose exec api sh           # 进容器
docker compose restart api           # 只重启某个服务
docker compose down                  # 停并删容器/网络（保留卷）
docker compose down -v               # ⚠️ 连卷一起删，数据没了
docker compose config                # 校验并展开变量（排错神器）
```

### 10.4 五个高频坑

1. **`depends_on` 不等于「等服务就绪」**——它只保证启动顺序。要等就绪必须配 `healthcheck` + `condition: service_healthy`。
2. **服务名就是主机名**：`api` 里连数据库写 `db:5432`，不是 `localhost:5432`。
3. **改 `ports` 后必须 `up -d` 重建**，`restart` 不会应用新配置。
4. **`down` 会删网络**，重建后容器 IP 变了——所以永远用服务名，别写 IP。
5. **YAML 缩进用空格**，Tab 会直接报错。

---

## 11. 实战：三套可直接用的部署

### 11.1 Nginx 静态站 + Caddy 自动 HTTPS（最省心）

```yaml
services:
  web:
    image: nginx:1.27-alpine
    restart: unless-stopped
    volumes:
      - ./html:/usr/share/nginx/html:ro

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on:
      - web

volumes:
  caddy_data:
```

`./Caddyfile`：

```
example.com {
    reverse_proxy web:80
}
```

```bash
docker compose up -d      # 证书自动申请、自动续期
```

> Caddy 的卖点：域名解析指过来就自动签证书，不用碰 certbot。

### 11.2 PostgreSQL（生产向）

```bash
docker run -d --name pg \
  -e POSTGRES_PASSWORD='换成强密码' \
  -e POSTGRES_DB=appdb \
  -e TZ=Asia/Shanghai \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

```bash
docker exec -it pg psql -U postgres -d appdb    # 进 psql
docker exec pg pg_dump -U postgres appdb > backup.sql
```

> [!note] 数据目录以镜像文档为准
> 官方镜像的 `PGDATA` 布局在近年大版本里调整过（PG 18 起有变化）。升级大版本前**务必先备份并看官方镜像页说明**，别直接换 tag。

### 11.3 3x-ui（和已有笔记配套）

```yaml
services:
  3xui:
    image: ghcr.io/mhsanaei/3x-ui:latest    # 生产建议锁定具体版本
    container_name: 3xui_app
    restart: unless-stopped
    volumes:
      - ./db/:/etc/x-ui/
      - ./cert/:/root/cert/
    environment:
      XUI_ENABLE_FAIL2BAN: "false"
    ports:
      - "127.0.0.1:2053:2053/tcp"    # 面板只绑本机，走 SSH 隧道
      - "443:443/tcp"
      - "2096:2096/tcp"
```

```bash
docker compose up -d && docker compose logs -f 3xui
docker exec -it 3xui_app x-ui     # 看凭据 / 改设置
```

完整的面板加固、端口放行、节点配置看 [[escape/3x-ui 安装与使用.md|3x-ui 安装与使用]]。
注意其中「Docker 部署时 ports 必须映射每个入站端口」这一条。

---

## 12. 优化：体积、缓存、构建速度

```bash
# 看镜像每层多大（找肥胖层）
docker history --no-trunc myapi:1.0.0
docker image ls --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

# 构建时看完整输出（默认会被折叠）
docker build --progress=plain -t myapi:1.0.0 .

# 清构建缓存
docker builder prune
```

| 优化手段 | 收益 |
| --- | --- |
| 多阶段构建 | 体积常降 50–90% |
| 换 alpine / slim 基础镜像 | 体积、攻击面 |
| 合并 `RUN` 减少层数（但别过度） | 体积 |
| `.dockerignore` | 构建速度、上下文大小 |
| 依赖先拷 + BuildKit 缓存挂载 `--mount=type=cache` | 重复构建快数倍 |
| ARM 机器上跑 x86 镜像加 `--platform linux/amd64` | 能跑，但**性能损失明显**，优先找原生 arm64 镜像 |

---

## 13. 排障手册

### 13.1 先看三样东西

```bash
docker ps -a                        # 状态码 Exited (x)
docker logs --tail 100 <名称>        # 应用自己的报错
docker inspect <名称> --format '{{.State.ExitCode}} {{.State.Error}}'
```

### 13.2 退出码含义（容器「起来就退出」必查）

| 退出码 | 含义 | 常见原因 |
| --- | --- | --- |
| `0` | 正常结束 | 你的程序跑完就退出了（前台进程结束了容器就结束） |
| `1` | 应用错误 | 配置错、依赖缺失、端口占用 |
| `126` | 命令不可执行 | 缺执行权限 |
| `127` | 命令不存在 | `CMD` 写错、入口脚本不存在 |
| `137` | 被 SIGKILL | **OOM 被杀** 或 `docker stop` 超时强杀 |
| `143` | 被 SIGTERM | 正常收到停止信号 |

### 13.3 症状 → 原因对照

| 症状 | 最可能原因 | 处理 |
| --- | --- | --- |
| 容器启动后立刻退出 | 前台进程结束 / 命令错 | 看日志和退出码；`--entrypoint sh` 进去手工试 |
| 浏览器打不开，容器在跑 | 端口映射错或没映射 | 检查 `-p 宿主机:容器`，`docker port` |
| `port is already allocated` | 宿主机端口被占 | Ⓦ `Get-NetTCPConnection -LocalPort 8080`；Ⓛ `ss -tlnp` |
| 容器间连不上 | 不在同一自定义网络 / 用了 localhost | 建网络、用服务名 |
| 挂载后容器里是空目录 | 宿主机路径不存在或写错 | 先确认路径存在且是文件 |
| `Permission denied` 写文件 | uid 不匹配 / 只读挂载 | 见 §7.2 |
| 数据库容器重建后数据没了 | 没挂卷，或挂了错的路径 | 检查 `volumes` |
| 拉镜像超时 / TLS 错误 | 网络、加速器、证书 | 换网络；配 registry-mirrors；`docker login` |
| 磁盘满 `no space left` | 镜像/日志/构建缓存堆积 | 见 §15 |
| Ⓦ Docker Desktop 起不来 | 虚拟化没开 / WSL 异常 | BIOS 开虚拟化；`wsl --update`；重置 Desktop |
| Ⓦ WSL2 吃满内存 | 默认不设上限 | `%UserProfile%\.wslconfig` 里设 `memory=4GB` 后 `wsl --shutdown` |
| 容器里时间不对 | 默认 UTC | `-e TZ=Asia/Shanghai` |
| `exec format error` | 架构不匹配（ARM 跑 x86 镜像） | `--platform linux/amd64` 或换 arm64 镜像 |
| 改了 compose 不生效 | 只 `restart` 没重建 | `docker compose up -d` |

### 13.4 进不去容器时的三个招

```bash
# 1) 换 shell（可能没有 bash）
docker exec -it <名称> sh

# 2) 覆盖入口点，绕过启动脚本
docker run -it --entrypoint sh <镜像>

# 3) 拷出日志/配置看
docker cp <名称>:/var/log/app.log ./app.log
```

---

## 14. 安全基线

> [!danger] 十条，从上往下越重要
> 1. **容器默认是 root**。Dockerfile 里写 `USER`，或 `--user` 指定。
> 2. **别把密钥写进镜像**。`ENV`/`ARG`/`COPY .env` 都会留在层里，`docker history` 能挖出来。用运行时 `--env-file` 或 secrets。
> 3. **别挂 `/var/run/docker.sock`**；挂了等于把宿主机 root 交出去。
> 4. **别用 `--privileged`**。要能力就精确加 `--cap-add`。
> 5. **不要 `latest`**，也不要盲目 `docker pull` 后自动上线。
> 6. 只映射必要端口；数据库别对公网开 `-p 5432:5432`。
> 7. `:ro` 只读挂载配置文件。
> 8. 限制资源：`-m`、`--cpus`、`--pids-limit`，防一个容器拖垮整机。
> 9. 定期扫漏洞：`docker scout cves <镜像>`。
> 10. 生产环境考虑 rootless + 只读根文件系统（`--read-only` + `--tmpfs /tmp`）。

---

## 15. 清理与磁盘

```bash
docker system df                    # 先看谁占地方
docker system df -v                 # 细到每个镜像/卷

# 安全清理（不影响在跑的容器）
docker container prune              # 已停止的容器
docker image prune                  # 悬空镜像
docker builder prune                # 构建缓存
docker volume prune                 # ⚠️ 未使用的卷（可能含数据）

# 一把梭（会删掉所有未使用对象，含卷）
docker system prune -a --volumes    # ⚠️⚠️ 确认再执行
```

> [!warning] 日志也能吃掉几十 G
> 容器日志默认无上限。给单容器限制大小需要改 daemon 配置（`log-opts`），或在 compose 里写 `logging.options.max-size`。
> 临时救急：`truncate -s 0 $(docker inspect --format='{{.LogPath}}' <名称>)`

---

## 16. 命令总表

```bash
# 环境
docker version / info
docker system df / prune

# 镜像
docker pull / images / rmi / tag / save / load / history / inspect
docker build -t name:tag .
docker push

# 容器
docker run / ps / start / stop / restart / rm / logs / exec / cp / inspect / stats / top / port

# 卷与网络
docker volume ls / create / inspect / rm
docker network ls / create / inspect / rm

# Compose
docker compose up -d [--build] / down [-v] / ps / logs -f / exec / restart / config
```

---

## 17. 参考资料

- [Docker 官方文档](https://docs.docker.com/) · [Dockerfile 参考](https://docs.docker.com/reference/dockerfile/) · [Compose 文件参考](https://docs.docker.com/reference/compose-file/)
- [Docker Engine 版本说明（当前 29.x 线）](https://docs.docker.com/engine/release-notes/)
- [Docker Desktop 安装（Windows）](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Play with Docker（浏览器里试命令，不用装）](https://labs.play-with-docker.com/)
- 镜像仓库：[Docker Hub](https://hub.docker.com/) · [GitHub Container Registry](https://ghcr.io)

> [!tip] 学习顺序建议
> 先能用 `docker run` 跑起现成镜像 → 再学 `-v` 和 `--network` → 再写第一个 Dockerfile → 最后上 Compose。
> 跳过前三步直接抄 compose，出问题时你会完全不知道从哪查。

---

> [!caution] 免责
> 本文为技术操作记录。请遵守所在地法律法规与相关服务条款，勿用于违法或滥用用途。
