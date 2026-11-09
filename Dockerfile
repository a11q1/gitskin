FROM node:22-alpine

WORKDIR /app

COPY package.json profile.json server.js ./
COPY public ./public

RUN addgroup -S gitskin && adduser -S gitskin -G gitskin \
  && chown -R gitskin:gitskin /app

USER gitskin

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8792

EXPOSE 8792

CMD ["node", "server.js"]
