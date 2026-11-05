#!/usr/bin/env node
/**
 * astral-sea-notes / build.js
 * Obsidian Vault 关系图谱增量构建器（ESM）
 *
 * 约束：
 *   1. 只对新增 / 修改 / 重命名的 md 读取正文，其余仅读 stat
 *   2. 重命名只修缓存索引（方案 A），永不修改 md 原文
 *   3. 重命名匹配存在歧义时「不修 + 告警」，宁可断连也不错连
 *
 * 用法：
 *   node build.js          增量构建
 *   node build.js --full   全量重建
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globby } from 'globby';
import matter from 'gray-matter';

// ---------- 运行环境 ----------

const ROOT = path.dirname(fileURLToPath(import.meta.url));
process.chdir(ROOT); // R2：统一以脚本所在目录为工作目录

const CACHE_FILE = 'build-cache.json';
const VAULT_LIST_FILE = 'vault-list.json';
const CACHE_VERSION = 1;
const FULL_REBUILD = process.argv.includes('--full');

const IGNORE = [
  '**/.obsidian/**',
  '**/.claudian/**',
  '**/.trash/**',
  '**/.git/**',
  '**/node_modules/**'
];

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('[warn]', ...a);

// 纯 posix 风格的 basename，避免 Windows 反斜杠干扰
const posixBase = (p) => p.split('/').pop();
const stripExt = (name) => name.replace(/\.md$/i, '');

// ---------- 缓存读写 ----------

function emptyCache() {
  return { version: CACHE_VERSION, vaults: {} };
}

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    if (FULL_REBUILD) log('[cache] --full 指定，无既有缓存');
    return emptyCache();
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    warn(`缓存文件损坏（${e.message}），自动降级为全量重建`);
    return emptyCache();
  }
  if (!raw || typeof raw !== 'object' || !raw.vaults) {
    warn('缓存结构不符合预期，自动降级为全量重建');
    return emptyCache();
  }
  if (raw.version !== CACHE_VERSION) {
    warn(`缓存版本 ${raw.version} 与当前 ${CACHE_VERSION} 不一致，自动全量重建`);
    return emptyCache();
  }

  if (FULL_REBUILD) {
    // --full 只丢文件快照，保留别名链，否则兜底重建会把历史改名的连线全部断开
    const fresh = emptyCache();
    for (const [k, v] of Object.entries(raw.vaults)) {
      if (v && v.aliases) fresh.vaults[k] = { aliases: v.aliases };
    }
    log('[cache] --full 指定：丢弃文件快照，保留改名别名链');
    return fresh;
  }
  return raw;
}

function writeJsonIfChanged(file, data) {
  const next = JSON.stringify(data, null, 2) + '\n';
  if (fs.existsSync(file)) {
    try {
      if (fs.readFileSync(file, 'utf8') === next) return false;
    } catch {
      /* 读失败就直接覆盖 */
    }
  }
  fs.writeFileSync(file, next, 'utf8');
  return true;
}

// ---------- Vault 发现 ----------

// 不参与星域发现的一级目录：里面的 md 不是知识库内容
const EXCLUDE_VAULT_DIRS = new Set(['node_modules', 'previews']);

// 目录内（任意层级）是否存在 .md；隐藏目录与工具目录不算
function hasMarkdown(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') || EXCLUDE_VAULT_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (hasMarkdown(p)) return true;
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      return true;
    }
  }
  return false;
}

