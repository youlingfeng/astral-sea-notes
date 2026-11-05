# astral-sea-notes 设计文档

> 版本：v0.1（设计评审稿）
> 日期：2026-11-04
> 状态：待评审 —— 第 9 章列出 10 项必须先决策/修复的技术问题，其中 R1/R2/R3 会直接导致脚本跑不起来

---

## 0. 阅读指引

| 你想知道 | 看第几章 |
|---|---|
| 这东西到底做什么、不做什么 | 1 |
| 整体怎么跑起来的 | 3 |
| 三个 json 长什么样（前后端契约） | 5 |
| 增量构建的判定逻辑与边界 | 6 |
| 星云页面怎么做、性能怎么控 | 8 |
| **原方案里哪些地方有坑** | **9（重点）** |
| 怎么验收 | 10 |

---

## 1. 项目定位

### 1.1 一句话

一个**只读**的 Obsidian 知识库关系图谱构建器 + 星云可视化页面。构建器把散落的 Vault 解析成静态 `graph.json`，页面纯前端渲染成"星空/星云"图谱，构建与渲染完全解耦。

### 1.2 目标（Goal）

| # | 目标 | 判定标准 |
|---|---|---|
| G1 | 自动发现星域 | 根目录下含 `.md` 笔记的一级文件夹自动纳入，无需配置、无需上传 `.obsidian` |
| G2 | 增量构建 | 只对新增/修改/删除的 md 读正文；未变文件仅读 `stat` |
| G3 | 重命名不破图 | md 改名后图谱连线仍然连通，且不改动 md 原文 |
| G4 | 零构建的运行态 | 页面只 fetch 静态 json，不触发任何扫描/构建 |
| G5 | 双入口 | 本地 `node build.js` 与 GitHub Actions 行为一致 |
| G6 | 视觉 | 前景 D3 星云图 + 背景 Three.js 国风虚空，双层叠加不抢焦点 |

### 1.3 非目标（Non-Goal）——明确不做，避免范围膨胀

- ❌ 不做双向链接的**语义分析**（不解析 tag、不解析 `![[embed]]`、不解析 frontmatter 关系）
- ❌ 不做**反向链接写入**：不生成 backlinks 段落，不改 md
- ❌ 不做服务端：无 API、无数据库、无鉴权
- ❌ 不做实时文件监听（`--watch` 不在本期）
- ❌ 不改 Obsidian 配置、不接管 Obsidian 的重命名

### 1.4 为什么"不改 md"是硬约束

Obsidian 自身的重命名会更新全库 wikilink。若本工具也去改原文，两者会**互相覆盖**（Obsidian 改完、构建器再改一遍，或反之），且 Actions 里的 bot 提交会与用户本地编辑冲突。因此重命名修复**只发生在缓存索引层**，影响面仅限"网页上的连线"。

---

## 2. 关键决策摘要

| 编号 | 决策 | 选择 | 理由 / 代价 |
|---|---|---|---|
| D1 | md 解析范围 | 只解析 `[[wikilink]]` 的 target | 需求明确；正则足够，不引入 remark 全家桶 |
| D2 | 增量依据 | `size + mtimeMs` 双字段 | 成本最低；**代价**：内容等长的编辑会漏检（见 R6） |
| D3 | 重命名识别 | size 相等 + 一对一消费 | 无需读正文；**代价**：同 size 多文件可能错配（见 R5） |
| D4 | 图谱节点粒度 | 一个 md = 一个节点 | 简单；不支持块级/标题级引用 |
| D5 | 产物位置 | `graph.json` 写在**各 Vault 内部** | 与 Vault 同生命周期，增删 Vault 无需改根目录结构 |
| D6 | 前端数据加载 | `fetch` 静态 json | **代价**：`file://` 直接双击打不开，必须 http 或 Pages（见 R8） |
| D7 | 前端分层 | D3 画布在上，Three.js canvas 在下，`pointer-events:none` | 背景零交互，互不抢事件 |
| D8 | 全文重建 | `--full` 显式触发，不自动 | 避免缓存损坏时静默全量，掩盖问题 |

