import { JSX } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { CommentStore, TrelloCommentStore } from '../TrelloCommentStore';
import { TrelloSync } from '../TrelloSync';
import { CommentInput } from './CommentInput';
import { CommentItem } from './CommentItem';

interface CommentsPanelProps {
  notePath: string;
  cardId: string;
  commentStore: TrelloCommentStore;
  trelloSync: TrelloSync;
}

export function CommentsPanel({ notePath, cardId, commentStore, trelloSync }: CommentsPanelProps): JSX.Element {
  const [store, setStore] = useState<CommentStore>({ comments: [] });
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const s = await commentStore.load(notePath);
    setStore(s);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [notePath]);

  const handleAdd = async (text: string) => {
    await commentStore.addLocal(notePath, text, 'me', 'Me');
    await reload();
  };

  const handlePush = async () => {
    await trelloSync.pushNoteComments(notePath);
    await reload();
  };

  const handleRefresh = async () => {
    try {
      const comments = await (trelloSync as any).client.getCardComments(cardId);
      await commentStore.mergeRemoteComments(
        notePath,
        comments.map((a: any) => ({
          id: a.id,
          text: a.data.text,
          authorUsername: a.memberCreator.username,
          authorFullName: a.memberCreator.fullName,
          date: a.date,
        }))
      );
      await reload();
    } catch (e) {
      console.error('Failed to refresh comments', e);
    }
  };

  const unsyncedCount = commentStore.getUnsyncedCount(store);

  return (
    <div className="trello-comments-panel">
      <div className="trello-comments-header">
        <span className="trello-comments-title">Comments</span>
        <div className="trello-comments-actions">
          <button onClick={handleRefresh} title="Refresh comments">↻</button>
          {unsyncedCount > 0 && (
            <button onClick={handlePush} className="mod-cta" title="Push to Trello">
              Push {unsyncedCount}
            </button>
          )}
        </div>
      </div>

      <div className="trello-comments-list">
        {loading && <div className="trello-comments-loading">Loading…</div>}
        {!loading && store.comments.length === 0 && (
          <div className="trello-comments-empty">No comments yet</div>
        )}
        {store.comments.map((c) => (
          <CommentItem key={c.id} comment={c} />
        ))}
      </div>

      <CommentInput onSubmit={handleAdd} />
    </div>
  );
}
