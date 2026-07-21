#!/usr/bin/env node
/**
 * 极简 HTTP / WebSocket 反向代理（零依赖，Node 标准库）。
 *
 * 用途：kimi web 等本地 Web UI 的响应 CSP 带 `frame-ancestors 'self'`，
 * 只能被同源页面 iframe 嵌入。本代理转发到本机上游并剥掉 CSP 中的
 * frame-ancestors 指令（其余指令保留），使工作台（不同端口）可以 iframe 嵌入。
 *
 * 用法：node tools/webui-proxy.mjs [监听端口=5495] [上游端口=5494]
 * 上游固定为 127.0.0.1；Host 头重写为上游地址以通过上游的 DNS-rebinding 检查。
 * WebSocket（Upgrade）走原始 TCP 隧道转发。
 */

import http from "node:http";
import net from "node:net";

const LISTEN_PORT = Number(process.argv[2] ?? 5495);
const UPSTREAM_PORT = Number(process.argv[3] ?? 5494);
const UPSTREAM_HOST = "127.0.0.1";
const UPSTREAM_AUTHORITY = `${UPSTREAM_HOST}:${UPSTREAM_PORT}`;

/** 去掉 CSP 里的 frame-ancestors 指令，其余保留 */
function relaxCsp(value) {
  return String(value)
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && !d.startsWith("frame-ancestors"))
    .join("; ");
}

const server = http.createServer((req, res) => {
  const upstream = http.request(
    {
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: UPSTREAM_AUTHORITY },
    },
    (upRes) => {
      const headers = { ...upRes.headers };
      if (headers["content-security-policy"]) {
        headers["content-security-policy"] = relaxCsp(headers["content-security-policy"]);
      }
      res.writeHead(upRes.statusCode, headers);
      upRes.pipe(res);
    }
  );
  upstream.on("error", (e) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`上游服务不可达（127.0.0.1:${UPSTREAM_PORT}）：${e.message}`);
  });
  req.pipe(upstream);
});

// WebSocket / Upgrade：原始 TCP 隧道（无法也不需修改头）
server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (const [k, v] of Object.entries({ ...req.headers, host: UPSTREAM_AUTHORITY })) {
      upstream.write(`${k}: ${Array.isArray(v) ? v.join(", ") : v}\r\n`);
    }
    upstream.write("\r\n");
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  console.log(`[webui-proxy] 0.0.0.0:${LISTEN_PORT} -> ${UPSTREAM_AUTHORITY}`);
});
