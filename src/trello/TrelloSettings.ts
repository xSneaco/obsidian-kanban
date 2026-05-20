import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import KanbanPlugin from 'src/main';
import { TrelloBoardLinkerModal } from './TrelloBoardLinkerModal';

export function renderTrelloGlobalSettings(
  containerEl: HTMLElement,
  plugin: KanbanPlugin,
  onSettingsChange: (settings: any) => Promise<void>
): void {
  containerEl.createEl('h2', { text: 'Trello Integration' });

  new Setting(containerEl)
    .setName('Trello API Key')
    .setDesc('Get your key at https://trello.com/power-ups/admin')
    .addText((text) => {
      text
        .setPlaceholder('Enter API key')
        .setValue(plugin.settings.trelloApiKey || '')
        .onChange(async (value) => {
          plugin.settings.trelloApiKey = value;
          await onSettingsChange(plugin.settings);
          plugin.initTrello();
        });
      text.inputEl.style.width = '300px';
    });

  new Setting(containerEl)
    .setName('Trello Token')
    .setDesc(
      plugin.settings.trelloApiKey
        ? 'Click to authorize: https://trello.com/1/authorize?expiration=never&scope=read,write&name=Obsidian%20Kanban%20Trello&response_type=token&key=' +
          plugin.settings.trelloApiKey
        : 'Enter your API key first, then a link to authorize will appear here.'
    )
    .addText((text) => {
      text
        .setPlaceholder('Enter token')
        .setValue(plugin.settings.trelloToken || '')
        .onChange(async (value) => {
          plugin.settings.trelloToken = value;
          await onSettingsChange(plugin.settings);
          plugin.initTrello();
        });
      text.inputEl.style.width = '300px';
    });

  new Setting(containerEl)
    .setName('Archive behavior')
    .setDesc('Move deleted cards\' notes to .archived/ folder instead of deleting them')
    .addToggle((toggle) => {
      toggle.setValue(plugin.settings.trelloArchiveBehavior !== 'delete').onChange(async (value) => {
        plugin.settings.trelloArchiveBehavior = value ? 'archive' : 'delete';
        await onSettingsChange(plugin.settings);
      });
    });

  new Setting(containerEl)
    .setName('Auto-open comments panel')
    .setDesc('Show comments panel when opening a Trello-linked note')
    .addToggle((toggle) => {
      toggle.setValue(!!plugin.settings.trelloAutoOpenComments).onChange(async (value) => {
        plugin.settings.trelloAutoOpenComments = value;
        await onSettingsChange(plugin.settings);
      });
    });

  new Setting(containerEl)
    .setName('Sync on board open')
    .setDesc('Automatically pull from Trello when opening a linked board')
    .addToggle((toggle) => {
      toggle.setValue(!!plugin.settings.trelloSyncOnOpen).onChange(async (value) => {
        plugin.settings.trelloSyncOnOpen = value;
        await onSettingsChange(plugin.settings);
      });
    });
}

export function renderTrelloBoardSettings(
  containerEl: HTMLElement,
  plugin: KanbanPlugin,
  filePath: string
): void {
  containerEl.createEl('h3', { text: 'Trello' });

  if (!plugin.trelloClient) {
    containerEl.createEl('p', {
      text: 'Configure Trello API key and token in plugin settings first.',
      cls: 'setting-item-description',
    });
    return;
  }

  const file = plugin.app.vault.getAbstractFileByPath(filePath);
  if (!file) return;

  const getFrontmatterTrello = (): Record<string, unknown> | null => {
    const cache = plugin.app.metadataCache.getCache(filePath);
    return (cache?.frontmatter?.trello as Record<string, unknown>) ?? null;
  };

  const trello = getFrontmatterTrello();

  if (trello?.board_id) {
    containerEl.createEl('p', {
      text: `Linked to: ${trello.board_name || trello.board_id}`,
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('Trello board')
      .setDesc(String(trello.board_name || trello.board_id))
      .addButton((btn) => {
        btn.setButtonText('Unlink').onClick(async () => {
          await plugin.app.fileManager.processFrontMatter(file as any, (fm) => {
            delete fm.trello;
          });
          new Notice('Trello board unlinked');
        });
      })
      .addButton((btn) => {
        btn.setButtonText('Sync Now').setCta().onClick(async () => {
          const stateManager = plugin.stateManagers.get(file as any);
          if (stateManager && plugin.trelloSync) {
            await plugin.trelloSync.pull(stateManager);
          }
        });
      });

    new Setting(containerEl)
      .setName('Auto-sync on open')
      .setDesc('Override global setting for this board')
      .addToggle((toggle) => {
        toggle.setValue(!!trello.auto_sync).onChange(async (value) => {
          await plugin.app.fileManager.processFrontMatter(file as any, (fm) => {
            if (!fm.trello) fm.trello = {};
            (fm.trello as Record<string, unknown>).auto_sync = value;
          });
        });
      });
  } else {
    new Setting(containerEl).setName('Link to Trello Board').addButton((btn) => {
      btn
        .setButtonText('Choose board')
        .setCta()
        .onClick(() => {
          new TrelloBoardLinkerModal(plugin.app, plugin.trelloClient!, async (board) => {
            await plugin.app.fileManager.processFrontMatter(file as any, (fm) => {
              fm.trello = {
                board_id: board.id,
                board_name: board.name,
                api_key: '',
                token: '',
                last_sync: '',
                auto_sync: false,
              };
            });
            new Notice(`Linked to Trello board: ${board.name}`);
          }).open();
        });
    });
  }
}
