FROM node:26-alpine

RUN apk add --no-cache git

WORKDIR /mkon

RUN npm install -g pnpm

CMD ["sh"]