---

## 3. 系统架构与数据流

```
┌──────────────────────────── 构建期（Node） ────────────────────────────┐
│                                                                        │
│  根目录扫描                                                             │
│    ├─ 发现星域（一级目录内递归含 .md）                                │
│    │                                                                   │
│    ├─ globby 列出 **/*.md  ──►  只 stat（size, mtimeMs）  ← 元信息层     │
│    │                                                                   │
│    ├─ 与 build-cache.json 对比  ──►  分类：新增 / 修改 / 删除 / 重命名    │
│    │                                                                   │
│    ├─ 仅对变动文件 readFile + gray-matter + 正则抽 [[link]]  ← 正文层     │
│    │                                                                   │
│    └─ 组装 nodes/links  ──►  <Vault>/graph.json                         │
│                                                                        │
│  汇总  ──►  vault-list.json（清单）  +  build-cache.json（快照）         │
└────────────────────────────────────────────────────────────────────────┘
                                   │ git push（json 产物）
                                   ▼
┌──────────────────────────── 运行期（浏览器） ──────────────────────────┐
│  index.html                                                            │
│    ├─ fetch vault-list.json  ──►  渲染 Vault 下拉                       │
│    ├─ 选中 ──► fetch <folderPath>/graph.json                           │
│    ├─ Three.js 背景（独立 rAF，低帧率，pointer-events:none）            │
│    └─ D3 前景（主 rAF/仿真，缩放/拖拽/高亮/tooltip）                     │
└────────────────────────────────────────────────────────────────────────┘
```

**关键分界**：两个进程之间**只有三个 json 文件**作为契约。页面不知道 Vault 在磁盘上长什么样，构建器不知道页面怎么画。

---

## 4. 目录与文件清单

```
astral-sea-notes/
├─ index.html                 # 单文件前端（内联 CSS/JS，CDN 引入 d3/three）
├─ build.js                   # 增量构建主脚本
├─ package.json               # 依赖声明（见 R1：需调整模块类型）
├─ vault-list.json            # [生成物] Vault 清单
├─ build-cache.json           # [生成物] 增量快照
├─ <星域目录>/                 # 任意一级目录，内含 .md 即自动成为星域
│  ├─ 笔记.md                  # 内容源（必须提交）
│  └─ graph.json              # [生成物] 该星域的图谱
└─ .github/workflows/
   └─ build-vault.yml         # CI 流水线
```

**生成物 vs 手写物**：`vault-list.json` / `build-cache.json` / `*/graph.json` 只允许脚本写；`index.html` / `build.js` / `package.json` / workflow 只允许人写。CI 的 `git add` 必须严格限定在生成物上（见 R4）。

---

## 5. 数据契约

### 5.1 `vault-list.json`

```json
[
  {
    "vaultName": "开发知识",
    "folderPath": "开发知识",
    "graphUrl": "开发知识/graph.json",
    "mdCount": 128
  }
]
```

- `folderPath`：相对仓库根目录，**不含**首尾斜杠
- `graphUrl`：可直接用于 `fetch`；含非 ASCII 字符时前端必须 `encodeURI`（见 R7）
- `mdCount`：当前 Vault 的 md 总数（用于标签阈值决策与 UI 展示）

### 5.2 `<Vault>/graph.json`

```json
{
  "nodes": [{ "id": "开发知识/前端/D3.md", "name": "D3" }],
  "links": [{ "source": "开发知识/前端/D3.md", "target": "开发知识/前端/Canvas.md" }]
}
```

- `id`：相对仓库根的 md 路径，**全局唯一**（用来避免同名笔记冲突）
- `name`：basename 去掉 `.md`，仅用于显示
- `links` 的 source/target 必须能在 `nodes` 的 id 集合中找到（无悬空边）
- **不写 `value`/`weight`**：D3 的 `linkStrength` 由前端统一常数控制，减少产物体积

