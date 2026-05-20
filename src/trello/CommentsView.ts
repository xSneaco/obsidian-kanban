import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { render, unmountComponentAtNode } from 'preact/compat';
import KanbanPlugin from 'src/main';
import { CommentsPanel } from './components/CommentsPanel';

export const VIEW_TYPE_TRELLO_COMMENTS = 'trello-comments';

export class CommentsView extends ItemView {
  private plugin: KanbanPlugin;
  private currentNotePath: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: KanbanPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_TRELLO_COMMENTS;
  }

  getDisplayText(): string {
    return 'Trello Comments';
  }

  getIcon(): string {
    return 'message-circle';
  }

  async onOpen() {
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => this.onFileOpen(file))
    );

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.onFileOpen(activeFile);
    }
  }

  onClose() {
    unmountComponentAtNode(this.containerEl);
    return Promise.resolve();
  }

  private onFileOpen(file: TFile | null) {
    if (!file) {
      this.renderEmpty();
      return;
    }

    const cache = this.app.metadataCache.getFileCache(file);
    const cardId = cache?.frontmatter?.trello_card_id;

    if (!cardId) {
      if (this.currentNotePath !== null) {
        this.renderEmpty();
        this.currentNotePath = null;
      }
      return;
    }

    if (file.path === this.currentNotePath) return;
    this.currentNotePath = file.path;
    this.renderComments(file.path, String(cardId));
  }

  private renderEmpty() {
    unmountComponentAtNode(this.containerEl);
    this.containerEl.empty();
    this.containerEl.createEl('div', {
      text: 'Open a Trello-linked note to see comments.',
      cls: 'trello-comments-empty-state',
    });
  }

  private renderComments(notePath: string, cardId: string) {
    if (!this.plugin.trelloSync || !this.plugin.trelloCommentStore) {
      this.renderEmpty();
      return;
    }

    unmountComponentAtNode(this.containerEl);
    this.containerEl.empty();

    const container = this.containerEl.createDiv({ cls: 'trello-comments-view' });
    render(
      // @ts-ignore — preact JSX
      CommentsPanel({
        notePath,
        cardId,
        commentStore: this.plugin.trelloCommentStore,
        trelloSync: this.plugin.trelloSync,
      }),
      container
    );
  }
}
