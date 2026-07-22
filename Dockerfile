# Stage 1: Base
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Stage 2: Builder
FROM base AS builder
WORKDIR /app
COPY . .
# Installation globale pour la construction
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @saas/api build

# Stage 3: Déploiement Isolé
FROM base AS deployer
WORKDIR /app
COPY --from=builder /app .
# On déploie uniquement l'application api et ses dépendances
RUN pnpm --filter @saas/api --prod deploy pruned --legacy

# Stage 4: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Installer tsx pour exécuter les dépendances locales en TypeScript
RUN npm install -g tsx
# Récupération de l'application élaguée
COPY --from=deployer /app/pruned .
# Copie explicite du dossier dist (ignoré par pnpm deploy car dans .gitignore)
COPY --from=builder /app/apps/api/dist ./dist
# Exposer le port API par défaut
EXPOSE 3000
CMD ["tsx", "dist/main.js"]
