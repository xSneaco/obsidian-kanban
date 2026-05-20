import { JSX } from 'preact/compat';
import { StoredComment } from '../TrelloCommentStore';

interface CommentItemProps {
  comment: StoredComment;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CommentItem({ comment }: CommentItemProps): JSX.Element {
  const initials = comment.authorFullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="trello-comment-item">
      <div className="trello-comment-avatar">{initials}</div>
      <div className="trello-comment-body">
        <div className="trello-comment-header">
          <span className="trello-comment-author">{comment.authorFullName}</span>
          <span className="trello-comment-time">{relativeTime(comment.date)}</span>
          {!comment.synced && <span className="trello-comment-unsynced">• unsaved</span>}
        </div>
        <div className="trello-comment-text">{comment.text}</div>
      </div>
    </div>
  );
}
