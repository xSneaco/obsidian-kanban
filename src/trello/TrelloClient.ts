import { requestUrl } from 'obsidian';
import { TrelloAttachment, TrelloBoard, TrelloCard, TrelloCommentAction, TrelloList, TrelloMember } from './TrelloTypes';

export class TrelloAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrelloAuthError';
  }
}

export class TrelloRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrelloRateLimitError';
  }
}

export class TrelloNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrelloNotFoundError';
  }
}

export class TrelloClient {
  private apiKey: string;
  private token: string;
  private inFlight = 0;
  private queue: Array<() => void> = [];
  private readonly MAX_CONCURRENT = 5;

  constructor(apiKey: string, token: string) {
    this.apiKey = apiKey;
    this.token = token;
  }

  private buildUrl(path: string, params: Record<string, string> = {}): string {
    const base = 'https://api.trello.com/1';
    const query = new URLSearchParams({
      key: this.apiKey,
      token: this.token,
      ...params,
    });
    return `${base}${path}?${query.toString()}`;
  }

  private throttle<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inFlight < this.MAX_CONCURRENT) {
      this.inFlight++;
      return fn().finally(() => {
        this.inFlight--;
        const next = this.queue.shift();
        if (next) next();
      });
    }
    return new Promise((resolve, reject) => {
      if (this.queue.length > 50) {
        reject(new Error('Trello request queue overflow'));
        return;
      }
      this.queue.push(() => {
        this.inFlight++;
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.inFlight--;
            const next = this.queue.shift();
            if (next) next();
          });
      });
    });
  }

  private async req<T>(
    path: string,
    params: Record<string, string> = {},
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<T> {
    return this.throttle(async () => {
      const url = this.buildUrl(path, params);
      const response = await requestUrl({
        url,
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        throw: false,
      });

      if (response.status === 401) throw new TrelloAuthError('Invalid Trello API key or token');
      if (response.status === 429) throw new TrelloRateLimitError('Trello rate limit exceeded');
      if (response.status === 404) throw new TrelloNotFoundError(`Trello resource not found: ${path}`);
      if (response.status >= 400) throw new Error(`Trello API error ${response.status}: ${response.text}`);

      if (response.status === 200 && response.text) {
        return response.json as T;
      }
      return undefined as T;
    });
  }

  async getBoards(): Promise<TrelloBoard[]> {
    return this.req<TrelloBoard[]>('/members/me/boards', { filter: 'open' });
  }

  async getBoard(boardId: string): Promise<TrelloBoard> {
    return this.req<TrelloBoard>(`/boards/${boardId}`);
  }

  async getLists(boardId: string): Promise<TrelloList[]> {
    return this.req<TrelloList[]>(`/boards/${boardId}/lists`, { filter: 'open' });
  }

  async getCards(boardId: string): Promise<TrelloCard[]> {
    return this.req<TrelloCard[]>(`/boards/${boardId}/cards`, {
      filter: 'open',
      actions: 'commentCard',
      attachments: 'true',
      badges: 'true',
    });
  }

  async getCardComments(cardId: string): Promise<TrelloCommentAction[]> {
    return this.req<TrelloCommentAction[]>(`/cards/${cardId}/actions`, { filter: 'commentCard' });
  }

  async getMembers(boardId: string): Promise<TrelloMember[]> {
    return this.req<TrelloMember[]>(`/boards/${boardId}/members`);
  }

  async getCardAttachments(cardId: string): Promise<TrelloAttachment[]> {
    return this.req<TrelloAttachment[]>(`/cards/${cardId}/attachments`);
  }

  async moveCard(cardId: string, listId: string, pos: number): Promise<TrelloCard> {
    return this.req<TrelloCard>(`/cards/${cardId}`, {}, 'PUT', { idList: listId, pos });
  }

  async createCard(listId: string, name: string, desc: string): Promise<TrelloCard> {
    return this.req<TrelloCard>('/cards', {}, 'POST', { idList: listId, name, desc });
  }

  async updateCard(cardId: string, fields: Partial<Pick<TrelloCard, 'name' | 'desc' | 'closed' | 'pos' | 'due'>>): Promise<TrelloCard> {
    return this.req<TrelloCard>(`/cards/${cardId}`, {}, 'PUT', fields as Record<string, unknown>);
  }

  async addComment(cardId: string, text: string): Promise<TrelloCommentAction> {
    return this.req<TrelloCommentAction>(`/cards/${cardId}/actions/comments`, {}, 'POST', { text });
  }

  async deleteCard(cardId: string): Promise<void> {
    await this.req(`/cards/${cardId}`, {}, 'DELETE');
  }

  async updateCardPos(cardId: string, pos: number): Promise<TrelloCard> {
    return this.req<TrelloCard>(`/cards/${cardId}`, {}, 'PUT', { pos });
  }

  async createList(boardId: string, name: string, pos?: number): Promise<TrelloList> {
    const body: Record<string, unknown> = { name, idBoard: boardId };
    if (pos !== undefined) body.pos = pos;
    return this.req<TrelloList>('/lists', {}, 'POST', body);
  }

  async updateList(listId: string, fields: { name?: string; pos?: number; closed?: boolean }): Promise<TrelloList> {
    return this.req<TrelloList>(`/lists/${listId}`, {}, 'PUT', fields as Record<string, unknown>);
  }

  async archiveList(listId: string): Promise<TrelloList> {
    return this.req<TrelloList>(`/lists/${listId}/closed`, {}, 'PUT', { value: true });
  }
}
