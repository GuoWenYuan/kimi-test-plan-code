#!/usr/bin/env node
// 个人工作站 · 通用本机桥（零依赖）
// 在你的电脑上运行：node local-bridge.mjs [--root <代码目录>] [--port 39275]
// 网页端（Pi agent / 工作流 PIAgent 节点）经浏览器中转调用本桥的 /execute，实现"操作你本机"。
// 与 Unity Bridge 同一协议：POST /execute {name, args(JSON 字符串)} → {ok, result} / {ok, error}
// 安全：仅监听 127.0.0.1；/execute 强制 X-Bridge-Token 认证（启动时随机生成并打印，
// 或用 LOCAL_BRIDGE_TOKEN 指定）；所有文件操作限制在 --root 目录内。
// 扩展：在 COMMANDS 里注册新命令即可（参照 UnityBridge.Register 模式）。
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
function argOf(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const PORT = Number(argOf("--port", 39275));
const ROOT = path.resolve(argOf("--root", process.cwd()));
const TOKEN = process.env.LOCAL_BRIDGE_TOKEN || crypto.randomBytes(16).toString("hex");
// 危险操作默认关闭，显式开启：--allow-write（写文件/建目录）、--allow-run（执行 shell 命令）
const ALLOW_WRITE = args.includes("--allow-write");
const ALLOW_RUN = args.includes("--allow-run");

const MAX_READ = 50 * 1024;
const MAX_GREP = 200;
const MAX_TREE = 500;

function truncate(s, max = MAX_READ) {
  const text = String(s ?? "");
  return text.length > max ? text.slice(0, max) + `\n…（已截断至 ${max} 字符）` : text;
}

function resolveSafe(p) {
  const target = path.resolve(ROOT, p || ".");
  // ROOT 可能本身以分隔符结尾（如 Windows 盘符根 E:\），不能再拼出一个分隔符
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (target !== ROOT && !target.startsWith(rootPrefix)) {
    throw new Error(`路径越界：必须在 ${ROOT} 之内`);
  }
  return target;
}

function walk(dir, depth, prefix, lines) {
  if (lines.length >= MAX_TREE) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries = entries.filter((e) => !e.name.startsWith(".") && e.name !== "node_modules");
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const e of entries) {
    if (lines.length >= MAX_TREE) return;
    lines.push(`${prefix}${e.isDirectory() ? "📁" : "📄"} ${e.name}`);
    if (e.isDirectory() && depth > 1) {
      walk(path.join(dir, e.name), depth - 1, prefix + "  ", lines);
    }
  }
}

