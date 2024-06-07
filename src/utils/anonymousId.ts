import { createHmac } from 'crypto';
import config from '../config';

export function anonymousId(type: string, id: string | number | null | undefined) {
  if (typeof id === 'undefined' || id === null || id === '') return '';
  return createHmac('sha1', config.auth.secret)
    .update('anonymous')
    .update(type)
    .update(typeof id === 'string' ? id : id.toString())
    .digest('hex');
}
