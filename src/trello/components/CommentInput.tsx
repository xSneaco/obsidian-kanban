import { JSX } from 'preact/compat';
import { useRef, useState } from 'preact/hooks';

interface CommentInputProps {
  onSubmit: (text: string) => Promise<void>;
}

export function CommentInput({ onSubmit }: CommentInputProps): JSX.Element {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setText('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="trello-comment-input">
      <textarea
        ref={textareaRef}
        className="trello-comment-textarea"
        placeholder="Add a comment… (Ctrl+Enter to submit)"
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={handleKeyDown as any}
        rows={3}
      />
      <button
        className="trello-comment-submit mod-cta"
        onClick={handleSubmit}
        disabled={!text.trim() || submitting}
      >
        {submitting ? 'Saving…' : 'Add Comment'}
      </button>
    </div>
  );
}
