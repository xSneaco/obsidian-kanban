import update from 'immutability-helper';
import { App, Notice } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { generateInstanceId } from 'src/components/helpers';
import { Board, Item, ItemTemplate, Lane, LaneTemplate } from 'src/components/types';
import {
  appendEntities,
  getEntityFromPath,
  insertEntity,
  removeEntity,
  updateEntity,
} from 'src/dnd/util/data';

import { TrelloClient } from './TrelloClient';
import { checkConflict, ConflictInfo } from './TrelloConflict';
import { resolveConflict } from './TrelloConflictModal';
import { TrelloBoardMetadata, TrelloItemMapping, TrelloLaneMapping, TrelloMetadataManager } from './TrelloMetadata';
import { TrelloNoteManager } from './TrelloNoteManager';
import { TrelloCommentStore } from './TrelloCommentStore';
import { TrelloCard, TrelloList, TrelloMember } from './TrelloTypes';

export interface PullResult {
  created: number;
  updated: number;
  archived: number;
  conflicts: ConflictInfo[];
  errors: string[];
}

export class TrelloSync {
  constructor(
    private app: App,
    private client: TrelloClient,
    private metadataManager: TrelloMetadataManager,
    private noteManager: TrelloNoteManager,
    private commentStore: TrelloCommentStore
  ) {}

  private getTrelloFrontmatter(stateManager: StateManager): Record<string, unknown> | null {
    const fm = stateManager.state?.data?.frontmatter as Record<string, unknown> | undefined;
    if (!fm?.trello) return null;
    return fm.trello as Record<string, unknown>;
  }

  isTrelloBoard(stateManager: StateManager): boolean {
    const trello = this.getTrelloFrontmatter(stateManager);
    return !!(trello?.board_id);
  }