### 5.3 `build-cache.json`

```json
{
  "version": 1,
  "vaults": {
    "开发知识": {
      "files": {
        "开发知识/前端/D3.md": {
          "size": 2048,
          "mtimeMs": 1762000000000,
          "outLinks": ["Canvas", "SVG"]
        }
      }
    }
  }
}
```

- `version`：**新增字段**。缓存结构一旦变更可整体丢弃重建，避免解析旧结构时崩溃（原方案缺此字段）
- `outLinks` 存 **basename**（不是路径），因为 wikilink 通常只写名字
- 缓存体积 ≈ md 数量 × ~150 字节，万篇量级约 1.5MB，可接受

---

## 6. 构建器设计（build.js）

### 6.1 Vault 发现

```
for each directory in repo root:
    if 目录内递归存在 *.md: 登记为 Vault（星域）
```

- 只把**一级目录**当作候选，但其内部递归查找 md（笔记可放在任意层子目录）
- 跳过隐藏目录（含 `.obsidian/`）与 `node_modules`、`previews`（`EXCLUDE_VAULT_DIRS`）
- `.obsidian/` 只是 Obsidian 本地配置，不参与判定、不入库（由 `.gitignore` 屏蔽）
- 新增星域无需改任何配置；删除后其旧条目从 `vault-list.json` 与缓存中自然消失（缓存需显式清理，见 6.6）
- 仓库无 md 时输出 `vault-list.json = []`，属合法空状态，不需要预置假数据

### 6.2 元信息扫描

- `globby(['<vault>/**/*.md'], { ignore: ['.obsidian', '.claudian', 'node_modules', '.git'] })`
- 对每个命中路径 `fs.statSync` 取 `size` + `mtimeMs`
- **绝不在这一层 `readFile`**

> ⚠️ 原方案用 `fs.statSync(mdRel)` 这种相对路径，脚本必须在仓库根目录执行，否则全部失败。统一改为 `process.chdir(__dirname)` 或全绝对路径（见 R2）。

### 6.3 变更分类

| 类别 | 判定 | 后续动作 |
|---|---|---|
| 未变 | 路径存在 && size 相同 && mtime 相同 | 复用缓存 outLinks，不读正文 |
| 修改 | 路径存在 && (size 或 mtime 变化) | 读正文，重抽 outLinks |
| 新增 | 新路径不在旧缓存 | 读正文 |
| 删除 | 旧路径不在当前列表 | 从节点集合剔除 |
| 重命名 | 旧路径消失 + 新路径出现 + size 相同 | 见 6.4 |

### 6.4 重命名修复（方案 A）

**目标**：让"其他文件对旧名字的引用"自动指向新名字，**只改缓存内的 outLinks**。

**流程**：

```
1. deleted = 旧缓存有、当前没有
2. added   = 当前有、旧缓存没有
3. 对每个 deleted：
     在 added 中找 size 相等且未被消费的第一个 → 记入 renameMap(oldBase → newBase)
     若找不到 → 归入"真删除"
4. 遍历缓存中所有文件的 outLinks：
     把等于 oldBase 的项替换为 newBase
5. 生成新缓存：新路径条目沿用旧 outLinks（改名文件本身随后会被 6.3 判为"新增"而重读正文）
```

**为什么改名文件本身仍要重读**：改名后在缓存里以新路径查不到旧条目，天然落入"新增"分支，读正文是正确且必要的（它的内容就是需要被索引的内容）。读取成本 = 1 个文件，可接受。

**方案 A 的明确局限（必须写进 README）**：

- 只修**图谱连线**，磁盘 md 里的 `[[旧名字]]` 原样保留 → Obsidian 里点开会提示"文件不存在"
- 因此**推荐工作流**：在 Obsidian 内重命名（由 Obsidian 自己更新全库链接）→ 再提交。本工具的重命名修复是"漏网之鱼"的兜底，不是常规路径
- size 相等是弱特征：同 size 的多个文件同时增删时会错配（见 R5）

### 6.5 图谱组装

