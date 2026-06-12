FROM emscripten/emsdk:3.1.74 AS engine

WORKDIR /build
COPY engine/ ./engine/
RUN bash engine/scripts/build_wasm.sh /build/engine/dist

FROM node:22-alpine AS web

WORKDIR /build/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
COPY --from=engine /build/engine/dist /build/engine/dist
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app/web
ENV NODE_ENV=production
ENV PORT=8080

COPY web/package.json ./
RUN npm install --omit=dev

COPY web/server ./server
COPY --from=web /build/web/dist ./dist
COPY --from=engine /build/engine/dist /app/engine/dist

EXPOSE 8080

CMD ["node", "server/index.js"]
