FROM node:26-alpine

RUN apk add --no-cache git

WORKDIR /ext

RUN npm install -g pnpm

CMD ["sh"]