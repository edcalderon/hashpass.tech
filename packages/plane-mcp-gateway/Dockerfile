FROM node:22.22.1-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=node:node src ./src

USER node
EXPOSE 8220
CMD ["node", "src/server.mjs"]
