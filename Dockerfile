FROM node:26-alpine

RUN apk add --no-cache git

WORKDIR /hjson

RUN npm install -g pnpm

CMD ["sh"]