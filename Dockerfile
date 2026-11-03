# ModCheck: Node server without npm dependencies. node:sqlite needs Node 22.13+; this is the version the project is developed on.
FROM node:26-slim

WORKDIR /app
COPY . .

# Database, uploads and the Discord/Cloudflare settings live in /data. Mount a volume there, otherwise they vanish on every deploy.
# The container runs as root because hosted volumes (Railway) are mounted root-owned; the container itself is isolated.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    MODCHECK_DATA=/data \
    MODCHECK_HTTPS=1 \
    MODCHECK_TRUST_PROXY=proxy

# No VOLUME instruction: Railway rejects it. The volume is attached in the Railway dashboard (mount path /data).
RUN mkdir -p /data
EXPOSE 3000

CMD ["node", "start.mjs"]
