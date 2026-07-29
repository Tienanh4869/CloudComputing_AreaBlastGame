# frontend/Dockerfile — Multi-stage: build with Node, serve with Nginx
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build

# Production: Nginx serves static files
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config for SPA routing and proxying to backend
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { try_files $uri $uri/ /index.html; } \
  location /api/ { \
    proxy_pass http://backend:3001; \
    proxy_http_version 1.1; \
    proxy_set_header Host $host; \
  } \
  location /socket.io/ { \
    proxy_pass http://backend:3001; \
    proxy_http_version 1.1; \
    proxy_set_header Upgrade $http_upgrade; \
    proxy_set_header Connection "upgrade"; \
    proxy_set_header Host $host; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
