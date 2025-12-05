FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files and install all dependencies (including dev)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN bun run build

# Remove dev dependencies for production
RUN rm -rf node_modules && bun install --frozen-lockfile --production

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