```
nameIndex = Map<basename, path>     // 一次构建，O(n)
for each file:
    node(fp)
    for each linkName in outLinks:
        target = nameIndex.get(linkName)
        if target: edge(fp → target)
```

- **不要**用 `mdPaths.find(...)` 内层循环：O(n×m)，万篇量级会卡到分钟级。原方案就是这个写法
- `nameIndex` 出现同名冲突时：保留**路径更短/层级更浅**的那个，并 `console.warn` 提示
- 支持 `[[folder/note]]`、`[[note.md]]` 两种变体：取 basename 后再匹配
- 自引用（`fp === target`）不入边
- 去重：用 `Set<`${source}>>>${target}`>`

### 6.6 缓存与清单写入

- 每个 Vault 处理完立即写 `graph.json`
- 全部处理完写 `vault-list.json`、`build-cache.json`
- 清理：删除缓存中不属于当前 Vault 列表的 key（Vault 被删/改名）
- 写入统一 `JSON.stringify(obj, null, 2) + '\n'`，保证 diff 干净、末尾换行

### 6.7 失败与兜底

| 场景 | 行为 |
|---|---|
| 单个 md 读失败（编码/权限） | 跳过该文件，`console.warn`，不中断整体 |
| 缓存文件 JSON 损坏 | 捕获 → 提示 → 自动降级为全量重建 |
| 缓存 `version` 不匹配 | 丢弃缓存，全量重建 |
| 边指向不存在的节点 | 直接丢弃该边（不产生悬空边） |
| 显式 `--full` | 忽略缓存，全部重读正文 |

---

## 7. CI 流水线设计

```yaml
name: 自动生成知识库图谱
on:
  push:
    branches: [main]
    paths: ['**.md', 'build.js']
  workflow_dispatch:          # 新增：允许手动全量重跑
concurrency:                  # 新增：防并发提交冲突
  group: graph-build
  cancel-in-progress: false
```

**步骤**：checkout → setup-node 20 → cache node_modules（key 用 `package-lock.json`）→ `npm ci` → `node build.js` → 提交生成物

**提交段（重写，原方案有坑）**：

```bash
git config user.name  "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add -A -- 'vault-list.json' 'build-cache.json' '*/graph.json'
git diff --cached --quiet && echo "no change, skip" && exit 0
git commit -m "auto: update graph [skip ci]"
git push
```

要点：

- 用 `git diff --cached --quiet` 判空，而不是 `git commit || true`（后者会把"真的出错"也吞掉）
- `git add` 用引号 glob，避免中文目录名/空前缀展开失败；**不要**用裸 `*/graph.json`（Vault 在子目录或根目录时会漏/报错）
- `git push` 加并发组 + 失败重试一次 `git pull --rebase`
- 提交信息带 `[skip ci]`：即使将来 paths 放宽也不会自我触发

**额度耗尽的影响面（澄清需求原文）**：

| 影响 | 是否受影响 |
|---|---|
| Actions 自动构建 | ✅ 停 |
| 本地 `node build.js` + 手动 push | ❌ 不受影响 |
| Pages 静态访问 | ❌ 不受影响（json 是已提交的静态文件） |
| Obsidian 日常编辑 | ❌ 不受影响 |

---

## 8. 前端设计（index.html）

### 8.1 分层架构

```
z-index 2  ┌──────────────────────────────────────┐
           │ SVG (D3)  节点/连线/标签/高亮          │  ← 事件层
z-index 1  ├──────────────────────────────────────┤
           │ canvas (Three.js WebGL)  国风虚空      │  ← pointer-events:none
z-index 3  ├──────────────────────────────────────┤
           │ HTML 悬浮控制栏 + tooltip              │
           └──────────────────────────────────────┘
```

- 两个渲染循环**互不依赖**：Three 走自己的 rAF（可降到 30fps），D3 只在仿真 tick 时重绘
- 背景 `pointer-events: none`，保证滚轮/拖拽全部落到前景
- 单文件：CSS 用 `<style>`，JS 用 `<script type="module">`，d3/three 走 CDN（`d3@7`、`three@0.160+`）

