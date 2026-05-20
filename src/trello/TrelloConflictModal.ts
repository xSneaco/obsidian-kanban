import { App, Modal } from 'obsidian';
import { ConflictInfo, ConflictResolution } from './TrelloConflict';
import { diffToHtml } from './TrelloDiffAlgorithm';

export class TrelloConflictModal extends Modal {
  private conflict: ConflictInfo;
  private resolve: (resolution: ConflictResolution) => void;

  constructor(app: App, conflict: ConflictInfo, resolve: (resolution: ConflictResolution) => void) {
    super(app);
    this.conflict = conflict;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Trello Sync Conflict' });
    contentEl.createEl('p', {
      text: `Both the local note and Trello card were modified since the last sync: ${this.conflict.notePath}`,
    });

    if (this.conflict.titleChanged) {
      const titleSection = contentEl.createDiv({ cls: 'trello-conflict-section' });
      titleSection.createEl('h3', { text: 'Title conflict' });
      titleSection.createEl('p', { text: `Local: ${this.conflict.localTitle}` });
      titleSection.createEl('p', { text: `Remote (Trello): ${this.conflict.remoteTitle}` });
    }

    const bodySection = contentEl.createDiv({ cls: 'trello-conflict-section' });
    bodySection.createEl('h3', { text: 'Body diff (green = Trello additions, red = Trello removals vs local)' });
    const diffEl = bodySection.createDiv();
    diffEl.style.cssText = 'font-family:monospace;font-size:12px;max-height:300px;overflow-y:auto;border:1px solid var(--background-modifier-border);padding:8px;';
    diffEl.innerHTML = diffToHtml(this.conflict.bodyDiff);

    const buttons = contentEl.createDiv({ cls: 'trello-conflict-buttons' });
    buttons.style.cssText = 'display:flex;gap:8px;margin-top:16px;justify-content:flex-end;';

    const keepLocalBtn = buttons.createEl('button', { text: 'Keep Local' });
    keepLocalBtn.addEventListener('click', () => {
      this.resolve({ keepLocalTitle: true, keepLocalBody: true });
      this.close();
    });

    const useRemoteBtn = buttons.createEl('button', { text: 'Use Trello' });
    useRemoteBtn.classList.add('mod-cta');
    useRemoteBtn.addEventListener('click', () => {
      this.resolve({ keepLocalTitle: false, keepLocalBody: false });
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function resolveConflict(app: App, conflict: ConflictInfo): Promise<ConflictResolution> {
  return new Promise((resolve) => {
    new TrelloConflictModal(app, conflict, resolve).open();
  });
}
