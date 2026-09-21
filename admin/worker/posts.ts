import { requireMutation, requireSession } from './auth';
import type { Env } from './types';
import { error, json } from './security';
import { getRepoFile, githubRequest, putRepoFile } from './github';
import { parse as parseYaml } from 'yaml';

export async function discardPost(request: Request, env: Env, id: string) {
  const auth = await requireMutation(request, env);
  if ('response' in auth) return auth.response!;
  const input = (await request.json().catch(() => null)) as any;
  if (!Number.isInteger(input?.expectedVersion)) return error('VALIDATION_FAILED', '글 버전을 확인해주세요.', 422);
  const post = await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first<any>();
  if (!post) return error('NOT_FOUND', '글을 찾을 수 없습니다.', 404);
  if (post.version !== input.expectedVersion) return error('VERSION_CONFLICT', '다시 불러온 뒤 삭제해주세요.', 409);
  const idle =
    "NOT EXISTS (SELECT 1 FROM operations WHERE post_id=posts.id AND state IN ('queued','committing','waiting_for_deploy','unknown'))";
  if (!post.repo_path) {
    const result = await env.DB.prepare(
      `DELETE FROM posts WHERE id=? AND version=? AND desired_visibility='draft' AND NOT EXISTS (SELECT 1 FROM operations WHERE post_id=posts.id)`,
    )
      .bind(id, input.expectedVersion)
      .run();
    return result.meta.changes
      ? new Response(null, { status: 204 })
      : error('DISCARD_BLOCKED', '발행 기록이 있는 글은 삭제할 수 없습니다.', 409);
  }
  try {
    const file = await getRepoFile(env, post.repo_path);
    if (!file) return error('SOURCE_MISSING', '저장소 원본이 없어 작업본을 보존했습니다.', 409);
    const content = new TextDecoder().decode(
      Uint8Array.from(atob(file.content.replace(/\s/g, '')), (char) => char.charCodeAt(0)),
    );
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) throw new Error('Invalid source');
    const data = parseYaml(match[1]);
    if (typeof data?.title !== 'string') throw new Error('Invalid metadata');
    const result = await env.DB.prepare(
      `UPDATE posts SET title=?, description=?, pub_date=?, category=?, tags_json=?, body=?, desired_visibility=?, base_blob_sha=?, version=version+1, published_version=version+1, updated_at=? WHERE id=? AND version=? AND ${idle}`,
    )
      .bind(
        data.title,
        data.description ?? '',
        String(data.pubDate ?? post.pub_date),
        data.category ?? post.category,
        JSON.stringify(data.tags ?? []),
        match[2].replace(/^\r?\n/, ''),
        data.draft === true ? 'draft' : 'published',
        file.sha,
        new Date().toISOString(),
        id,
        input.expectedVersion,
      )
      .run();
    return result.meta.changes
      ? new Response(null, { status: 204 })
      : error('VERSION_CONFLICT', '저장 또는 발행 중입니다. 다시 불러와주세요.', 409);
  } catch {
    return error('SOURCE_READ_FAILED', '원본을 확인하지 못해 작업본을 보존했습니다.', 502);
  }
}

const categories = new Set(['Git', '일상', 'project', 'Study', 'MacOS', 'Algorithm', 'Library', 'uncategorized']);
const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || `post-${Date.now()}`;
const validInput = (input: any) =>
  typeof input?.title === 'string' &&
  input.title.trim() &&
  typeof input?.description === 'string' &&
  /^\d{4}-\d{2}-\d{2}/.test(input.pubDate) &&
  categories.has(input.category) &&
  Array.isArray(input.tags) &&
  input.tags.every((tag: unknown) => typeof tag === 'string') &&
  typeof input.body === 'string' &&
  new TextEncoder().encode(input.body).byteLength <= 1048576;