### 8.2 数据加载与状态

```
state = { vaults: [], currentVault: null, nodes: [], links: [], selectedId: null }

init():
  try  fetch('vault-list.json')
  catch → 顶部红色错误条：「加载 vault-list.json 失败，请先执行 node build.js」

onVaultChange(v):
  graph = await fetch(encodeURI(v.graphUrl))
  validate(graph)  // nodes/links 数组；links 端点必须存在
  rebuildSimulation(graph)
```

- 切换 Vault 时**销毁旧 simulation 与旧 SVG 内容**，避免内存泄漏（`simulation.stop()` + `g.selectAll('*').remove()`）
- 空图谱（nodes 为空）显示占位文案，不留黑屏

### 8.3 图谱规格（D3 v7）

| 项 | 规格 |
|---|---|
| 布局 | `d3.forceSimulation`：`forceLink(distance≈70, strength 0.35)` + `forceManyBody(strength -60)` + `forceCenter` + `forceCollide(radius+2)` |
| 节点视觉 | 圆点 `r=2.2~3`，`fill` 暖白 `#f4ead8`，`opacity .75`；外包一层 `r*3` 的径向渐变光晕（模拟星点微光） |
| 连线视觉 | `stroke #c8b48a`，`opacity .12`，`width .6`；可选 `stroke-dasharray` 做极弱星轨感；**不做箭头** |
| 舒展度 | `alphaDecay 0.0228`（默认）+ `velocityDecay 0.35`，让布局松散不聚团 |
| 缩放 | `d3.zoom`，`scaleExtent [0.15, 6]`，滚轮缩放 + 拖拽平移 |
| 节点拖拽 | `d3.drag`，`dragstarted` 时 `fx/fy = x/y`（固定），`dblclick` 释放固定 |
| 高亮 | 点击节点：自身 + 一级邻居（含相连边）`opacity 1`，其余降至 `.08`；空白点击恢复。实现用预计算的 `neighborMap: Map<id, Set<id>>`，不要每次点击遍历全边 |

### 8.4 交互与标签阈值

| 节点数 | 标签策略 |
|---|---|
| < 300 | 默认常显（`font-size 10px`，`fill #d9cbb0`，`opacity .7`） |
| 300 ~ 800 | 默认隐藏，hover 该节点时显示自身标签 |
| > 800 | 全程隐藏标签，只保留 tooltip |

- tooltip：跟随鼠标 +12px 偏移，显示 `name`（主）与 `id`（路径，次，`opacity .6`）；超出视口右/下边界时翻转
- 顶部控制栏：半透明玻璃（`backdrop-filter: blur(8px)`，`background: rgba(10,9,8,.55)`），含 Vault 下拉、`节点 N / 连线 M` 统计、`重置视图` 按钮

### 8.5 Three.js 背景规格

**视觉基调**：玄黑为底、低饱和国风、静谧虚空。无地面、无角色、无碰撞、无交互。

**色板**

| 用途 | 色值 |
|---|---|
| 底色 | `#070605` → `#0d0a07`（径向渐变） |
| 残页纸色 | `#c9b48c`（半透明 0.06~0.16） |
| 甲骨/篆字 | `#b99a5e`，边缘辉光 `#d8b978` |
| 星光粒子 | `#efe4cc`，`size 0.6~1.4` |
| 雾/体积光 | 极低强度 `#3a2c1c`，AmbientLight 强度 0.25 |

**核心元素与动效**

```
原点 O
 └─ 初始 1 块残页碎片
      ├─ t1 分裂 → 2 块
      ├─ 各自再分裂 → 4 块 …
      └─ 递归"一生二、二生三、三生万物"
```

