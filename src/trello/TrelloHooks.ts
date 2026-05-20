import { Notice } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { Item, Lane } from 'src/components/types';
import KanbanPlugin from 'src/main';

export interface TrelloHooks {
  isTrelloBoard(stateManager: StateManager): boolean;
  onItemMoved(stateManager: StateManager, itemId: string, newLaneId: string, newIndex: number): Promise<void>;
  onItemCreated(stateManager: StateManager, laneId: string, item: Item): Promise<void>;
  onItemUpdated(stateManager: StateManager, item: Item, oldTitle: string): Promise<void>;
  onItemDeleted(stateManager: StateManager, itemId: string): Promise<void>;
  onLaneCreated(stateManager: StateManager, lane: Lane): Promise<void>;
  onLaneRenamed(stateManager: StateManager, laneId: string, newName: string): Promise<void>;
  onLaneArchived(stateManager: StateManager, laneId: string): Promise<void>;
}

export function createTrelloHooks(plugin: KanbanPlugin): TrelloHooks {
  const guard = (stateManager: StateManager): boolean => {
    return !!(plugin.trelloSync?.isTrelloBoard(stateManager));
  };

  return {
    isTrelloBoard(stateManager) {
      return guard(stateManager);
    },

    async onItemMoved(stateManager, itemId, newLaneId, newIndex) {
      console.log('[Trello] TrelloHooks.onItemMoved called: itemId=', itemId, 'newLaneId=', newLaneId, 'newIndex=', newIndex);
      if (!guard(stateManager)) {
        console.warn('[Trello] TrelloHooks.onItemMoved: guard failed (not a Trello board or trelloSync missing)');
        return;
      }
      console.log('[Trello] TrelloHooks.onItemMoved: calling pushItemMove');
      await plugin.trelloSync!
        .pushItemMove(stateManager, itemId, newLaneId, newIndex)
        .catch((e) => {
          console.error('[Trello] pushItemMove threw:', e);
          new Notice(`Trello sync failed: ${e.message}`);
        });
    },

    async onItemCreated(stateManager, laneId, item) {
      if (!guard(stateManager)) return;
      await plugin.trelloSync!
        .pushItemCreate(stateManager, laneId, item.data.titleRaw, item.id)
        .catch((e) => new Notice(`Trello sync failed: ${e.message}`));
    },

    async onItemUpdated(stateManager, item, oldTitle) {
      if (!guard(stateManager)) return;
      if (item.data.titleRaw === oldTitle) return;
      await plugin.trelloSync!
        .pushItemUpdate(stateManager, item.id, item.data.titleRaw)
        .catch((e) => new Notice(`Trello sync failed: ${e.message}`));
    },

    async onItemDeleted(stateManager, itemId) {
      if (!guard(stateManager)) return;
      await plugin.trelloSync!
        .pushItemDelete(stateManager, itemId)
        .catch((e) => new Notice(`Trello sync failed: ${e.message}`));
    },

    async onLaneCreated(stateManager, lane) {
      if (!guard(stateManager)) return;
      await plugin.trelloSync!
        .pushLaneCreate(stateManager, lane.id, lane.data.title)
        .catch((e) => new Notice(`Trello sync failed: ${e.message}`));
    },

    async onLaneRenamed(stateManager, laneId, newName) {
      if (!guard(stateManager)) return;
      await plugin.trelloSync!
        .pushLaneRename(stateManager, laneId, newName)
        .catch((e) => new Notice(`Trello sync failed: ${e.message}`));
    },

    async onLaneArchived(stateManager, laneId) {
      if (!guard(stateManager)) return;
      await plugin.trelloSync!
        .pushLaneArchive(stateManager, laneId)
        .catch((e) => new Notice(`Trello sync failed: ${e.message}`));
    },
  };
}
