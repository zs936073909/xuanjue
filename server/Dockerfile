FROM node:20-slim

# 只装运行所需：psql 交给 scripts/db-init.mjs（pg 驱动 + simple query）来替代，
# 镜像因此不需要 postgresql-client，构建更快、体积更小。
WORKDIR /app

# 先拷贝依赖清单利用层缓存：源码改动不必重装依赖
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# 容器里以 root 运行没必要；改用内置 node 用户
USER node

CMD ["node", "index.js"]
