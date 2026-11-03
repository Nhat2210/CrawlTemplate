FROM node:24-bookworm-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package*.json ./
RUN npm ci && npx playwright install --with-deps chromium
COPY . .
RUN npm run build && mkdir -p /app/storage && chown -R node:node /app/storage /ms-playwright
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310 PREVIEW_PORT=4311 STORAGE_DIR=/app/storage
USER node
EXPOSE 4310 4311
CMD ["npm", "start"]
