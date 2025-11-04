FROM node:lts-alpine3.16

ENV NODE_ENV=development
RUN mkdir /app
COPY yarn.lock /app
COPY package.json /app
WORKDIR /app
RUN yarn install
COPY . /app
RUN yarn run build
RUN npm prune --production --omit=dev
RUN rm -rf src/

FROM node:lts-alpine3.16
ENV NODE_ENV=production
COPY --from=0 /app /app
WORKDIR /app
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
CMD /docker-entrypoint.sh
