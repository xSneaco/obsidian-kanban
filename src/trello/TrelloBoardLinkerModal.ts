import { App, FuzzySuggestModal } from 'obsidian';
import { TrelloClient } from './TrelloClient';
import { TrelloBoard } from './TrelloTypes';

export class TrelloBoardLinkerModal extends FuzzySuggestModal<TrelloBoard> {
  private boards: TrelloBoard[] = [];
  private onSelect: (board: TrelloBoard) => void;

  constructor(app: App, client: TrelloClient, onSelect: (board: TrelloBoard) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder('Search Trello boards…');
    this.loadBoards(client);
  }

  private async loadBoards(client: TrelloClient) {
    try {
      this.boards = await client.getBoards();
      // Trigger re-render
      (this as any).updateSuggestions?.();
    } catch {
      this.boards = [];
    }
  }

  getItems(): TrelloBoard[] {
    return this.boards;
  }

  getItemText(board: TrelloBoard): string {
    return board.name;
  }

  onChooseItem(board: TrelloBoard): void {
    this.onSelect(board);
  }
}