const COMMANDS = {
  // 目录树：args {path?, depth?（默认 3）}
  "fs.tree": (a) => {
    const target = resolveSafe(a.path);
    if (!fs.statSync(target).isDirectory()) throw new Error(`不是目录：${target}`);
    const lines = [`${target}`];
    walk(target, Math.min(Number(a.depth) || 3, 6), "", lines);
    if (lines.length >= MAX_TREE) lines.push(`…（已截断至 ${MAX_TREE} 行）`);
    return lines.join("\n");
  },
  // 读文件：args {path, start?, end?}（行号 1 起）
  "fs.read": (a) => {
    if (!a.path) throw new Error("缺少 path");
    const target = resolveSafe(a.path);
    let content = fs.readFileSync(target, "utf-8");
    const lines = content.split("\n");
    const start = Math.max(Number(a.start) || 1, 1);
    const end = Math.min(Number(a.end) || lines.length, lines.length);
    content = lines.slice(start - 1, end).map((l, i) => `${start + i}\t${l}`).join("\n");
    if (content.length > MAX_READ) content = content.slice(0, MAX_READ) + `\n…（已截断至 ${MAX_READ} 字符）`;
    return content;
  },
  // 写文件：args {path, content, append?}（需 --allow-write；自动创建父目录）
  "fs.write": (a) => {
    if (!ALLOW_WRITE) throw new Error("写操作未启用：请以 --allow-write 重启本机桥");
    if (!a.path) throw new Error("缺少 path");
    const target = resolveSafe(a.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (a.append) fs.appendFileSync(target, String(a.content ?? ""), "utf-8");
    else fs.writeFileSync(target, String(a.content ?? ""), "utf-8");
    return `已${a.append ? "追加" : "写入"} ${target}（${String(a.content ?? "").length} 字符）`;
  },
  // 建目录：args {path}（需 --allow-write）
  "fs.mkdir": (a) => {
    if (!ALLOW_WRITE) throw new Error("写操作未启用：请以 --allow-write 重启本机桥");
    if (!a.path) throw new Error("缺少 path");
    const target = resolveSafe(a.path);
    fs.mkdirSync(target, { recursive: true });
    return `已创建目录 ${target}`;
  },
  // 执行 shell 命令：args {command, timeout?（秒，默认 60）}（需 --allow-run；cwd 限 root 内）
  "sys.run": (a) => {
    if (!ALLOW_RUN) throw new Error("命令执行未启用：请以 --allow-run 重启本机桥");
    if (!a.command) throw new Error("缺少 command");
    const timeout = Math.min(Number(a.timeout) || 60, 300) * 1000;
    try {
      const out = execSync(String(a.command), {
        cwd: ROOT,
        timeout,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
      });
      return `退出码 0\n${truncate(out)}`;
    } catch (e) {
      const out = [e.stdout, e.stderr].filter(Boolean).join("\n");
      return `退出码 ${e.status ?? "?"}\n${truncate(out) || e.message}`;
    }
  },
  // 读取任意路径（固定输出，供工作流「本机代码读取」节点）：
  // 文件 → 内容（截断 50KB）；目录 → 目录树 + 各文本文件内容（单文件 20KB、总计 200KB、50 个文件上限，跳过二进制/大文件并列出）
  "fs.readAny": (a) => {
    if (!a.path) throw new Error("缺少 path");
    const target = resolveSafe(a.path);
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      if (stat.size > 1024 * 1024) throw new Error(`文件过大（${(stat.size / 1048576).toFixed(1)}MB），请用 fs.read 分段读取`);
      const buf = fs.readFileSync(target);
      if (buf.subarray(0, 512).includes(0)) throw new Error("二进制文件，无法按文本读取");
      return truncate(buf.toString("utf-8"));
    }
    const MAX_TOTAL = 200 * 1024, MAX_PER_FILE = 20 * 1024, MAX_FILES = 50;
    const treeLines = [`${target}`];
    walk(target, 3, "", treeLines);
    const parts = [treeLines.join("\n"), "", "── 文件内容 ──"];
    const skipped = [];
    let total = 0, count = 0;
    const collect = (dir) => {
      if (count >= MAX_FILES || total >= MAX_TOTAL) return;
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith(".") || name === "node_modules") continue;
        if (count >= MAX_FILES || total >= MAX_TOTAL) return;
        const p = path.join(dir, name);
        const st = fs.statSync(p, { throwIfNoEntry: false });
        if (!st) continue;
        if (st.isDirectory()) {
          collect(p);
        } else {
          const rel = path.relative(ROOT, p);
          if (st.size > 100 * 1024) { skipped.push(`${rel}（过大 ${(st.size / 1024).toFixed(0)}KB）`); continue; }
          const buf = fs.readFileSync(p);
          if (buf.subarray(0, 512).includes(0)) { skipped.push(`${rel}（二进制）`); continue; }
          let text = buf.toString("utf-8");
          if (text.length > MAX_PER_FILE) text = text.slice(0, MAX_PER_FILE) + "\n…（单文件截断）";
          parts.push(`\n=== ${rel} ===\n${text}`);
          total += text.length;
          count++;
        }
      }
    };
    collect(target);
    if (skipped.length) parts.push(`\n── 已跳过 ${skipped.length} 个文件 ──\n` + skipped.join("\n"));
    if (count >= MAX_FILES || total >= MAX_TOTAL) parts.push(`\n…（已达上限：${count} 个文件 / ${(total / 1024).toFixed(0)}KB）`);
    return parts.join("\n");
  },
  // 搜索：args {pattern（正则）, path?（默认 root）, maxResults?}
  "fs.grep": (a) => {
    if (!a.pattern) throw new Error("缺少 pattern");
    const re = new RegExp(a.pattern);
    const target = resolveSafe(a.path);
    const out = [];
    const scan = (p) => {
      if (out.length >= MAX_GREP) return;
      const stat = fs.statSync(p, { throwIfNoEntry: false });
      if (!stat) return;
      if (stat.isDirectory()) {
        if (path.basename(p).startsWith(".") || path.basename(p) === "node_modules") return;
        for (const name of fs.readdirSync(p)) scan(path.join(p, name));
      } else if (stat.size < 1024 * 1024) {
        let text;
        try {
          text = fs.readFileSync(p, "utf-8");
        } catch {
          return;
        }
        text.split("\n").forEach((line, i) => {
          if (out.length < MAX_GREP && re.test(line)) {
            out.push(`${path.relative(ROOT, p)}:${i + 1}: ${line.slice(0, 200)}`);
          }
        });
      }
    };
    scan(target);
    if (out.length === 0) return "（无匹配）";
    if (out.length >= MAX_GREP) out.push(`…（已截断至 ${MAX_GREP} 条）`);
    return out.join("\n");
  },
};

const server = http.createServer((req, res) => {
  // CORS + 浏览器私网访问（PNA）许可
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const json = (status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "GET" && req.url === "/health") {
    json(200, { ok: true, name: "local-bridge", root: ROOT, commands: Object.keys(COMMANDS), write: ALLOW_WRITE, run: ALLOW_RUN });
    return;
  }
  if (req.method === "POST" && req.url === "/execute") {
    if (req.headers["x-bridge-token"] !== TOKEN) return json(401, { ok: false, error: "未授权：令牌错误" });
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        const { name, args: rawArgs } = JSON.parse(body);
        const cmd = COMMANDS[name];
        if (!cmd) throw new Error(`未知命令：${name}（可用：${Object.keys(COMMANDS).join(", ")}）`);
        let parsed = {};
        if (typeof rawArgs === "string" && rawArgs.trim()) parsed = JSON.parse(rawArgs);
        else if (rawArgs && typeof rawArgs === "object") parsed = rawArgs;
        json(200, { ok: true, result: cmd(parsed) });
      } catch (e) {
        json(200, { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
    return;
  }
  json(404, { ok: false, error: "not found" });
});

if (!fs.existsSync(ROOT)) {
  console.error(`根目录不存在：${ROOT}`);
  process.exit(1);
}
server.listen(PORT, "127.0.0.1", () => {
  console.log(`本机桥已启动：http://127.0.0.1:${PORT}`);
  console.log(`根目录：${ROOT}（所有文件操作限制在此目录内）`);
  console.log(`令牌（粘贴到网页端的「本机桥令牌」输入框）：${TOKEN}`);
  console.log(`可用命令：${Object.keys(COMMANDS).join(", ")}`);
  if (!ALLOW_WRITE) console.log("提示：写文件/建目录未启用（--allow-write 开启）");
  if (!ALLOW_RUN) console.log("提示：执行命令未启用（--allow-run 开启）");
});