function findAllVaults() {
  const vaults = [];
  for (const ent of fs.readdirSync('.', { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('.') || EXCLUDE_VAULT_DIRS.has(ent.name)) continue;
    if (hasMarkdown(ent.name)) vaults.push({ name: ent.name, relPath: ent.name });
  }
  return vaults.sort((a, b) => a.relPath.localeCompare(b.relPath, 'zh'));
}

// ---------- wikilink 抽取 ----------

/**
 * [[target]] / [[target|alias]] / [[target#heading]] / [[folder/target.md]] / ![[embed]]
 * 统一归一化为 basename（不含 .md），与缓存中的 outLinks 表示保持一致
 *
 * 与 Obsidian 行为对齐：围栏代码块、行内代码、HTML 注释中的 [[...]] 不算链接
 */
function stripCodeAndComments(text) {
  return text
    .replace(/^```[\s\S]*?^```/gm, '') // 围栏代码块
    .replace(/^~~~[\s\S]*?^~~~/gm, '')
    .replace(/`[^`\n]*`/g, '') // 行内代码
    .replace(/<!--[\s\S]*?-->/g, ''); // HTML 注释
}

function extractWikiLinks(text) {
  const reg = /\[\[([^\]\n]+)\]\]/g;
  const body = stripCodeAndComments(text);
  const out = new Set();
  let m;
  while ((m = reg.exec(body)) !== null) {
    let t = m[1].split('|')[0].split('#')[0].trim();
    if (!t) continue;
    t = posixBase(t.replace(/\\/g, '/'));
    t = stripExt(t).trim();
    if (t) out.add(t);
  }
  return Array.from(out).sort();
}

function parseFileOutLinks(absOrRelPath) {
  const raw = fs.readFileSync(absOrRelPath, 'utf8');
  const { content } = matter(raw);
  return extractWikiLinks(content);
}

// ---------- 单个 Vault 构建 ----------

async function buildVault(vault, cache) {
  const vaultRel = vault.relPath;
  const oldVault = cache.vaults[vaultRel];
  const oldFiles = oldVault?.files && typeof oldVault.files === 'object' ? oldVault.files : {};

  // 1) 元信息扫描：只 stat，不读正文
  const mdPaths = (await globby([`${vaultRel}/**/*.md`], { ignore: IGNORE })).sort();
  const currentSet = new Set(mdPaths);
  const statMap = new Map();
  for (const p of mdPaths) {
    try {
      const st = fs.statSync(p);
      statMap.set(p, { size: st.size, mtimeMs: st.mtimeMs });
    } catch (e) {
      warn(`stat 失败，跳过 ${p}：${e.message}`);
      currentSet.delete(p);
      statMap.delete(p);
    }
  }
  const currentList = mdPaths.filter((p) => currentSet.has(p));

  // 2) 差异分类
  const oldList = Object.keys(oldFiles);
  const deleted = oldList.filter((p) => !currentSet.has(p)).sort();
  const added = currentList.filter((p) => !(p in oldFiles));

  // 3) 重命名识别：size 相等且候选唯一；有歧义则放弃修复
  const renameMap = new Map(); // oldBase -> newBase
  const consumedAdd = new Set();
  const realDeleted = [];

  for (const oldPath of deleted) {
    const oldInfo = oldFiles[oldPath];
    if (!oldInfo) {
      realDeleted.push(oldPath);
      continue;
    }
    const candidates = added.filter(
      (p) => !consumedAdd.has(p) && statMap.get(p)?.size === oldInfo.size
    );

    if (candidates.length === 1) {
      const newPath = candidates[0];
      const oldBase = stripExt(posixBase(oldPath));
      const newBase = stripExt(posixBase(newPath));
      if (oldBase === newBase) {
        // 同目录移动：名字没变，无需改连线
        log(`[移动] ${oldPath} -> ${newPath}（名字未变，连线无需修正）`);
      } else {
        renameMap.set(oldBase, newBase);
        log(`[重命名] ${oldBase} -> ${newBase}（仅更新缓存索引，不改 md 原文）`);
      }
      consumedAdd.add(newPath);
    } else if (candidates.length > 1) {
      warn(
        `重命名判定存在歧义：${oldPath}（size=${oldInfo.size}）有 ${candidates.length} 个候选 ` +
          `[${candidates.map((c) => posixBase(c)).join(', ')}]，按约定不修复，` +
          `该连线将断开。若确认是重命名，请执行 node build.js --full`
      );
      realDeleted.push(oldPath);
    } else {
      realDeleted.push(oldPath);
    }
  }

  // 4) 把重命名结果写回旧缓存索引（只动 outLinks）
  const baseOldFiles = {};
  for (const [fp, info] of Object.entries(oldFiles)) {
    const links = Array.isArray(info.outLinks) ? info.outLinks.slice() : [];
    baseOldFiles[fp] = {
      size: info.size,
      mtimeMs: info.mtimeMs,
      outLinks: renameMap.size
        ? links.map((l) => (renameMap.has(l) ? renameMap.get(l) : l))
        : links
    };
  }

  // 5) 判定需要重读正文的文件
  const needParse = [];
  for (const p of currentList) {
    const old = baseOldFiles[p];
    const st = statMap.get(p);
    if (FULL_REBUILD || !old || old.size !== st.size || old.mtimeMs !== st.mtimeMs) {
      needParse.push(p);
    }
  }

  // 6) 生成新缓存
  const newFiles = {};
  for (const p of currentList) {
    const st = statMap.get(p);
    const old = baseOldFiles[p];
    newFiles[p] = { size: st.size, mtimeMs: st.mtimeMs, outLinks: old ? old.outLinks : [] };
  }

  let parseFailed = 0;
  for (const p of needParse) {
    try {
      newFiles[p].outLinks = parseFileOutLinks(p);
    } catch (e) {
      warn(`解析失败，保留旧连线 ${p}：${e.message}`);
      parseFailed++;
    }
  }

  // 7) 组装图谱：basename -> path 索引，O(n)
  const nameIndex = new Map();
  const conflicts = [];
  for (const p of currentList) {
    const base = stripExt(posixBase(p));
    if (!nameIndex.has(base)) {
      nameIndex.set(base, p);
    } else {
      const prev = nameIndex.get(base);
      const pick = prev.split('/').length <= p.split('/').length ? prev : p;
      nameIndex.set(base, pick);
      conflicts.push(`${base}: ${prev} | ${p}`);
    }
  }
  if (conflicts.length) {
    warn(`存在同名笔记 ${conflicts.length} 处，已保留层级更浅者：\n  ` + conflicts.join('\n  '));
  }

  // 8) 别名链：让 --full 重建后依然能沿历史改名解析旧名（否则兜底会把连线改断）
  const aliasMap = { ...(oldVault?.aliases || {}) };
  for (const [o, n] of renameMap) aliasMap[o] = n;

  const resolveName = (name) => {
    if (nameIndex.has(name)) return name;
    let cur = name;
    const seen = new Set([cur]);
    for (let i = 0; i < 8; i++) {
      const next = aliasMap[cur];
      if (!next || seen.has(next)) break;
      seen.add(next);
      cur = next;
      if (nameIndex.has(cur)) return cur;
    }
    return null;
  };

  const nodes = currentList.map((p) => ({ id: p, name: stripExt(posixBase(p)) }));
  const edgeKeys = new Set();
  let dangling = 0;
  for (const [fp, info] of Object.entries(newFiles)) {
    for (const linkName of info.outLinks) {
      const resolved = resolveName(linkName);
      const target = resolved ? nameIndex.get(resolved) : null;
      if (!target) {
        dangling++;
        continue;
      }
      if (target === fp) continue; // 自引用不入边
      edgeKeys.add(`${fp}\u0000${target}`);
    }
  }
  const links = Array.from(edgeKeys)
    .map((k) => {
      const [source, target] = k.split('\u0000');
      return { source, target };
    })
    .sort((a, b) => (a.source + a.target).localeCompare(b.source + b.target, 'zh'));

  const graph = { nodes, links };
  const graphPath = path.join(vaultRel, 'graph.json');
  const graphChanged = writeJsonIfChanged(graphPath, graph);

  if (dangling) log(`[${vaultRel}] ${dangling} 处链接未匹配到节点（多为图片/外部引用），已忽略`);
  if (parseFailed) log(`[${vaultRel}] ${parseFailed} 个文件解析失败`);

  return {
    vault,
    files: newFiles,
    aliases: aliasMap,
    mdCount: currentList.length,
    nodeCount: nodes.length,
    linkCount: links.length,
    parsed: needParse.length,
    deleted: realDeleted.length,
    renamed: renameMap.size,
    graphChanged
  };
}

// ---------- 主流程 ----------

async function main() {
  const cache = loadCache();
  const vaults = findAllVaults();

  if (vaults.length === 0) {
    warn('未发现任何 Vault（一级文件夹内需包含 .md 笔记）。仍会写出空的 vault-list.json');
  }

  const results = [];
  for (const v of vaults) {
    try {
      results.push(await buildVault(v, cache));
    } catch (e) {
      warn(`Vault 构建失败，跳过 ${v.relPath}：${e.message}`);
    }
  }

  // 清单
  const vaultList = results.map((r) => ({
    vaultName: r.vault.name,
    folderPath: r.vault.relPath,
    graphUrl: `${r.vault.relPath}/graph.json`,
    mdCount: r.mdCount
  }));
  const listChanged = writeJsonIfChanged(VAULT_LIST_FILE, vaultList);

  // 缓存：只保留本次成功构建的 Vault（剔除已删除 / 改名的 Vault）
  const nextCache = { version: CACHE_VERSION, vaults: {} };
  for (const r of results) {
    nextCache.vaults[r.vault.relPath] = { files: r.files, aliases: r.aliases };
  }
  writeJsonIfChanged(CACHE_FILE, nextCache);

  log('');
  log('======== 构建完成 ========');
  for (const r of results) {
    log(
      `  ${r.vault.name}: ${r.mdCount} 节点 / ${r.linkCount} 连线` +
        `  | 本次重读 ${r.parsed} 个 / 删除 ${r.deleted} / 重命名 ${r.renamed}`
    );
  }
  log(`  Vault 数量: ${vaults.length}`);
  log(`  vault-list.json ${listChanged ? '已更新' : '无变化'}`);
  log(`  ${FULL_REBUILD ? '模式: 全量' : '模式: 增量'}`);
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