- **递归繁衍模型**：碎片对象持有 `generation` 与 `splitAt`（时间戳）。`t > splitAt` 时分裂为 2 个子碎片（继承父材质，尺寸 ×0.72，初速略偏转 ±15°），父碎片转为"惰性漂移"不再分裂
- **硬上限（必须实现）**：`MAX_SHARDS = 220`、`MAX_GENERATION = 6`。达到上限后停止分裂，改为**回收最远/最淡的碎片**并复用槽位（对象池），保证内存与画布稳定，不随运行时长增长
- **运动**：每片沿柔和曲线漂浮（`position += velocity`，`velocity` 叠加低频正弦扰动 `sin(t*0.3 + phase) * 0.002`），自转 `rotation.y += 0.0008 * dir`；从原点向外做**缓慢加速后恒速**的径向扩散
- **材质**：`MeshBasicMaterial` + `transparent: true` + `blending: AdditiveBlending` + `depthWrite: false`；文字用 Canvas 纹理（在离屏 canvas 上以篆体/宋体绘制单字，再贴到 PlaneGeometry）
- **相机**：`PerspectiveCamera`，沿极缓圆形轨道环绕（`OrbitRadius` 固定，角速度 ≈ 0.015 rad/s），`camera.lookAt(0,0,0)`，附带极轻微手抖噪声（amplitude 0.02）营造呼吸感
- **景深虚化**：不启用真实 DOF 后处理（成本高）。用**距离衰减**替代：`material.opacity *= smoothstep(near, far, distance)`
- **面数控制**：`PlaneGeometry(1,1)` 共享单几何体，仅材质与变换不同；总 draw call ≤ 220；`renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`

**性能预算**

| 指标 | 目标 |
|---|---|
| 背景帧率 | 30fps 上限（`if (now - last < 33) return`） |
| 背景 GPU 时间 | < 4ms/帧 |
| 前景 500 节点仿真 | 首帧收敛 < 4s，拖拽不掉到 20fps 以下 |
| 页面可交互时间 | < 1.5s（CDN 命中缓存后） |

**降级策略**

- `prefers-reduced-motion: reduce` → 背景静止为一帧静态星图，碎片不做递归分裂
- 检测 WebGL 不可用 → 移除 canvas，退化为 CSS 径向渐变 + 少量 CSS 粒子
- 节点数 > 2000 → `forceManyBody.theta = 0.9` 提速，并自动关闭光晕（只留纯圆点）

---

## 9. 已知问题清单（评审重点）

> 这一章是原方案里我核实出的问题。R1~R3 不修，脚本**一定跑不起来**；R4~R8 会在特定条件下静默出错，比崩掉更难查。

