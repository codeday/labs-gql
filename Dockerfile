FROM node:16-alpine

ENV NODE_ENV=development
RUN mkdir /app
COPY yarn.lock /app
COPY package.json /app
WORKDIR /app
RUN yarn install
COPY . /app
RUN yarn run build
RUN rm -rf node_modules/ src/

FROM node:16-alpine
ENV NODE_ENV=production
COPY --from=0 /app /app
WORKDIR /app
RUN yarn install
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
CMD /docker-entrypoint.sh
