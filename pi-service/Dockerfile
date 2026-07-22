# ---------- 依赖安装 ----------
FROM node:24-bookworm-slim AS deps
WORKDIR /srv
COPY package.json package-lock.json ./
# npm 12 默认拒绝 lockfile 中 remote（tgz URL）类型的依赖（EALLOWREMOTE），
# pi-coding-agent 的依赖链里有一个，需显式放行；npm 11 无此配置项，仅告警不影响
RUN npm config set allow-remote all 2>/dev/null || true \
    && npm ci --omit=dev

# ---------- 运行 ----------
FROM node:24-bookworm-slim
WORKDIR /srv
ENV NODE_ENV=production \
    PI_CODING_AGENT_DIR=/data/pi-agent
COPY --from=deps /srv/node_modules ./node_modules
COPY server.mjs ./
COPY public ./public
# 会话与 models.json 落在 /data/pi-agent（compose 卷挂载持久化）
EXPOSE 39273
CMD ["node", "server.mjs"]
