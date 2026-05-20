import { JSX } from 'preact/compat';

interface TrelloLabel {
  name: string;
  color: string;
}

interface TrelloMemberBadge {
  username: string;
  fullName: string;
}

interface TrelloCardBadgesProps {
  labels?: TrelloLabel[];
  due?: string | null;
  members?: TrelloMemberBadge[];
  commentCount?: number;
  hasAttachments?: boolean;
}

const LABEL_COLORS: Record<string, string> = {
  red: '#eb5a46',
  orange: '#ff9f1a',
  yellow: '#f2d600',
  green: '#61bd4f',
  blue: '#0079bf',
  purple: '#c377e0',
  pink: '#ff80ce',
  sky: '#00c2e0',
  lime: '#51e898',
  black: '#344563',
};

function formatDue(due: string): { text: string; overdue: boolean } {
  const dueDate = new Date(due);
  const now = new Date();
  const overdue = dueDate < now;
  const text = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { text, overdue };
}

export function TrelloCardBadges({
  labels = [],
  due,
  members = [],
  commentCount = 0,
  hasAttachments = false,
}: TrelloCardBadgesProps): JSX.Element | null {
  if (!labels.length && !due && !members.length && !commentCount && !hasAttachments) {
    return null;
  }

  return (
    <div className="trello-card-badges">
      {labels.map((label, i) => (
        <span
          key={i}
          className="trello-label"
          style={{
            backgroundColor: LABEL_COLORS[label.color] || '#b3bac5',
            color: ['yellow', 'lime'].includes(label.color) ? '#333' : 'white',
          }}
          title={label.name}
        >
          {label.name || '  '}
        </span>
      ))}

      {due && (() => {
        const { text, overdue } = formatDue(due);
        return (
          <span className={`trello-due-badge${overdue ? ' trello-due-overdue' : ''}`} title={due}>
            📅 {text}
          </span>
        );
      })()}

      {members.map((m, i) => (
        <span
          key={i}
          className="trello-member-avatar"
          title={m.fullName}
        >
          {m.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </span>
      ))}

      {commentCount > 0 && (
        <span className="trello-comment-badge" title={`${commentCount} comments`}>
          💬 {commentCount}
        </span>
      )}

      {hasAttachments && (
        <span className="trello-attachment-badge" title="Has attachments">📎</span>
      )}
    </div>
  );
}
