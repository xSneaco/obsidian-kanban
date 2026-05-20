import { App } from 'obsidian';
import { TrelloCard, TrelloMember } from './TrelloTypes';

export interface NoteUpdateResult {
  status: 'updated' | 'no-change' | 'conflict' | 'created';
  conflict?: {
    localBody: string;
    remoteBody: string;
    localTitle: string;
    remoteTitle: string;
  };
}

export class TrelloNoteManager {
  constructor(private app: App) {}

  getNoteFolder(kanbanFilePath: string): string {
    const lastSlash = kanbanFilePath.lastIndexOf('/');
    return lastSlash >= 0 ? kanbanFilePath.slice(0, lastSlash) : '';
  }

  sanitizeFilename(cardName: string, cardId: string): string {
    const suffix = cardId.slice(-4);
    const sanitized = cardName
      .replace(/[\/\\:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 76);
    return `${sanitized}-${suffix}.md`;
  }

  buildItemTitle(cardName: string, cardId: string): string {
    const basename = this.sanitizeFilename(cardName, cardId).replace('.md', '');
    return `[[${basename}|${cardName}]]`;
  }

  extractNotePath(itemTitle: string, kanbanFilePath: string): string | null {
    const match = itemTitle.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
    if (!match) return null;
    const folder = this.getNoteFolder(kanbanFilePath);
    const basename = match[1].endsWith('.md') ? match[1] : `${match[1]}.md`;
    return folder ? `${folder}/${basename}` : basename;
  }

  async hashBody(body: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(body);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return 'sha256:' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private buildFrontmatter(card: TrelloCard, members: TrelloMember[], contentHash: string): string {
    const cardMembers = members.filter((m) => card.idMembers.includes(m.id));
    const lines = [
      '---',
      `trello_card_id: "${card.id}"`,
      `trello_card_name: "${card.name.replace(/"/g, '\\"')}"`,
      `trello_list_id: "${card.idList}"`,
      `trello_board_id: "${card.idBoard}"`,
      `trello_last_synced: "${new Date().toISOString()}"`,
      `trello_content_hash: "${contentHash}"`,
      `trello_pos: ${card.pos}`,
    ];

    if (cardMembers.length > 0) {
      lines.push('members:');
      cardMembers.forEach((m) => {
        lines.push(`  - username: "${m.username}"`);
        lines.push(`    fullName: "${m.fullName}"`);
      });
    }

    if (card.labels.length > 0) {
      lines.push('labels:');
      card.labels.forEach((l) => {
        lines.push(`  - name: "${l.name}"`);
        lines.push(`    color: "${l.color || ''}"`);
      });
    }

    if (card.due) {
      lines.push(`due: "${card.due}"`);
    }

    if (card.attachments && card.attachments.length > 0) {
      lines.push('attachments:');
      card.attachments.forEach((a) => {
        lines.push(`  - name: "${a.name.replace(/"/g, '\\"')}"`);
        lines.push(`    url: "${a.url}"`);
      });
    }

    lines.push('---');
    return lines.join('\n');
  }

  async createNote(card: TrelloCard, members: TrelloMember[], kanbanFilePath: string): Promise<string> {
    const folder = this.getNoteFolder(kanbanFilePath);
    const filename = this.sanitizeFilename(card.name, card.id);
    const notePath = folder ? `${folder}/${filename}` : filename;

    const body = card.desc || '';
    const contentHash = await this.hashBody(body);
    const frontmatter = this.buildFrontmatter(card, members, contentHash);
    const content = `${frontmatter}\n\n${body}`;

    if (!this.app.vault.getAbstractFileByPath(notePath)) {
      await this.app.vault.create(notePath, content);
    }
    return notePath;
  }

  async updateNote(notePath: string, card: TrelloCard, members: TrelloMember[]): Promise<NoteUpdateResult> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!file) {
      await this.createNote(card, members, notePath.replace(/\/[^/]+$/, '') + '/dummy.md');
      return { status: 'created' };
    }

    const raw = await this.app.vault.adapter.read(notePath);
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) return { status: 'no-change' };

    const fmBlock = fmMatch[1];
    const currentBody = fmMatch[2].trim();

    const storedHashMatch = fmBlock.match(/trello_content_hash:\s*"([^"]+)"/);
    const lastSyncedMatch = fmBlock.match(/trello_last_synced:\s*"([^"]+)"/);
    const storedCardNameMatch = fmBlock.match(/trello_card_name:\s*"([^"]+)"/);

    const storedHash = storedHashMatch?.[1] ?? '';
    const lastSynced = lastSyncedMatch?.[1] ?? '';
    const storedCardName = storedCardNameMatch?.[1] ?? '';

    const currentHash = await this.hashBody(currentBody);
    const localChanged = currentHash !== storedHash;
    const remoteChanged = card.dateLastActivity > lastSynced;

    if (localChanged && remoteChanged) {
      return {
        status: 'conflict',
        conflict: {
          localBody: currentBody,
          remoteBody: card.desc || '',
          localTitle: storedCardName,
          remoteTitle: card.name,
        },
      };
    }

    if (!remoteChanged) return { status: 'no-change' };

    const newBody = card.desc || '';
    const newHash = await this.hashBody(newBody);
    const newFrontmatter = this.buildFrontmatter(card, members, newHash);
    await this.app.vault.adapter.write(notePath, `${newFrontmatter}\n\n${newBody}`);
    return { status: 'updated' };
  }

  async readNoteBody(notePath: string): Promise<string> {
    const raw = await this.app.vault.adapter.read(notePath);
    const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return fmMatch ? fmMatch[1].trim() : raw;
  }

  async archiveNote(notePath: string, shouldDelete: boolean): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!file) return;

    if (shouldDelete) {
      await this.app.vault.delete(file);
      return;
    }

    const folder = this.getNoteFolder(notePath);
    const archivedFolder = folder ? `${folder}/.archived` : '.archived';

    if (!this.app.vault.getAbstractFileByPath(archivedFolder)) {
      await this.app.vault.createFolder(archivedFolder);
    }

    const basename = notePath.split('/').pop() ?? notePath;
    await this.app.vault.rename(file, `${archivedFolder}/${basename}`);
  }

  async pushNoteToCard(notePath: string): Promise<{ cardId: string; body: string } | null> {
    const raw = await this.app.vault.adapter.read(notePath);
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) return null;

    const fmBlock = fmMatch[1];
    const body = fmMatch[2].trim();
    const cardIdMatch = fmBlock.match(/trello_card_id:\s*"([^"]+)"/);
    if (!cardIdMatch) return null;

    return { cardId: cardIdMatch[1], body };
  }

  async updateNoteFrontmatterAfterPush(notePath: string, newHash: string): Promise<void> {
    const raw = await this.app.vault.adapter.read(notePath);
    let updated = raw.replace(
      /trello_content_hash:\s*"[^"]+"/,
      `trello_content_hash: "${newHash}"`
    );
    updated = updated.replace(
      /trello_last_synced:\s*"[^"]+"/,
      `trello_last_synced: "${new Date().toISOString()}"`
    );
    await this.app.vault.adapter.write(notePath, updated);
  }
}
