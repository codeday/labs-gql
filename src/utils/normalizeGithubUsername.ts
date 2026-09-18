export function normalizeGithubUsername(raw: string): string {
  const scp = raw.match(/^git@github\.com:([^/?#]+)/i);
  if (scp) return scp[1];

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (/^(www\.)?github\.com$/i.test(u.host)) {
        const seg = u.pathname.split('/').filter(Boolean)[0];
        if (seg) return seg;
      }
      return raw;
    } catch {
      return raw;
    }
  }

  return raw.split(/[?#]/, 1)[0];
}
