# --- build stage -------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# The production container talks to the API same-origin via the nginx /api
# proxy (see nginx.conf), so no API host is baked into the bundle.
ENV VITE_API_BASE_URL=/api
RUN npm run build

# --- serve stage ---------------------------------------------------------------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
