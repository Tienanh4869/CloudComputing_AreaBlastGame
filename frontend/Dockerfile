# frontend/Dockerfile — Multi-stage: build with Node, serve with Nginx
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production: Nginx serves static files
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config for SPA routing (React Router)
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