const row = (value: any) => ({
  id: value.id,
  slug: value.slug,
  title: value.title,
  description: value.description,
  pubDate: value.pub_date,
  category: value.category,
  tags: JSON.parse(value.tags_json),
  body: value.body,
  version: value.version,
  desiredVisibility: value.desired_visibility,
  status:
    value.desired_visibility === 'published' && value.published_version !== value.version
      ? 'published_with_draft'
      : value.desired_visibility,
  updatedAt: value.updated_at,
  repoPath: value.repo_path,
});
const frontmatter = (input: any, draft: boolean) =>
  `---\ntitle: ${JSON.stringify(input.title)}\ndescription: ${JSON.stringify(input.description)}\npubDate: ${input.pubDate}\ncategory: ${input.category}\ntags: ${JSON.stringify(input.tags)}\ndraft: ${draft}\n---\n\n${input.body}\n`;
const parseMarkdown = (content: string) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) return null;
  const data: Record<string, any> = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator > 0)
      data[line.slice(0, separator)] = line
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
  }
  return {
    title: data.title ?? '',
    description: data.description ?? '',
    pubDate: data.pubDate ?? new Date().toISOString(),
    category: data.category ?? 'uncategorized',
    tags:
      data.tags
        ?.replace(/[\[\]"]/g, '')
        .split(',')
        .map((tag: string) => tag.trim())
        .filter(Boolean) ?? [],
    body: match[2],
    draft: data.draft === 'true',
  };
};

export async function listPosts(request: Request, env: Env) {
  const auth = await requireSession(request, env);
  if ('response' in auth) return auth.response;
  const result = await env.DB.prepare('SELECT * FROM posts ORDER BY updated_at DESC LIMIT 50').all();
  return json({ items: (result.results as any[]).map(row) });
}
export async function getPost(request: Request, env: Env, id: string) {
  const auth = await requireSession(request, env);
  if ('response' in auth) return auth.response;
  const result = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  return result ? json(row(result)) : error('NOT_FOUND', '글을 찾을 수 없습니다.', 404);
}
export async function createPost(request: Request, env: Env) {
  const auth = await requireMutation(request, env);
  if ('response' in auth) return auth.response;
  const input = (await request.json().catch(() => null)) as any;
  if (!validInput(input)) return error('VALIDATION_FAILED', '글 메타데이터 또는 본문이 올바르지 않습니다.', 422);
  const id = crypto.randomUUID();
  const slug = slugify(input.title);
  const timestamp = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO posts (id, slug, category, title, description, pub_date, tags_json, body, version, desired_visibility, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
  )
    .bind(
      id,
      slug,
      input.category,
      input.title,
      input.description,
      input.pubDate,
      JSON.stringify(input.tags),
      input.body,
      'draft',
      timestamp,
    )
    .run();
  const result = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  return json(row(result), 201);
}
export async function updatePost(request: Request, env: Env, id: string) {
  const auth = await requireMutation(request, env);
  if ('response' in auth) return auth.response;
  const input = (await request.json().catch(() => null)) as any;
  if (!validInput(input) || !Number.isInteger(input.expectedVersion))
    return error('VALIDATION_FAILED', '글 데이터 또는 버전이 올바르지 않습니다.', 422);
  const result = await env.DB.prepare(
    'UPDATE posts SET title=?, description=?, pub_date=?, category=?, tags_json=?, body=?, version=version+1, updated_at=? WHERE id=? AND version=?',
  )
    .bind(
      input.title,
      input.description,
      input.pubDate,
      input.category,
      JSON.stringify(input.tags),
      input.body,
      new Date().toISOString(),
      id,
      input.expectedVersion,
    )
    .run();
  if (!result.meta.changes) return error('VERSION_CONFLICT', '다른 저장 결과가 있어 다시 불러와야 합니다.', 409);
  const post = await env.DB.prepare('SELECT version, updated_at FROM posts WHERE id=?')
    .bind(id)
    .first<{ version: number; updated_at: string }>();
  return json({ version: post?.version, savedAt: post?.updated_at });
}

export async function importPosts(request: Request, env: Env) {
  const auth = await requireMutation(request, env);
  if ('response' in auth) return auth.response;
  try {
    const { owner, repo } = (() => {
      const value = env.GITHUB_REPO ?? '';
      const [owner, repo] = value.split('/');
      return { owner, repo };
    })();
    if (!owner || !repo) return error('ADMIN_NOT_CONFIGURED', 'GitHub repo가 설정되지 않았습니다.', 503);
    const response = await githubRequest(env, `/repos/${owner}/${repo}/git/trees/main?recursive=1`);
    if (!response.ok)
      return error('GITHUB_READ_FAILED', `GitHub 파일 목록을 불러오지 못했습니다. (${response.status})`, 502);
    const tree = (await response.json()) as { tree: Array<{ path: string; type: string }> };
    let imported = 0;
    let unchanged = 0;
    let failed = 0;
    for (const item of tree.tree.filter(
      (item) => item.type === 'blob' && /^src\/domains\/blog\/content\/posts\/.*\.md$/.test(item.path),
    )) {
      try {
        const file = await getRepoFile(
          env,
          item.path.replace(/^src\/domains\/blog\/content\/posts\//, 'src/domains/blog/content/posts/'),
        );
        if (!file) {
          failed++;
          continue;
        }
        const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), (char) => char.charCodeAt(0));
        const content = new TextDecoder().decode(bytes);
        const parsed = parseMarkdown(content);
        if (!parsed || !parsed.title) {
          failed++;
          continue;
        }
        const slug = item.path.split('/').pop()!.replace(/\.md$/, '');
        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        const result = await env.DB.prepare(
          'INSERT OR IGNORE INTO posts (id, slug, category, title, description, pub_date, tags_json, body, version, desired_visibility, repo_path, base_blob_sha, published_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1, ?)',
        )
          .bind(
            id,
            slug,
            parsed.category,
            parsed.title,
            parsed.description,
            parsed.pubDate,
            JSON.stringify(parsed.tags),
            parsed.body,
            parsed.draft ? 'draft' : 'published',
            item.path,
            file.sha,
            timestamp,
          )
          .run();
        if (result.meta.changes) imported++;
        else unchanged++;
      } catch (cause) {
        failed++;
        console.error(
          'GitHub post import item failed',
          item.path,
          cause instanceof Error ? cause.message : 'unknown error',
        );
      }
    }
    return json({ imported, unchanged, failed, conflicts: 0 });
  } catch (cause) {
    console.error('GitHub post import failed', cause instanceof Error ? cause.message : 'unknown error');
    return error('GITHUB_IMPORT_FAILED', 'GitHub 글을 동기화하지 못했습니다.', 502);
  }
}

