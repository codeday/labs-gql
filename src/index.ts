/* eslint-disable import/first */
import 'reflect-metadata';
import config from './config';
import { registerDi } from './di';

registerDi();

import emailHandler from './email';

if (!config.email.disable) {
  // eslint-disable-next-line no-console
  console.log('Emails enabled');
  emailHandler();
}

import server from './server';

server();

import searchSyncHandler from './search';

if (!config.elastic.disable) {
  searchSyncHandler();
}
