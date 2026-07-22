# ---------- 依赖安装 ----------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 构建 ----------
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- 运行 ----------
# 携带完整生产 node_modules，与裸机一致的 `npx next start` 方式运行
# （next.config 的 output:standalone 仅为警告；pi CLI 已拆到 pi-service 镜像，不在本镜像内）
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
# 运行时按 process.cwd() 读取的资源：下载路由与知识库转换管线
COPY --from=builder /app/tools ./tools
COPY --from=builder /app/unity-bridge ./unity-bridge
COPY --from=builder /app/frame-embed.zip ./frame-embed.zip
EXPOSE 3000
# 数据经 volume 挂载到 /app/data（SQLite app.db 与 pi-agent 会话）
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
