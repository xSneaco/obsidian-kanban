import { Vault } from 'obsidian';

export interface StoredComment {
  id: string;
  text: string;
  authorUsername: string;
  authorFullName: string;
  date: string;
  synced: boolean;
  trelloActionId?: string;
}

export interface CommentStore {
  comments: StoredComment[];
}

export class TrelloCommentStore {
  constructor(private vault: Vault) {}

  private storePath(notePath: string): string {
    const lastSlash = notePath.lastIndexOf('/');
    const folder = lastSlash >= 0 ? notePath.slice(0, lastSlash) : '';
    const basename = lastSlash >= 0 ? notePath.slice(lastSlash + 1) : notePath;
    const jsonName = basename.replace(/\.md$/, '.json');
    return folder ? `${folder}/.comments/${jsonName}` : `.comments/${jsonName}`;
  }

  async load(notePath: string): Promise<CommentStore> {
    const path = this.storePath(notePath);
    try {
      const content = await this.vault.adapter.read(path);
      return JSON.parse(content) as CommentStore;
    } catch {
      return { comments: [] };
    }
  }

  async save(notePath: string, store: CommentStore): Promise<void> {
    const path = this.storePath(notePath);
    const folder = path.substring(0, path.lastIndexOf('/'));

    if (!(await this.vault.adapter.exists(folder))) {
      await this.vault.createFolder(folder);
    }

    await this.vault.adapter.write(path, JSON.stringify(store, null, 2));
  }

  async addLocal(notePath: string, text: string, authorUsername: string, authorFullName: string): Promise<StoredComment> {
    const store = await this.load(notePath);
    const comment: StoredComment = {
      id: crypto.randomUUID(),
      text,
      authorUsername,
      authorFullName,
      date: new Date().toISOString(),
      synced: false,
    };
    store.comments.push(comment);
    await this.save(notePath, store);
    return comment;
  }

  async markSynced(notePath: string, localId: string, trelloActionId: string): Promise<void> {
    const store = await this.load(notePath);
    const comment = store.comments.find((c) => c.id === localId);
    if (comment) {
      comment.synced = true;
      comment.trelloActionId = trelloActionId;
      await this.save(notePath, store);
    }
  }

  getUnsyncedCount(store: CommentStore): number {
    return store.comments.filter((c) => !c.synced).length;
  }

  async mergeRemoteComments(notePath: string, remoteComments: Array<{
    id: string;
    text: string;
    authorUsername: string;
    authorFullName: string;
    date: string;
  }>): Promise<void> {
    const store = await this.load(notePath);
    const existingIds = new Set(store.comments.map((c) => c.trelloActionId).filter(Boolean));

    for (const rc of remoteComments) {
      if (!existingIds.has(rc.id)) {
        store.comments.push({
          id: crypto.randomUUID(),
          text: rc.text,
          authorUsername: rc.authorUsername,
          authorFullName: rc.authorFullName,
          date: rc.date,
          synced: true,
          trelloActionId: rc.id,
        });
      }
    }

    store.comments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    await this.save(notePath, store);
  }
}
