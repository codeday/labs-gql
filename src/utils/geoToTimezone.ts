/* eslint-disable camelcase */
import fetch from 'node-fetch';
import URLSearchParams from 'url-search-params';
import config from '../config';

const API_BASE = 'https://api.geocod.io/v1.6/geocode';

const cache: Record<string, number> = {};

export async function geoToTimezone(postal: string, country: string): Promise<number> {
  const key = `${postal}, ${country}`;
  const query = (new URLSearchParams({
    api_key: config.geocodio.apiKey,
    q: postal,
    country,
    limit: '1',
    fields: 'timezone',
  })).toString();
  const url = `${API_BASE}?${query}`;

  if (!(key in cache)) {
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      cache[key] = data?.results[0]?.fields?.timezone?.utc_offset;
    } catch (ex) {}
  }

  return cache[key] || -7;
}
