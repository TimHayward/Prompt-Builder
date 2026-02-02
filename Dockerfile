FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=development
ENV PORT=3000
EXPOSE 3000

CMD ["sh","-lc","HOSTNAME=0.0.0.0 npm run db:init || true && HOSTNAME=0.0.0.0 npm run dev -- --port 3000"]
