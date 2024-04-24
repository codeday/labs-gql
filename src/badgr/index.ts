import { Api } from './Api';
import config from '../config';

export * as Badgr from './Api';
export async function badgrLogin(username: string, password: string): Promise<Api<unknown>> {
  const { access_token: accessToken } = await fetch(
    `${config.badgr.endpoint}/o/token`,
    {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
    }
  ).then(r => r.json());

  return new Api({
    baseUrl: config.badgr.endpoint,
    baseApiParams: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}