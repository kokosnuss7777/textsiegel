# textsiegel server: verification API, check page, about page (test page can be disabled with TEST_PAGE=0).
# No runtime dependencies: Node runs the TypeScript sources directly.
FROM node:25-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY demo/samples.ts ./demo/samples.ts
COPY server ./server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/.well-known/textsiegel-keys.json >/dev/null || exit 1
CMD ["node", "server/server.ts"]
