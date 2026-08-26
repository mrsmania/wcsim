# The referee (roadmap item 18, wave 3 of docs/pvp-plan.md).
#
# Built from the REPOSITORY ROOT, not from this directory:
#
#   docker build -f referee/Dockerfile -t wcsim-referee .
#
# because the referee bundles the game's own domain code (`src/domain`, `src/data`) rather
# than reimplementing the rules - which is the whole of decision P11 and section 5 of the
# plan. A second copy of the simulation would drift from the real one, and the dataset
# moved three times in a single audit.
#
# esbuild produces one file, the way every other node-side tool in this repo is run. `pg`
# is left external and installed in the runtime stage: it is the one runtime dependency,
# and bundling a driver that dlopens an optional native module is a way to find out about
# it in production.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
COPY referee ./referee
# Typecheck before bundling: esbuild strips types without looking at them, so without this
# the image would build cleanly from code that does not compile.
RUN npx tsc -b
RUN npx esbuild referee/src/main.ts \
      --bundle --format=esm --platform=node --target=node22 \
      --external:pg --outfile=dist/referee.mjs

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Only the driver. Nothing else in the bundle reaches outside node's own library.
RUN npm install --omit=dev pg@8
COPY --from=build /app/dist/referee.mjs ./referee.mjs
# Not root. The referee is the only component in this design that takes un-RLS'd input from
# the internet (P34), so its blast radius is the thing to keep small in every direction.
USER node
EXPOSE 8787
CMD ["node", "referee.mjs"]