| 编号 | 严重度 | 问题 | 影响 | 建议 |
|---|---|---|---|---|
| **R1** | 🔴 阻断 | `globby@14` 是**纯 ESM** 包，原代码用 `require('globby')` 会抛 `ERR_REQUIRE_ESM` | 脚本启动即崩 | 二选一：① `package.json` 加 `"type": "module"` 并把整个 build.js 改成 `import`；② 降级 `globby@^11`（CJS）并保留 require。**建议选 ①**，与 Node 20 CI 更一致 |
| **R2** | 🔴 阻断 | `fs.statSync(mdRel)`、`globby('vault/**/*.md')` 都是相对路径，但未 `chdir`；在非仓库根目录执行（如 IDE 任务、Actions 之外的路径）全部找不到文件 | 本地手动跑必然失败 | 脚本首行 `process.chdir(__dirname)`，或统一 `path.resolve(__dirname, rel)` |
| **R3** | 🟠 高 | Actions 里 `git add vault-list.json build-cache.json */graph.json`：shell glob 在**无匹配**时原样传给 git → 报错 `pathspec did not match`；Vault 位于多级目录时也会漏 | 流水线红 | 改 `git add -A -- 'vault-list.json' 'build-cache.json' '*/graph.json'`，或更稳的 `git add -A`（生成物由 `.gitignore` 之外的白名单约束） |
| **R4** | 🟠 高 | `git commit -m ... \|\| echo "skip"` 会吞掉**所有**失败（包括 hook 失败、磁盘错误），并继续 `git push` | 出错无声 | 用 `git diff --cached --quiet` 显式判空 |
| **R5** | 🟡 中 | 重命名靠 `size` 一对一匹配：同 size 多文件时按遍历顺序取第一个 `break`，会**错配**，把 A 的入边接到 B 上 | 图谱连线指错，且不易察觉 | ① 匹配时增加"该旧名是否被其他文件 outLinks 引用"作为加权；② 记录 `mtime` 且要求相差 < 阈值；③ 匹配失败时**宁可不修**，并 `warn` 提示用 `--full` |
| **R6** | 🟡 中 | 增量只看 `size + mtimeMs`。若编辑器保留 mtime（某些同步盘/`git checkout` 恢复）且内容等长修改，会漏检 | 图谱长期不更新，用户以为工具坏了 | 保留现状但**在 README 写明**；提供 `--full` 兜底；可选增加 `ctimeMs` 参与比较 |
| **R7** | 🟡 中 | `graphUrl` 含中文（如 `开发知识/graph.json`），前端 `fetch` 不 encode 时部分浏览器/Pages 路径解析失败 | 下拉切换后图谱空白 | 前端统一 `fetch(encodeURI(v.graphUrl))`；json 里保留可读中文，不做 URL 编码（避免二次编码） |
| **R8** | 🟡 中 | 单文件 `index.html` 双击 `file://` 打开时，`fetch('vault-list.json')` 被 CORS 拦截 | 用户以为页面坏了 | 文档写明：本地需 `npx serve` 或 `python -m http.server`；页面错误提示文案里带上这个指引 |
| **R9** | 🟢 低 | `structuredClone` 需 Node ≥17；原 workflow 用 20 没问题，但本地若 Node 16 会崩 | 低版本环境失败 | 加 `engines: { node: ">=18" }`，启动时检查版本并友好报错 |
| **R10** | 🟢 低 | 原方案 `linkSet` 用 `>>>` 拼接字符串做 key；若文件名本身含 `>>>` 会解析错位 | 极端情况连线错乱 | 改用 `Map<source, Set<target>>` 或 `\u0000` 分隔 |

**另有 2 个设计层建议（非 bug）**：

- 缓存缺 `version` 字段（已在 5.3 补上），否则将来改结构无法安全失效
- `--full` 建议同时输出"重建耗时 / 节点数 / 连线数"，方便判断是否该用增量

---

## 10. 验收标准

### 10.1 构建器

| # | 用例 | 期望 |
|---|---|---|
| T1 | 空仓库（无 Vault） | 输出 `vault-list.json = []`，退出码 0，不报错 |
| T2 | 首次运行 | 全量解析，`graph.json` 节点数 = md 数 |
| T3 | 二次运行（无改动） | 日志显示"变动文件：0"，`graph.json` **字节级不变**（git 无 diff） |
| T4 | 改一个 md 的内容（长度变化） | 仅该文件被重读（日志可验证），其余复用缓存 |
| T5 | 新增 md 并含 `[[既有笔记]]` | 新节点出现，且产生一条指向既有节点的边 |
| T6 | 删除一个被引用的 md | 该节点消失，指向它的边**一并消失**（无悬空边） |
| T7 | 重命名 md（size 不变） | 旧名节点消失、新名节点出现；原先指向旧名的边改指新名；**md 原文未被修改**（`git diff` 只含重命名） |
| T8 | 新增星域（一级目录内放一个 `.md`） | 下次运行自动出现在清单，产出自己的 `graph.json` |
| T9 | 手工改坏 `build-cache.json` | 捕获异常 → 自动降级全量 → 构建成功 |
| T10 | `--full` | 全部重读，结果与 T2 一致 |

### 10.2 页面

