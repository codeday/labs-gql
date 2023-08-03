/* eslint-disable camelcase */
import fetch from 'node-fetch';
import URLSearchParams from 'url-search-params';
import config from '../config';
import { getCountryCodeForName } from './countries';

const API_BASE = 'https://api.geocod.io/v1.6/geocode';

const cache: Record<string, number> = {};

export async function geoToTimezone(postal: string, country: string): Promise<number> {
  const countryCode = getCountryCodeForName(country);

  const timezones = {
    KR: 9,
    CN: 8,
    SG: 8,
    IT: 2,
    IN: 5,
  };
  if (countryCode && countryCode in timezones) return timezones[countryCode as keyof typeof timezones];

  const key = `${postal}, ${country}`;
  const query = (new URLSearchParams({
    api_key: config.geocodio.apiKey,
    q: postal,
    country: countryCode || 'US',
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