export async function publishPost(request: Request, env: Env, id: string, unpublish = false) {
  const auth = await requireMutation(request, env);
  if ('response' in auth) return auth.response;
  const input = (await request.json().catch(() => ({}))) as any;
  const post = await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first<any>();
  if (!post) return error('NOT_FOUND', '글을 찾을 수 없습니다.', 404);
  if (input.expectedVersion !== post.version)
    return error('VERSION_CONFLICT', '발행 전 글을 다시 불러와야 합니다.', 409);
  if (!post.repo_path) post.repo_path = `src/domains/blog/content/posts/${post.category}/${post.slug}.md`;
  const source = frontmatter(
    {
      title: post.title,
      description: post.description,
      pubDate: post.pub_date,
      category: post.category,
      tags: JSON.parse(post.tags_json),
      body: post.body,
    },
    unpublish,
  );
  try {
    const result = await putRepoFile(
      env,
      post.repo_path,
      source,
      post.base_blob_sha ?? undefined,
      `${unpublish ? 'chore' : 'feat'}: ${unpublish ? 'unpublish' : 'publish'} ${post.slug} [admin:${id}]`,
    );
    await env.DB.prepare(
      'UPDATE posts SET desired_visibility=?, repo_path=?, base_blob_sha=?, published_version=?, updated_at=? WHERE id=?',
    )
      .bind(
        unpublish ? 'draft' : 'published',
        post.repo_path,
        result.commit.sha,
        post.version,
        new Date().toISOString(),
        id,
      )
      .run();
    return json({ operationId: id, state: 'committed', commitSha: result.commit.sha }, 202);
  } catch {
    return error('PUBLICATION_FAILED', 'GitHub 발행에 실패했습니다. 작업본은 보존되었습니다.', 502);
  }
}
