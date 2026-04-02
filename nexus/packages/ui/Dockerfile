FROM node:20-slim AS builder

WORKDIR /app
COPY packages/ui/ .
RUN corepack enable && npm install && npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
