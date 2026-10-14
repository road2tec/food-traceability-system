# UNTESTED (Docker not available on the authoring machine). Build context: repo root.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server/ ./
RUN mkdir -p /app/uploads
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health || exit 1
CMD ["npm", "run", "start"]