  async pull(stateManager: StateManager): Promise<PullResult> {
    const result: PullResult = { created: 0, updated: 0, archived: 0, conflicts: [], errors: [] };

    try {
      const trello = this.getTrelloFrontmatter(stateManager);
      if (!trello?.board_id) {
        new Notice('This board is not linked to Trello');
        return result;
      }

      const boardId = trello.board_id as string;
      const kanbanFilePath = stateManager.file.path;

      let meta = await this.metadataManager.loadMetadata(kanbanFilePath);
      if (!meta) {
        meta = this.metadataManager.emptyMetadata(boardId, (trello.board_name as string) || boardId);
      }

      new Notice('Pulling from Trello…');

      const [lists, cards, members] = await Promise.all([
        this.client.getLists(boardId),
        this.client.getCards(boardId),
        this.client.getMembers(boardId),
      ]);

      // Sort by pos
      lists.sort((a, b) => a.pos - b.pos);
      cards.sort((a, b) => a.pos - b.pos);

      // Compute new board state synchronously; collect async file ops to run after setState
      let newBoard = stateManager.state;
      const asyncOps: Array<() => Promise<void>> = [];

      // --- RECONCILE LANES ---
      const fetchedListIds = new Set(lists.map((l) => l.id));

      // Archive lanes whose Trello list is gone
      const lanesToArchive: string[] = [];
      for (const mapping of meta!.laneMappings) {
        if (!fetchedListIds.has(mapping.trelloListId)) {
          lanesToArchive.push(mapping.kanbanLaneId);
        }
      }

      for (const laneId of lanesToArchive) {
        const idx = newBoard.children.findIndex((l) => l.id === laneId);
        if (idx >= 0) {
          const lane = newBoard.children[idx];
          const archiveItems = [...(newBoard.data.archive || []), ...lane.children];
          newBoard = update(newBoard, {
            children: { $splice: [[idx, 1]] },
            data: { archive: { $set: archiveItems } },
          });
          result.archived++;
        }
        this.metadataManager.removeLaneMapping(meta!, laneId);
      }

      // Insert/update lanes from Trello
      const newLaneOrder: Lane[] = [];
      for (const list of lists) {
        const existing = this.metadataManager.findLaneByTrelloId(meta!, list.id);
        if (existing) {
          const lane = newBoard.children.find((l) => l.id === existing.kanbanLaneId);
          if (lane) {
            const updatedLane = lane.data.title !== list.name
              ? update(lane, { data: { title: { $set: list.name } } })
              : lane;
            newLaneOrder.push(updatedLane);
            existing.trelloListName = list.name;
          }
        } else {
          const newLane: Lane = {
            ...LaneTemplate,
            id: generateInstanceId(),
            children: [],
            data: { title: list.name },
          } as unknown as Lane;
          newLaneOrder.push(newLane);
          this.metadataManager.addLaneMapping(meta!, {
            kanbanLaneId: newLane.id,
            trelloListId: list.id,
            trelloListName: list.name,
          });
        }
      }

      // Preserve lanes not mapped to Trello
      for (const lane of newBoard.children) {
        const mapped = this.metadataManager.findLaneByKanbanId(meta!, lane.id);
        if (!mapped) newLaneOrder.push(lane);
      }

      newBoard = update(newBoard, { children: { $set: newLaneOrder as any } });

      // --- RECONCILE ITEMS ---
      const fetchedCardIds = new Set(cards.map((c) => c.id));

      // Archive items whose Trello card is gone
      const itemsToArchive: string[] = [];
      for (const mapping of meta!.itemMappings) {
        if (!fetchedCardIds.has(mapping.trelloCardId)) {
          itemsToArchive.push(mapping.kanbanItemId);
        }
      }

      for (const itemId of itemsToArchive) {
        for (let lIdx = 0; lIdx < newBoard.children.length; lIdx++) {
          const lane = newBoard.children[lIdx];
          const itemIdx = lane.children.findIndex((it: Item) => it.id === itemId);
          if (itemIdx >= 0) {
            const item = lane.children[itemIdx];
            const archiveItems = [...(newBoard.data.archive || []), item];
            newBoard = update(newBoard, {
              children: { [lIdx]: { children: { $splice: [[itemIdx, 1]] } } },
              data: { archive: { $set: archiveItems } },
            });

            const mapping = this.metadataManager.findItemByKanbanId(meta!, itemId);
            if (mapping?.notePath) {
              const notePath = mapping.notePath;
              asyncOps.push(() => this.noteManager.archiveNote(notePath, false).catch(() => {}));
            }
            result.archived++;
            break;
          }
        }
        this.metadataManager.removeItemMapping(meta!, itemId);
      }

      // Reconcile each Trello card
      for (const card of cards) {
        const existing = this.metadataManager.findItemByTrelloId(meta!, card.id);
        const targetLaneMapping = this.metadataManager.findLaneByTrelloId(meta!, card.idList);
        if (!targetLaneMapping) continue;

        const targetLaneIdx = newBoard.children.findIndex((l) => l.id === targetLaneMapping.kanbanLaneId);
        if (targetLaneIdx < 0) continue;

        if (existing) {
          // Find where item currently lives
          let currentLaneIdx = -1;
          let currentItemIdx = -1;
          for (let lIdx = 0; lIdx < newBoard.children.length; lIdx++) {
            const iIdx = newBoard.children[lIdx].children.findIndex((it: Item) => it.id === existing.kanbanItemId);
            if (iIdx >= 0) {
              currentLaneIdx = lIdx;
              currentItemIdx = iIdx;
              break;
            }
          }

          if (currentLaneIdx < 0) continue;

          const item = newBoard.children[currentLaneIdx].children[currentItemIdx] as Item;

          // Move to correct lane if needed
          if (currentLaneIdx !== targetLaneIdx) {
            newBoard = update(newBoard, {
              children: {
                [currentLaneIdx]: { children: { $splice: [[currentItemIdx, 1]] } },
                [targetLaneIdx]: { children: { $push: [item] } },
              },
            });
          }

          // Update title if changed
          const extractedName = this.extractCardName(item.data.titleRaw);
          if (extractedName !== card.name) {
            const newTitle = this.noteManager.buildItemTitle(card.name, card.id);
            const updatedItem = update(item, { data: { title: { $set: newTitle }, titleRaw: { $set: newTitle } } });
            const newItemIdx = newBoard.children[targetLaneIdx].children.findIndex((it: Item) => it.id === existing.kanbanItemId);
            if (newItemIdx >= 0) {
              newBoard = update(newBoard, {
                children: { [targetLaneIdx]: { children: { [newItemIdx]: { $set: updatedItem } } } },
              });
            }
            result.updated++;
          }

          // Queue note sync and comment sync as async ops
          if (existing.notePath) {
            const notePath = existing.notePath;
            const cardSnapshot = card;
            asyncOps.push(async () => {
              const noteResult = await this.noteManager.updateNote(notePath, cardSnapshot, members).catch(() => null);
              if (noteResult?.status === 'conflict' && noteResult.conflict) {
                const conflict = checkConflict(
                  existing.kanbanItemId,
                  notePath,
                  cardSnapshot.id,
                  noteResult.conflict.localTitle,
                  noteResult.conflict.remoteTitle,
                  noteResult.conflict.localBody,
                  noteResult.conflict.remoteBody
                );
                result.conflicts.push(conflict);
              } else if (noteResult?.status === 'updated') {
                result.updated++;
              }

              if (cardSnapshot.actions) {
                const remoteComments = cardSnapshot.actions.map((a) => ({
                  id: a.id,
                  text: a.data.text,
                  authorUsername: a.memberCreator.username,
                  authorFullName: a.memberCreator.fullName,
                  date: a.date,
                }));
                await this.commentStore.mergeRemoteComments(notePath, remoteComments).catch(() => {});
              }
            });
          }

          existing.trelloCardName = card.name;
          existing.lastSynced = new Date().toISOString();
        } else {
          // New card — build item now; create note async after setState
          const title = this.noteManager.buildItemTitle(card.name, card.id);

          const newItem: Item = {
            ...ItemTemplate,
            id: generateInstanceId(),
            children: [],
            data: {
              blockId: undefined,
              checked: false,
              checkChar: ' ',
              title,
              titleRaw: title,
              titleSearch: title.toLowerCase(),
              titleSearchRaw: title.toLowerCase(),
              metadata: {},
            },
          } as unknown as Item;

          newBoard = update(newBoard, {
            children: { [targetLaneIdx]: { children: { $push: [newItem] } } },
          });

          const cardSnapshot = card;
          const newItemId = newItem.id;
          asyncOps.push(async () => {
            const notePath = await this.noteManager.createNote(cardSnapshot, members, stateManager.file.path).catch(() => null);
            const contentHash = notePath ? await this.noteManager.hashBody(cardSnapshot.desc || '') : '';
            this.metadataManager.addItemMapping(meta!, {
              kanbanItemId: newItemId,
              trelloCardId: cardSnapshot.id,
              trelloCardName: cardSnapshot.name,
              notePath: notePath ?? null,
              contentHash,
              lastSynced: new Date().toISOString(),
            });
          });

          result.created++;
        }
      }

      // Apply board state synchronously
      stateManager.setState(newBoard);

      // Run async file operations
      for (const op of asyncOps) {
        await op();
      }

      // Resolve conflicts
      for (const conflict of result.conflicts) {
        const resolution = await resolveConflict(this.app, conflict);
        const { body } = resolution.keepLocalBody
          ? { body: conflict.localBody }
          : { body: conflict.remoteBody };
        const card = cards.find((c) => c.id === conflict.cardId);
        if (card && !resolution.keepLocalBody) {
          await this.noteManager.updateNote(conflict.notePath, card, members).catch(() => {});
        }
      }

      meta!.lastFullSync = new Date().toISOString();
      await this.metadataManager.saveMetadata(kanbanFilePath, meta!);

      new Notice(
        `Trello sync complete: ${result.created} created, ${result.updated} updated, ${result.archived} archived` +
          (result.conflicts.length ? `, ${result.conflicts.length} conflicts resolved` : '')
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(msg);
      new Notice(`Trello sync failed: ${msg}`);
    }

    return result;
  }

  private extractCardName(itemTitle: string): string {
    const match = itemTitle.match(/\[\[[^\]|]+\|([^\]]+)\]\]/);
    if (match) return match[1];
    const wikiMatch = itemTitle.match(/\[\[([^\]|]+)\]\]/);
    if (wikiMatch) return wikiMatch[1];
    return itemTitle;
  }

  async pushItemMove(stateManager: StateManager, itemId: string, newLaneId: string, newIndex: number): Promise<void> {
    const kanbanFilePath = stateManager.file.path;
    console.log('[Trello] pushItemMove: file=', kanbanFilePath, 'itemId=', itemId, 'newLaneId=', newLaneId, 'newIndex=', newIndex);

    const meta = await this.metadataManager.loadMetadata(kanbanFilePath);
    if (!meta) {
      console.warn('[Trello] pushItemMove: no metadata found for', kanbanFilePath, '— aborting');
      return;
    }
    console.log('[Trello] pushItemMove: meta loaded, itemMappings=', meta.itemMappings.length, 'laneMappings=', meta.laneMappings.length);

    const itemMapping = this.metadataManager.findItemByKanbanId(meta, itemId);
    const laneMapping = this.metadataManager.findLaneByKanbanId(meta, newLaneId);
    if (!itemMapping) {
      console.warn('[Trello] pushItemMove: no itemMapping for kanban itemId=', itemId, '— card not synced to Trello yet');
      return;
    }
    if (!laneMapping) {
      console.warn('[Trello] pushItemMove: no laneMapping for kanban laneId=', newLaneId, '— list not synced to Trello yet');
      return;
    }
    console.log('[Trello] pushItemMove: trelloCardId=', itemMapping.trelloCardId, 'trelloListId=', laneMapping.trelloListId);

    const board = stateManager.state;
    const targetLane = board.children.find((l) => l.id === newLaneId);
    if (!targetLane) {
      console.warn('[Trello] pushItemMove: targetLane not found in board state for laneId=', newLaneId);
      return;
    }

    const siblings = targetLane.children.filter((it: Item) => it.id !== itemId);
    let pos: number;
    if (siblings.length === 0) {
      pos = 16384;
    } else if (newIndex === 0) {
      const firstMapping = this.metadataManager.findItemByKanbanId(meta, siblings[0].id);
      pos = firstMapping ? 0 : 8192;
    } else if (newIndex >= siblings.length) {
      pos = 65536 * siblings.length;
    } else {
      pos = 65536 * newIndex;
    }
    console.log('[Trello] pushItemMove: computed pos=', pos, 'siblings=', siblings.length, '— calling moveCard');

    await this.client.moveCard(itemMapping.trelloCardId, laneMapping.trelloListId, pos);

    if (itemMapping.notePath) {
      const raw = await this.app.vault.adapter.read(itemMapping.notePath).catch(() => null);
      if (raw) {
        const updated = raw
          .replace(/trello_list_id:\s*"[^"]+"\n/, `trello_list_id: "${laneMapping.trelloListId}"\n`)
          .replace(/trello_pos:\s*\d+\n/, `trello_pos: ${pos}\n`);
        await this.app.vault.adapter.write(itemMapping.notePath, updated);
      }
    }

    await this.metadataManager.saveMetadata(kanbanFilePath, meta);
  }

  async pushItemCreate(stateManager: StateManager, laneId: string, itemTitle: string, itemId: string): Promise<void> {
    const kanbanFilePath = stateManager.file.path;
    const meta = await this.metadataManager.loadMetadata(kanbanFilePath);
    if (!meta) return;

    const laneMapping = this.metadataManager.findLaneByKanbanId(meta, laneId);
    if (!laneMapping) return;

    const cardName = this.extractCardName(itemTitle) || itemTitle;
    const card = await this.client.createCard(laneMapping.trelloListId, cardName, '');

    const notePath = await this.noteManager.createNote(card, [], kanbanFilePath).catch(() => null);
    const contentHash = await this.noteManager.hashBody('');

    this.metadataManager.addItemMapping(meta, {
      kanbanItemId: itemId,
      trelloCardId: card.id,
      trelloCardName: card.name,
      notePath: notePath ?? null,
      contentHash,
      lastSynced: new Date().toISOString(),
    });

    await this.metadataManager.saveMetadata(kanbanFilePath, meta);
  }

  async pushItemUpdate(stateManager: StateManager, itemId: string, newTitle: string): Promise<void> {
    const kanbanFilePath = stateManager.file.path;
    const meta = await this.metadataManager.loadMetadata(kanbanFilePath);
    if (!meta) return;

    const itemMapping = this.metadataManager.findItemByKanbanId(meta, itemId);
    if (!itemMapping) return;

    const cardName = this.extractCardName(newTitle) || newTitle;
    await this.client.updateCard(itemMapping.trelloCardId, { name: cardName });

    if (itemMapping.notePath) {
      const raw = await this.app.vault.adapter.read(itemMapping.notePath).catch(() => null);
      if (raw) {
        const updated = raw.replace(
          /trello_card_name:\s*"[^"]+"/,
          `trello_card_name: "${cardName.replace(/"/g, '\\"')}"`
        );
        await this.app.vault.adapter.write(itemMapping.notePath, updated);
      }
    }

    itemMapping.trelloCardName = cardName;
    await this.metadataManager.saveMetadata(kanbanFilePath, meta);
  }

  async pushItemDelete(stateManager: StateManager, itemId: string): Promise<void> {
    const kanbanFilePath = stateManager.file.path;
    const meta = await this.metadataManager.loadMetadata(kanbanFilePath);
    if (!meta) return;

    const itemMapping = this.metadataManager.findItemByKanbanId(meta, itemId);
    if (!itemMapping) return;

    await this.client.updateCard(itemMapping.trelloCardId, { closed: true });

    if (itemMapping.notePath) {
      await this.noteManager.archiveNote(itemMapping.notePath, false).catch(() => {});
    }

    this.metadataManager.removeItemMapping(meta, itemId);
    await this.metadataManager.saveMetadata(kanbanFilePath, meta);
  }

  async pushLaneCreate(stateManager: StateManager, laneId: string, laneName: string): Promise<void> {
    const kanbanFilePath = stateManager.file.path;
    const trello = this.getTrelloFrontmatter(stateManager);
    if (!trello?.board_id) return;

    const meta = await this.metadataManager.loadMetadata(kanbanFilePath) ??
      this.metadataManager.emptyMetadata(trello.board_id as string, '');

    const lists = await this.client.getLists(trello.board_id as string);
    const maxPos = lists.reduce((max, l) => Math.max(max, l.pos), 0);
    const list = await this.client.createList(trello.board_id as string, laneName, maxPos + 16384);

    this.metadataManager.addLaneMapping(meta, {
      kanbanLaneId: laneId,
      trelloListId: list.id,
      trelloListName: list.name,
    });

    await this.metadataManager.saveMetadata(kanbanFilePath, meta);
  }

  async pushLaneRename(stateManager: StateManager, laneId: string, newName: string): Promise<void> {
    const kanbanFilePath = stateManager.file.path;
    const meta = await this.metadataManager.loadMetadata(kanbanFilePath);
    if (!meta) return;

    const laneMapping = this.metadataManager.findLaneByKanbanId(meta, laneId);
    if (!laneMapping) return;

    await this.client.updateList(laneMapping.trelloListId, { name: newName });
    laneMapping.trelloListName = newName;
    await this.metadataManager.saveMetadata(kanbanFilePath, meta);
  }

  async pushLaneArchive(stateManager: StateManager, laneId: string): Promise<void> {
    const kanbanFilePath = stateManager.file.path;
    const meta = await this.metadataManager.loadMetadata(kanbanFilePath);
    if (!meta) return;

    const laneMapping = this.metadataManager.findLaneByKanbanId(meta, laneId);
    if (!laneMapping) return;

    await this.client.archiveList(laneMapping.trelloListId);

    const board = stateManager.state;
    const lane = board.children.find((l) => l.id === laneId);
    if (lane) {
      for (const item of lane.children as Item[]) {
        const itemMapping = this.metadataManager.findItemByKanbanId(meta, item.id);
        if (itemMapping?.notePath) {
          await this.noteManager.archiveNote(itemMapping.notePath, false).catch(() => {});
        }
        this.metadataManager.removeItemMapping(meta, item.id);
      }
    }

    this.metadataManager.removeLaneMapping(meta, laneId);
    await this.metadataManager.saveMetadata(kanbanFilePath, meta);
  }

  async pushNoteToTrello(notePath: string): Promise<void> {
    const result = await this.noteManager.pushNoteToCard(notePath);
    if (!result) {
      new Notice('This note is not linked to a Trello card');
      return;
    }

    await this.client.updateCard(result.cardId, { desc: result.body });
    const newHash = await this.noteManager.hashBody(result.body);
    await this.noteManager.updateNoteFrontmatterAfterPush(notePath, newHash);
    new Notice('Note pushed to Trello');
  }

  async pushNoteComments(notePath: string): Promise<void> {
    const store = await this.commentStore.load(notePath);
    const raw = await this.app.vault.adapter.read(notePath).catch(() => null);
    if (!raw) return;

    const cardIdMatch = raw.match(/trello_card_id:\s*"([^"]+)"/);
    if (!cardIdMatch) return;

    const cardId = cardIdMatch[1];
    let pushed = 0;

    for (const comment of store.comments) {
      if (!comment.synced) {
        const action = await this.client.addComment(cardId, comment.text);
        await this.commentStore.markSynced(notePath, comment.id, action.id);
        pushed++;
      }
    }

    new Notice(`Pushed ${pushed} comment(s) to Trello`);
  }
}
