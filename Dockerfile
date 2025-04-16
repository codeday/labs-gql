FROM node:20-alpine3.18

ENV NODE_ENV=development
RUN mkdir /app
COPY yarn.lock /app
COPY package.json /app
WORKDIR /app
RUN apk add --update --no-cache openssl1.1-compat
RUN yarn install
COPY . /app
RUN yarn run build
RUN npm prune --production --omit=dev
RUN rm -rf src/

FROM node:20-alpine3.18
ENV NODE_ENV=production
COPY --from=0 /app /app
WORKDIR /app
RUN apk add --update --no-cache openssl1.1-compat
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
CMD /docker-entrypoint.sh
