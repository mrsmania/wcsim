# Build the static site, then serve it with nginx.
# Handy for hosting on the Synology DS723+ via Container Manager.
FROM node:22-alpine AS build
# The asset base. Defaults to the domain root because nginx below serves from '/'. The
# repo's own default is '/' too since the site moved to a custom domain (2026-09-03), so
# this agrees with it rather than correcting it. It stays explicit anyway: the image must
# not silently inherit a sub-path if that default ever moves again.
# Override for a sub-path host: docker build --build-arg VITE_BASE=/my/path/ .
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
