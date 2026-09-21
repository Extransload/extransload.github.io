import type { Env } from './types';

export const requireConfig = (env: Env, keys: Array<keyof Env>) => keys.filter((key) => !env[key]).map(String);
export const repoParts = (env: Env) => {
  const value = env.GITHUB_REPO ?? '';
  const [owner, repo] = value.split('/');
  if (!owner || !repo || value.split('/').length !== 2) throw new Error('GITHUB_REPO must be owner/repository');
  return { owner, repo };
};
