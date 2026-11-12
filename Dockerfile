# syntax=docker/dockerfile:1
# StereoFace — imagen de producción (Next.js standalone). NO se ha ejecutado en el entorno de desarrollo
# (no había Docker): ver DEPLOY.md, sección «Qué está verificado y qué no».

FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# 1) Dependencias (incluye devDependencies: se necesitan para compilar)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# 2) Compilación. NEXT_PUBLIC_SITE_URL se incrusta en la compilación (canónicas, sitemap, Open Graph):
#    cambiar de dominio exige recompilar.
FROM base AS builder
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# La compilación NO necesita base de datos.
RUN npm run build && npm run build:migrate

# 3) Ejecución: solo lo imprescindible, usuario sin privilegios
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# Migraciones SQL y el script empaquetado que las aplica (node migrate.mjs)
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
COPY --from=builder --chown=app:app /app/dist/migrate.mjs ./migrate.mjs
# El volumen nombrado de medios se inicializa con este directorio, conservando la titularidad del usuario no privilegiado.
RUN mkdir -p /data/media && chown app:app /data/media
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
