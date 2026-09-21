interface Comment {
  id: string;
  page: string;
  parentId: string | null;
  nickname: string | null;
  body: string | null;
  visibility: 'public' | 'private';
  version: number;
  createdAt: string;
  updatedAt: string;
  likes: number;
  liked: boolean | number;
}
interface CommentList {
  items: Comment[];
  total: number;
  next: string | null;
  admin?: boolean;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const visitorKey = 'extransload-comment-visitor';
function randomNickname() {
  const subjects = [
    '매일',
    '가끔',
    '몰래',
    '오늘도',
    '언제나',
    '새벽마다',
    '아침마다',
    '점심마다',
    '저녁마다',
    '비오는날',
    '눈오는날',
    '바람불면',
    '달빛아래',
    '별을보며',
    '잠들기전',
    '눈뜨자마자',
    '배고프면',
    '심심하면',
    '기분좋은날',
    '월요일마다',
    '주말마다',
    '휴일마다',
    '출근전에',
    '퇴근후에',
    '비밀스럽게',
    '아무도몰래',
    '아주가끔',
    '매우진지하게',
    '아무생각없이',
    '조용히',
    '신나게',
    '느긋하게',
    '부지런히',
    '느닷없이',
    '엉뚱하게',
    '꾸준히',
    '용감하게',
    '살짝',
    '살금살금',
    '두근두근',
    '졸린눈으로',
    '빈속으로',
    '간식먹고',
    '소풍가서',
    '여행중에',
    '집에서',
    '숲속에서',
    '바닷가에서',
    '구름위에서',
    '지구끝에서',
    '우주에서',
  ];
  const actions = [
    '똥만먹는',
    '잠만자는',
    '길을잃은',
    '춤을추는',
    '책을읽는',
    '구름을쫓는',
    '노래를부르는',
    '라면을끓이는',
    '별을세는',
    '돌을모으는',
    '나뭇잎을세는',
    '거울을보는',
    '문을두드리는',
    '꼬리를흔드는',
    '하품을하는',
    '낮잠을자는',
    '빗방울을세는',
    '바람을타는',
    '달을따라가는',
    '해를기다리는',
    '편지를쓰는',
    '약속을잊은',
    '보물을찾는',
    '길을만드는',
    '소문을퍼뜨리는',
    '비밀을지키는',
    '간식을숨기는',
    '친구를기다리는',
    '혼자노는',
    '공원을달리는',
    '마음을읽는',
    '꿈을꾸는',
    '구멍을파는',
    '꽃향기를맡는',
    '눈사람을만드는',
    '모자를쓰는',
    '양말을찾는',
    '소파를차지하는',
    '이불을뒤집어쓰는',
    '창문을여는',
    '문턱을넘는',
    '오후를즐기는',
    '아침을기다리는',
    '수프를젓는',
    '풍선을부는',
    '자전거를타는',
    '파도를세는',
    '모래성을쌓는',
    '낙엽을밟는',
    '얼음을핥는',
    '무지개를찾는',
  ];
  const animals = [
    '개구리',
    '고양이',
    '오리',
    '너구리',
    '두더지',
    '문어',
    '강아지',
    '토끼',
    '여우',
    '수달',
    '다람쥐',
    '고슴도치',
    '판다',
    '코알라',
    '펭귄',
    '부엉이',
    '참새',
    '까치',
    '독수리',
    '갈매기',
    '비둘기',
    '앵무새',
    '타조',
    '플라밍고',
    '거북이',
    '도마뱀',
    '카멜레온',
    '악어',
    '하마',
    '코끼리',
    '기린',
    '얼룩말',
    '사자',
    '호랑이',
    '치타',
    '곰',
    '늑대',
    '여우원숭이',
    '알파카',
    '낙타',
    '돼지',
    '소',
    '염소',
    '양',
    '말',
    '당나귀',
    '햄스터',
    '친칠라',
    '돌고래',
    '고래',
    '해파리',
  ];
  const values = crypto.getRandomValues(new Uint32Array(3));
  return `${subjects[values[0] % subjects.length]}${actions[values[1] % actions.length]}${animals[values[2] % animals.length]}`;
}
let memoryVisitor: string | undefined;
function getVisitor() {
  if (memoryVisitor) return memoryVisitor;
  try {
    const stored = localStorage.getItem(visitorKey);
    memoryVisitor = stored && /^[0-9a-f-]{36}$/i.test(stored) ? stored : crypto.randomUUID();
    localStorage.setItem(visitorKey, memoryVisitor);
  } catch {
    memoryVisitor = crypto.randomUUID();
  }
  return memoryVisitor;
}

export function initializeComments() {
  document.querySelectorAll<HTMLElement>('[data-comments]').forEach((root) => {
    if (root.dataset.bound) return;
    root.dataset.bound = 'true';
    const api = root.dataset.api!.replace(/\/$/, '');
    const page = root.dataset.page!;
    const list = root.querySelector<HTMLElement>('[data-list]')!;
    const listStatus = root.querySelector<HTMLElement>('[data-list-status]')!;
    const compose = root.querySelector<HTMLFormElement>('[data-compose]')!;
    const composeStatus = root.querySelector<HTMLElement>('[data-compose-status]')!;
    const identityFields = root.querySelector<HTMLElement>('[data-comment-identity]')!;
    const visibilityFields = root.querySelector<HTMLElement>('[data-comment-visibility]')!;
    const administratorNotice = root.querySelector<HTMLElement>('[data-comment-admin-notice]')!;
    const more = root.querySelector<HTMLButtonElement>('[data-more]')!;
    (compose.elements.namedItem('nickname') as HTMLInputElement).value = randomNickname();
    let next: string | null = null;
    let loading = false;
    let isAdministrator = false;
    const items = new Map<string, Comment>();
    const message = (target: HTMLElement, text: string, failed = false) => {
      target.textContent = text;
      target.dataset.error = String(failed);
    };
    const setAdministratorMode = (active: boolean) => {
      isAdministrator = active;
      identityFields.hidden = active;
      visibilityFields.hidden = active;
      administratorNotice.hidden = !active;
      const nickname = compose.elements.namedItem('nickname') as HTMLInputElement;
      const password = compose.elements.namedItem('password') as HTMLInputElement;
      nickname.required = !active;
      password.required = !active;
      compose.querySelector<HTMLButtonElement>('[type=submit]')!.textContent = active ? '관리자 댓글 등록' : '완료';
    };
    async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${api}/api/comments${path}`, {
          method,
          mode: 'cors',
          credentials: 'include',
          signal: controller.signal,
          headers: {
            'X-Comment-Visitor': getVisitor(),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || '요청을 처리하지 못했습니다.');
        return result;
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'AbortError')
          throw new Error('응답이 늦어지고 있습니다. 새로고침으로 반영 여부를 확인해 주세요.');
        if (cause instanceof TypeError) throw new Error('댓글 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        throw cause;
      } finally {
        window.clearTimeout(timer);
      }
    }
    async function administratorRequest<T>(body: { page: string; body: string; parentId?: string }): Promise<T> {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const sessionResponse = await fetch(`${api}/api/session`, {
          mode: 'cors',
          credentials: 'include',
          signal: controller.signal,
        });
        const session = (await sessionResponse.json().catch(() => null)) as { csrfToken?: string } | null;
        if (!sessionResponse.ok || !session?.csrfToken) throw new Error('관리자 로그인이 필요합니다.');
        const response = await fetch(`${api}/api/comments/admin`, {
          method: 'POST',
          mode: 'cors',
          credentials: 'include',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || '관리자 댓글을 등록하지 못했습니다.');
        return result as T;
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'AbortError')
          throw new Error('응답이 늦어지고 있습니다. 새로고침으로 반영 여부를 확인해 주세요.');
        if (cause instanceof TypeError) throw new Error('댓글 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        throw cause;
      } finally {
        window.clearTimeout(timer);
      }
    }
    async function administratorMutationRequest<T>(
      path: string,
      method: 'PATCH' | 'DELETE',
      body: unknown,
    ): Promise<T> {
      const sessionResponse = await fetch(`${api}/api/session`, { mode: 'cors', credentials: 'include' });
      const session = (await sessionResponse.json().catch(() => null)) as { csrfToken?: string } | null;
      if (!sessionResponse.ok || !session?.csrfToken) throw new Error('관리자 로그인이 필요합니다.');
      const response = await fetch(`${api}/api/comments${path}`, {
        method,
        mode: 'cors',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || '관리자 댓글을 처리하지 못했습니다.');
      return result as T;
    }
    function entry(item: Comment) {
      const node = document.createElement('article');
      node.className = 'comment-entry';
      node.dataset.commentId = item.id;
      const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(item.createdAt),
      );
      const privateComment = item.visibility === 'private' && !item.body;
      const administratorComment = !privateComment && (item.nickname === 'Extransload' || item.nickname === '관리자');
      const displayNickname = administratorComment ? 'Extransload' : escapeHtml(item.nickname ?? '');
      const controls =
        isAdministrator || !administratorComment
          ? '<button type="button" data-action="edit">수정</button><button type="button" data-action="delete">삭제</button>'
          : '';
      node.innerHTML = `<div class="comment-meta"><strong${administratorComment ? ' class="comment-author--administrator"' : ''}>${privateComment ? '비공개' : displayNickname}</strong><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(date)}${item.version > 1 ? ' · 수정됨' : ''}</time></div>
        <p class="comment-text${privateComment ? ' comment-text--private' : ''}">${privateComment ? '🔒 비공개 댓글입니다.' : escapeHtml(item.body ?? '')}</p>
        <div class="comment-actions"><button class="comment-like" type="button" data-action="like" aria-pressed="${Boolean(item.liked)}" aria-label="좋아요 ${item.likes}개${item.liked ? ', 취소하기' : ''}"><span aria-hidden="true">${item.liked ? '♥' : '♡'}</span> 좋아요 <b>${item.likes}</b></button>${privateComment ? '<button type="button" data-action="reveal">내용 보기</button>' : ''}${!item.parentId ? '<button type="button" data-action="reply">답글</button>' : ''}${controls}</div><p class="comment-status" data-entry-status role="status"></p><div class="comment-replies" data-replies></div>`;
      return node;
    }
    function render(itemsToRender: Comment[]) {
      for (const item of itemsToRender.filter((item) => !item.parentId)) {
        if (items.has(item.id)) continue;
        items.set(item.id, item);
        list.append(entry(item));
      }
      for (const item of itemsToRender.filter((item) => item.parentId)) {
        if (items.has(item.id)) continue;
        items.set(item.id, item);
        list.querySelector<HTMLElement>(`[data-comment-id="${item.parentId}"] [data-replies]`)?.append(entry(item));
      }
    }
    async function load(append = false) {
      if (loading) return;
      loading = true;
      more.disabled = true;
      message(listStatus, '댓글을 불러오고 있습니다.');
      try {
        const result = await request<CommentList>(
          `?page=${encodeURIComponent(page)}${append && next ? `&after=${next}` : ''}`,
        );
        if (!append) {
          items.clear();
          list.replaceChildren();
        }
        setAdministratorMode(result.admin === true);
        render(result.items);
        next = result.next;
        more.hidden = !next;
        root.querySelector('[data-count]')!.textContent = result.total ? String(result.total) : '';
        message(listStatus, result.total ? '' : '아직 남겨진 이야기가 없습니다. 첫 이야기를 들려주세요.');
      } catch (cause) {
        message(listStatus, (cause as Error).message, true);
      } finally {
        loading = false;
        more.disabled = false;
      }
    }
    compose.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = compose.querySelector<HTMLButtonElement>('[type=submit]')!;
      if (submit.disabled) return;
      const data = Object.fromEntries(new FormData(compose));
      submit.disabled = true;
      message(composeStatus, '이야기를 남기고 있습니다.');
      try {
        if (isAdministrator) await administratorRequest({ page, body: String(data.body ?? '') });
        else await request('', 'POST', { ...data, page });
        (compose.elements.namedItem('body') as HTMLTextAreaElement).value = '';
        if (!isAdministrator) {
          (compose.elements.namedItem('password') as HTMLInputElement).value = '';
          (compose.elements.namedItem('nickname') as HTMLInputElement).value = randomNickname();
        }
        message(composeStatus, '댓글을 남겼습니다.');
        await load();
      } catch (cause) {
        message(composeStatus, (cause as Error).message, true);
      } finally {
        submit.disabled = false;
      }
    });
    list.addEventListener('click', async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      const node = button?.closest<HTMLElement>('[data-comment-id]');
      if (!button || !node || button.disabled) return;
      const item = items.get(node.dataset.commentId!)!;
      const action = button.dataset.action;
      if (action === 'like') {
        button.disabled = true;
        const status = node.querySelector<HTMLElement>('[data-entry-status]')!;
        try {
          const result = await request<Comment>(`/${item.id}/like`, 'PUT', { liked: !item.liked });
          items.set(
            item.id,
            result.visibility === 'private' && result.version === item.version
              ? { ...result, nickname: item.nickname, body: item.body }
              : result,
          );
          const replacement = entry(result).querySelector<HTMLButtonElement>('[data-action=like]')!;
          button.replaceWith(replacement);
          replacement.focus({ preventScroll: true });
          message(status, '');
        } catch (cause) {
          message(status, (cause as Error).message, true);
          button.disabled = false;
        }
        return;
      }
      if (action === 'reveal' || (action === 'edit' && item.visibility === 'private' && !item.body)) {
        list.querySelectorAll('.comment-editor').forEach((editor) => editor.remove());
        const form = document.createElement('form');
        form.className = 'comment-editor editorial-surface';
        form.innerHTML =
          '<label>댓글 비밀번호<input name="password" type="password" required minlength="4" maxlength="128" autocomplete="off" placeholder="비밀번호"></label><p class="comment-status" role="status"></p><div class="comment-actions"><button type="button" data-cancel>취소</button><button class="comment-submit" type="submit">내용 보기</button></div>';
        node.append(form);
        form.querySelector<HTMLInputElement>('[name=password]')!.focus({ preventScroll: true });
        form.querySelector('[data-cancel]')!.addEventListener('click', () => form.remove());
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
          submit.disabled = true;
          const status = form.querySelector<HTMLElement>('[role=status]')!;
          try {
            const data = Object.fromEntries(new FormData(form));
            const revealed = await request<Pick<Comment, 'id' | 'nickname' | 'body' | 'visibility' | 'version'>>(
              `/${item.id}/reveal`,
              'POST',
              data,
            );
            const visible = { ...item, ...revealed };
            items.set(item.id, visible);
            const replacement = entry(visible);
            const replies = node.querySelector('[data-replies]');
            if (replies) replacement.querySelector('[data-replies]')!.replaceWith(replies);
            node.replaceWith(replacement);
            if (action === 'edit') replacement.querySelector<HTMLButtonElement>('[data-action=edit]')!.click();
          } catch (cause) {
            message(status, (cause as Error).message, true);
            submit.disabled = false;
          }
        });
        return;
      }
      if (action === 'reply') {
        list.querySelectorAll('.comment-editor').forEach((editor) => editor.remove());
        const form = document.createElement('form');
        form.className = 'comment-editor editorial-surface';
        form.setAttribute('aria-label', '답글 작성');
        form.innerHTML = isAdministrator
          ? '<p class="comment-admin-notice">Extransload 이름으로 공개 답글이 등록됩니다.</p><label>관리자 답글<textarea name="body" required maxlength="3000" rows="3"></textarea></label><p class="comment-status" role="status"></p><div class="comment-actions"><button type="button" data-cancel>취소</button><button class="comment-submit" type="submit">답글 등록</button></div>'
          : '<div class="comment-fields"><label>닉네임<input name="nickname" required maxlength="30" autocomplete="nickname"></label><label>비밀번호<input name="password" type="password" required minlength="4" maxlength="128" autocomplete="off" data-lpignore="true" data-1p-ignore></label></div><fieldset class="comment-visibility"><legend>공개 범위</legend><label><input name="visibility" type="radio" value="public" checked> 공개</label><label><input name="visibility" type="radio" value="private"> 비공개</label></fieldset><label>답글<textarea name="body" required maxlength="3000" rows="3"></textarea></label><p class="comment-status" role="status"></p><div class="comment-actions"><button type="button" data-cancel>취소</button><button class="comment-submit" type="submit">완료</button></div>';
        if (!isAdministrator) (form.elements.namedItem('nickname') as HTMLInputElement).value = randomNickname();
        node.append(form);
        (isAdministrator
          ? form.querySelector<HTMLTextAreaElement>('[name=body]')!
          : form.querySelector<HTMLInputElement>('[name=nickname]')!
        ).focus({ preventScroll: true });
        form.querySelector('[data-cancel]')!.addEventListener('click', () => form.remove());
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
          submit.disabled = true;
          const status = form.querySelector<HTMLElement>('[role=status]')!;
          try {
            const data = Object.fromEntries(new FormData(form));
            if (isAdministrator) await administratorRequest({ page, parentId: item.id, body: String(data.body ?? '') });
            else await request('', 'POST', { ...data, page, parentId: item.id });
            form.remove();
            await load();
          } catch (cause) {
            message(status, (cause as Error).message, true);
            submit.disabled = false;
          }
        });
        return;
      }
      // Keep one inline editor open; passwords live only in the active form.
      list.querySelectorAll('.comment-editor').forEach((editor) => editor.remove());
      const form = document.createElement('form');
      form.className = 'comment-editor editorial-surface';
      form.setAttribute('aria-label', action === 'edit' ? '댓글 수정' : '댓글 삭제');
      const administratorMutation = isAdministrator;
      form.innerHTML = `${action === 'edit' ? `${item.nickname === 'Extransload' || item.nickname === '관리자' ? '<input name="nickname" type="hidden" value="Extransload">' : `<label>닉네임<input name="nickname" required maxlength="30" value="${escapeHtml(item.nickname ?? '')}"></label>`}<label>댓글<textarea name="body" required maxlength="3000" rows="4">${escapeHtml(item.body ?? '')}</textarea></label>` : '<p>이 댓글을 삭제할까요? 삭제한 댓글은 복구할 수 없습니다.</p>'}
        ${administratorMutation ? '<p class="comment-admin-notice">관리자 세션으로 처리됩니다.</p>' : '<label>댓글 비밀번호<input name="password" type="password" required minlength="4" maxlength="128" autocomplete="off" placeholder="비밀번호"></label>'}
        <p class="comment-status" role="status"></p><div class="comment-actions"><button type="button" data-cancel>취소</button><button class="comment-submit" type="submit">완료</button></div>`;
      node.append(form);
      const close = () => {
        form.remove();
        button.focus({ preventScroll: true });
      };
      form.querySelector('[data-cancel]')!.addEventListener('click', close);
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
      });
      (form.querySelector<HTMLInputElement>('[name=password]') ??
        form.querySelector<HTMLTextAreaElement>('[name=body]') ??
        form.querySelector<HTMLButtonElement>('[type=submit]'))!.focus({ preventScroll: true });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
        if (submit.disabled) return;
        submit.disabled = true;
        const status = form.querySelector<HTMLElement>('[role=status]')!;
        const data = Object.fromEntries(new FormData(form));
        message(status, '처리 중입니다.');
        try {
          if (administratorMutation)
            await administratorMutationRequest(`/${item.id}`, action === 'edit' ? 'PATCH' : 'DELETE', {
              ...data,
              version: item.version,
            });
          else await request(`/${item.id}`, action === 'edit' ? 'PATCH' : 'DELETE', { ...data, version: item.version });
          form.remove();
          message(composeStatus, action === 'edit' ? '댓글을 수정했습니다.' : '댓글을 삭제했습니다.');
          await load();
          compose.querySelector<HTMLInputElement>('[name=nickname]')!.focus({ preventScroll: true });
        } catch (cause) {
          message(status, (cause as Error).message, true);
          submit.disabled = false;
        }
      });
    });
    more.addEventListener('click', () => void load(true));
    const postLike = root.querySelector<HTMLButtonElement>('[data-post-like]');
    if (postLike) {
      const status = root.querySelector<HTMLElement>('[data-post-like-status]')!;
      const update = (result: { likes: number; liked: number | boolean }) => {
        postLike.setAttribute('aria-pressed', String(Boolean(result.liked)));
        postLike.setAttribute('aria-label', `글 좋아요 ${result.likes}개`);
        root.querySelector('[data-post-like-count]')!.textContent = String(result.likes);
      };
      const path = `/post-like?page=${encodeURIComponent(page)}`;
      postLike.disabled = true;
      void request<{ likes: number; liked: number }>(path)
        .then(update)
        .catch(() => message(status, '좋아요를 불러오지 못했습니다.'))
        .finally(() => {
          postLike.disabled = false;
        });
      postLike.addEventListener('click', async () => {
        postLike.disabled = true;
        try {
          update(await request(path, 'PUT', { liked: postLike.getAttribute('aria-pressed') !== 'true' }));
          message(status, '');
        } catch (cause) {
          message(status, (cause as Error).message, true);
        } finally {
          postLike.disabled = false;
        }
      });
    }
    void load();
  });
}
