import fetch from 'node-fetch';
import config from '../config';

const GITHUB_URL_RE = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/(issues|pull)\/(\d+)(?:\/[^/?#]+)*?)?\/?(?:[?#].*)?$/i;

export interface GithubRepoRef {
  owner: string;
  repo: string;
}

export interface GithubPullRequestRef extends GithubRepoRef {
  number: number;
}

/**
 * Extracts the owner/repo from any github.com URL (repo root, an issue, or a PR).
 */
export function parseGithubRepoUrl(url: string): GithubRepoRef | null {
  const match = url.match(GITHUB_URL_RE);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/**
 * Extracts the owner/repo/number from a github.com pull request URL specifically.
 * Returns null for issue URLs, repo root URLs, or anything else that isn't a PR link.
 */
export function parseGithubPullRequestUrl(url: string): GithubPullRequestRef | null {
  const match = url.match(GITHUB_URL_RE);
  if (!match || match[3] !== 'pull' || !match[4]) return null;
  return { owner: match[1], repo: match[2], number: Number.parseInt(match[4], 10) };
}

// eslint-disable-next-line camelcase
export interface GithubPullRequest {
  title: string;
  body: string | null;
  additions: number;
  deletions: number;
  changed_files: number; // eslint-disable-line camelcase
  merged: boolean;
  html_url: string; // eslint-disable-line camelcase
}

export async function fetchPullRequest(owner: string, repo: string, number: number): Promise<GithubPullRequest> {
  const resp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
    {
      headers: {
        Authorization: `Bearer ${config.github.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'codeday-labs-gql',
      },
    },
  );

  if (!resp.ok) {
    throw new Error(`GitHub API error ${resp.status} fetching ${owner}/${repo}#${number}: ${await resp.text()}`);
  }

  return await resp.json() as GithubPullRequest;
}
