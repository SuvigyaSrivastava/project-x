# Multi-stage: build with devDependencies, ship only the compiled output +
# production dependencies, run as a non-root user.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --include=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY fixtures ./fixtures

RUN addgroup --system app && adduser --system --ingroup app app
USER app

EXPOSE 4000
CMD ["node", "dist/index.js"]
