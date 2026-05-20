# Trello Sync — User Guide

## Setup

1. Open **Obsidian Settings → Kanban Plugin → Trello Integration**
2. Enter your **Trello API Key** — get it at https://trello.com/power-ups/admin
3. Click the authorization link that appears under the Token field, approve access, paste the token back in
4. Build/install the plugin if you haven't already (`npm run build`, copy `main.js` + `manifest.json` to your vault's plugin folder)

---

## Linking a Board

1. Open a kanban board file
2. Click the **gear icon** (⚙) in the board header → **Open board settings**
3. Scroll to the **Trello** section → click **Choose board**
4. Search for and select your Trello board
5. The board's frontmatter will be updated automatically:

```yaml
---
kanban-plugin: board
trello:
  board_id: "abc123"
  board_name: "My Board"
  auto_sync: false
---
```

---

## Pulling from Trello

Pulls all Trello lists/cards into the kanban board. Creates linked notes for new cards.

- **Header button**: click the **↓ (download)** icon in the board header
- **Command palette**: `Pull from Trello`
- **Auto-sync**: enable *Sync on board open* in settings to pull automatically when the board is opened

**What pull does:**
| Trello change | Kanban result |
|---|---|
| New card | New item + linked note created |
| Card moved to another list | Item moves to matching lane |
| Card renamed | Item title updated |
| Card description edited | Linked note body updated |
| Card archived/deleted | Item moved to kanban archive |
| New list | New lane created |
| List renamed | Lane title updated |
| List archived | Lane archived, items moved to archive |

---

## Pushing to Trello

Most changes push automatically after you make them in the kanban UI:

| Kanban action | Trello result |
|---|---|
| Drag card to another lane | Card moved to matching list |
| Add a card | Card created in Trello |
| Edit card title | Card renamed in Trello |
| Delete / archive card | Card archived in Trello |
| Add a lane | List created in Trello |
| Rename a lane | List renamed in Trello |
| Archive / delete a lane | List archived in Trello |

**Push note body to Trello** (card description):  
Edit the linked note, then run `Push Note to Trello` from the command palette.

**Push comments to Trello**:  
Run `Push Comments to Trello` from the command palette.

---

## Linked Notes

Each Trello card gets a linked markdown note in the same folder as the kanban board file.  
The kanban item title becomes a wiki-link: `[[fix-login-bug-a1b2|Fix login bug]]`

Note frontmatter:
```yaml
---
trello_card_id: "abc123"
trello_card_name: "Fix login bug"
trello_list_id: "def456"
trello_board_id: "ghi789"
trello_last_synced: "2026-05-19T12:00:00Z"
trello_content_hash: "sha256:..."
due: "2026-06-01"
labels:
  - name: "Bug"
    color: "red"
members:
  - username: "johndoe"
    fullName: "John Doe"
---

Card description goes here.
```

---

## Comments Panel

1. Run `Toggle Trello Comments Panel` from the command palette
2. Open any Trello-linked note — comments load automatically
3. Type in the input box and click **Add Comment** (or Ctrl+Enter)
4. Click **↻** to refresh comments from Trello
5. Click **Push N** to sync unsynced local comments up to Trello

---

## Conflict Resolution

If both the local note body and the Trello card description changed since the last sync, a conflict dialog appears during pull:

- **Keep Local** — discards the Trello version, keeps your local edits
- **Use Trello** — overwrites the local note with the Trello card description

---

## Sidecar Files

The plugin creates two sidecar files next to your kanban board:

| File | Purpose |
|---|---|
| `BoardName.trello-meta.json` | Lane/item ID mappings — do not edit manually |
| `folder/.comments/card-xxxx.json` | Local comment cache per note |

---

## Settings Reference

| Setting | Default | Description |
|---|---|---|
| Trello API Key | — | Your key from trello.com/power-ups/admin |
| Trello Token | — | OAuth token (never-expiring) |
| Archive behavior | Archive | Move removed cards' notes to `.archived/` instead of deleting |
| Auto-open comments panel | Off | Show comments sidebar when opening a Trello-linked note |
| Sync on board open | Off | Auto-pull from Trello when opening a linked board |

Per-board override: **board settings → Trello → Auto-sync on open**

---

## Offline / Error Handling

- Trello sync failures never break the kanban board — all push calls are fire-and-forget with a Notice on failure
- The kanban board always works offline; Trello sync is best-effort
- If the sidecar `.trello-meta.json` is deleted, the next pull rebuilds it from scratch (cards will be treated as new)
