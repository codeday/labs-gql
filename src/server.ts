import Express from 'express';
import http from 'http';
import { ApolloServer } from 'apollo-server-express';
import { graphqlUploadExpress } from 'graphql-upload';
import ws from 'ws';
import { execute, subscribe } from 'graphql';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createSchema } from './schema';
import { createContext as context } from './context';
import config from './config';

export default async function server(): Promise<void> {
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

    // eslint-disable-next-line no-console
    console.log(`Listening on http://0.0.0.0:${config.port}`);
  });
}
