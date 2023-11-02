import Express, { Request, Response } from 'express';
import http from 'http';
import { ApolloServer } from 'apollo-server-express';
import bodyParser from 'body-parser';
import { graphqlUploadExpress } from 'graphql-upload';
import ws from 'ws';
import { execute, subscribe } from 'graphql';
import { makeDebug } from './utils';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createSchema } from './schema';
import { createContext as context } from './context';
import config from './config';
import { processPostmarkInboundEmail } from './email';

const DEBUG = makeDebug('server');

export async function startServer(): Promise<void> {
  const schema = await createSchema();
  const apollo = new ApolloServer({
    schema,
    context,
    playground: config.debug,
    introspection: true,
  });

  const app = Express();
  app.use(graphqlUploadExpress({ maxFileSize: 100 * 1024 * 1024, maxFiles: 3 }));
  apollo.applyMiddleware({ app });

  const httpServer = http.createServer(app);
  const wsServer = new ws.Server({
    server: httpServer,
    path: '/graphql',
  });

  httpServer.listen(config.port, () => {
    useServer({
      schema, execute, subscribe, context,
    }, wsServer);

    DEBUG(`Listening on http://0.0.0.0:${config.port}`);
  });

  const webhookServer = Express();
  webhookServer.get('/', (_, res) => res.send('ok'));
  webhookServer.post(
    `/${config.webhook.key}/email`,
    bodyParser.json(),
    processPostmarkInboundEmail
  );
  webhookServer.listen(config.portWebhoook, () => {
    DEBUG(`Webhooks listening on http://0.0.0.0:${config.portWebhoook}`);
  });
}
