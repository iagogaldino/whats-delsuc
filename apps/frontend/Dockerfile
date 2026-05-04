# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json

RUN npm ci -w frontend

COPY apps/frontend apps/frontend

RUN npm run build -w frontend

FROM nginx:alpine AS runner

COPY frontend/frontend.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80
