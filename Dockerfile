FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY game-data.mjs current-player-expansion.mjs legend-player-expansion.mjs server.mjs ./
COPY public ./public

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

EXPOSE 4173

CMD ["npm", "start"]