| # | 用例 | 期望 |
|---|---|---|
| U1 | 正常 2 个 Vault | 下拉可切换，统计数与 json 一致 |
| U2 | json 缺失 | 顶部红色错误条，提示执行 `node build.js` |
| U3 | 200 / 500 / 1000 节点 | 标签策略分别在 <300 常显、300~800 hover 显示、>800 全隐藏 |
| U4 | 点击节点 / 点空白 | 高亮一级邻居与连线 / 恢复 |
| U5 | 拖拽节点后双击 | 固定 / 释放 |
| U6 | 滚轮 + 平移 | 缩放范围 0.15~6，不越界 |
| U7 | 背景连续运行 10 分钟 | 碎片数稳定在 220 上限，内存不持续增长，无卡顿 |
| U8 | 系统开启"减少动态效果" | 背景静止，页面仍可用 |

---

## 11. 实施顺序

| 阶段 | 内容 | 产出 |
|---|---|---|
| M1 | 修 R1/R2，搭好 ESM 版 `build.js` 骨架 + Vault 发现 + stat 扫描 | 能列出文件与 Vault 清单 |
| M2 | 增量分类 + 缓存读写 + 图谱组装（含 nameIndex 优化） | `graph.json` 可用，T1~T4 通过 |
| M3 | 重命名修复 + 兜底与降级 | T5~T10 通过 |
| M4 | workflow（含 R3/R4 修复） | push 后自动出图 |
| M5 | `index.html` 前景 D3（数据加载、力导向、高亮、tooltip、控制栏） | U1~U6 通过 |
| M6 | Three.js 背景（递归分裂 + 对象池 + 降级） | U7~U8 通过 |
| M7 | 联调：性能预算、视觉基调微调、README | 交付 |

---

## 附录 A：术语

| 术语 | 含义 |
|---|---|
| Vault / 星域 | 根目录下的一级文件夹，判定特征是内含 `.md` 笔记；`.obsidian` 仅为本地 Obsidian 配置，不参与判定 |
| 元信息层 | 只读 `stat`（size/mtime），不读文件内容 |
| 正文层 | `readFile` + 解析，仅对变动文件执行 |
| 方案 A | 重命名只修缓存索引，不动 md 原文 |
| 悬空边 | source/target 不在 nodes 集合中的连线 |
| 对象池 | 复用固定数量对象，避免反复创建/GC |

---

## 附录 B：待你确认的 3 个选择（已确认）

1. **R1**：走 ESM ✅（已实现）
2. **重命名匹配失败**：宁可不修 + 警告 ✅（已实现，歧义时告警并按删除+新增处理）
3. **背景碎片上限**：220 ✅（已实现，含对象池回收）

---

## 附录 C：实现备注（2026-11-04 交付）

M1~M7 已完成并全部通过第 10 章用例。实现中对设计稿的偏离与补充：

| 项 | 说明 |
|---|---|
| 别名链（超出原设计） | 缓存新增 `aliases: {旧名→新名}`；`--full` 只丢文件快照、保留别名链。否则兜底重建会把历史改名的连线全部断开（实测发现）。解析时先查直名、再沿别名链（深度上限 8，防环） |
| 代码块内链接 | `[[x]]` 出现在围栏代码块、行内代码、HTML 注释中时不算链接（与 Obsidian 行为对齐；测试中实际触发） |
| 开场预热 | 背景加载时离线模拟 24 秒（60fps 步长），首帧即成形星云，避免"从一粒碎片干等半分钟" |
| 背景参数微调 | `MAX_GEN=5`；碎片初速 0.5~0.95/s；近相机淡出（防糊成亮块）；星光粒子用圆形光点纹理（方形粒子近景穿帮） |
| 换行符 | 仓库加 `.gitattributes`（`eol=lf`）：否则 Windows 检出 CRLF、CI 写 LF，每次构建生成全文件伪 diff |
| 构建实测 | 24 篇示例 md：全量 <1s；无改动增量运行产物字节级不变（git 零 diff）；重命名修复 4 条入边全部保持；歧义场景正确告警不修复 |

本地预览：仓库根目录起任意静态服务（如 `python -m http.server`）后访问 `index.html`。双击 `file://` 打开会因 CORS 无法读 json（页面有相应错误提示）。
