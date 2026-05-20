import { App } from 'obsidian';

export interface TrelloLaneMapping {
  kanbanLaneId: string;
  trelloListId: string;
  trelloListName: string;
}

export interface TrelloItemMapping {
  kanbanItemId: string;
  trelloCardId: string;
  trelloCardName: string;
  notePath: string | null;
  contentHash: string;
  lastSynced: string;
}

export interface TrelloBoardMetadata {
  trelloBoardId: string;
  trelloBoardName: string;
  lastFullSync: string;
  laneMappings: TrelloLaneMapping[];
  itemMappings: TrelloItemMapping[];
}

export class TrelloMetadataManager {
  constructor(private app: App) {}

  private sidecarPath(kanbanFilePath: string): string {
    return kanbanFilePath.replace(/\.md$/, '.trello-meta.json');
  }

  async loadMetadata(kanbanFilePath: string): Promise<TrelloBoardMetadata | null> {
    const path = this.sidecarPath(kanbanFilePath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    try {
      const content = await this.app.vault.adapter.read(path);
      return JSON.parse(content) as TrelloBoardMetadata;
    } catch {
      return null;
    }
  }

  async saveMetadata(kanbanFilePath: string, meta: TrelloBoardMetadata): Promise<void> {
    const path = this.sidecarPath(kanbanFilePath);
    const content = JSON.stringify(meta, null, 2);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file) {
      await this.app.vault.adapter.write(path, content);
    } else {
      await this.app.vault.adapter.write(path, content);
    }
  }

  findLaneByTrelloId(meta: TrelloBoardMetadata, trelloListId: string): TrelloLaneMapping | undefined {
    return meta.laneMappings.find((m) => m.trelloListId === trelloListId);
  }

  findLaneByKanbanId(meta: TrelloBoardMetadata, kanbanLaneId: string): TrelloLaneMapping | undefined {
    return meta.laneMappings.find((m) => m.kanbanLaneId === kanbanLaneId);
  }

  findItemByTrelloId(meta: TrelloBoardMetadata, trelloCardId: string): TrelloItemMapping | undefined {
    return meta.itemMappings.find((m) => m.trelloCardId === trelloCardId);
  }

  findItemByKanbanId(meta: TrelloBoardMetadata, kanbanItemId: string): TrelloItemMapping | undefined {
    return meta.itemMappings.find((m) => m.kanbanItemId === kanbanItemId);
  }

  addLaneMapping(meta: TrelloBoardMetadata, mapping: TrelloLaneMapping): void {
    const existing = this.findLaneByTrelloId(meta, mapping.trelloListId);
    if (existing) {
      Object.assign(existing, mapping);
    } else {
      meta.laneMappings.push(mapping);
    }
  }

  addItemMapping(meta: TrelloBoardMetadata, mapping: TrelloItemMapping): void {
    const existing = this.findItemByTrelloId(meta, mapping.trelloCardId);
    if (existing) {
      Object.assign(existing, mapping);
    } else {
      meta.itemMappings.push(mapping);
    }
  }

  removeLaneMapping(meta: TrelloBoardMetadata, kanbanLaneId: string): void {
    meta.laneMappings = meta.laneMappings.filter((m) => m.kanbanLaneId !== kanbanLaneId);
  }

  removeItemMapping(meta: TrelloBoardMetadata, kanbanItemId: string): void {
    meta.itemMappings = meta.itemMappings.filter((m) => m.kanbanItemId !== kanbanItemId);
  }

  emptyMetadata(trelloBoardId: string, trelloBoardName: string): TrelloBoardMetadata {
    return {
      trelloBoardId,
      trelloBoardName,
      lastFullSync: '',
      laneMappings: [],
      itemMappings: [],
    };
  }
}
