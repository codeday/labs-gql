import Express, { Request, Response } from 'express';
import http from 'http';
import { ApolloServer } from 'apollo-server-express';
import bodyParser from 'body-parser';
import basicAuth from 'express-basic-auth';
import { graphqlUploadExpress } from 'graphql-upload-minimal';
import ws from 'ws';
import { execute, subscribe } from 'graphql';
import { makeDebug } from './utils';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createSchema } from './schema';
import { createContext as context } from './context';
import config from './config';
import { processPostmarkInboundEmail } from './email';
import { getPrometheusMetrics } from './metrics';

const DEBUG = makeDebug('server');

export async function startServer(): Promise<void> {
  const schema = await createSchema();
  const apollo = new ApolloServer({
    schema,
    context,
    introspection: config.debug,
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

  const restServer = Express();
  restServer.get('/', (_, res) => res.send('ok'));
  restServer.post(
    `/${config.webhook.key}/email`,
    bodyParser.json(),
    processPostmarkInboundEmail
  );
  restServer.get('/metrics', basicAuth({ users: { 'metrics': config.metrics.key } }), async (_, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(await getPrometheusMetrics());
  });
  restServer.listen(config.portRest, () => {
    DEBUG(`REST listening on http://0.0.0.0:${config.portRest}`);
  });


}
