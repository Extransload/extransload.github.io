import type { D1Database } from '@cloudflare/workers-types/index';

export interface Env {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_ALLOWED_USER_ID?: string;
  GITHUB_REPO?: string;
  GITHUB_APP_ID?: string;
  GITHUB_INSTALLATION_ID?: string;
  GITHUB_PRIVATE_KEY?: string;
  GA4_PROPERTY_ID?: string;
  GA4_HOSTNAME?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  SEARCH_CONSOLE_PROPERTY?: string;
  ADMIN_URL?: string;
  BLOG_URL?: string;
  COMMENTS_ORIGINS?: string;
  AVATAR_VIEWER_ORIGINS?: string;
  COMMENTS_SECRET?: string;
}
