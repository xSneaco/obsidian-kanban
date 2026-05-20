export interface DiffLine {
  type: 'equal' | 'added' | 'removed';
  content: string;
}

export function lcsLineDiff(localLines: string[], remoteLines: string[]): DiffLine[] {
  const m = localLines.length;
  const n = remoteLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (localLines[i - 1] === remoteLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && localLines[i - 1] === remoteLines[j - 1]) {
      result.unshift({ type: 'equal', content: localLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', content: remoteLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', content: localLines[i - 1] });
      i--;
    }
  }

  return result;
}

export function diffToHtml(diff: DiffLine[]): string {
  return diff
    .map((line) => {
      if (line.type === 'equal') return `<span>${escapeHtml(line.content)}</span>`;
      if (line.type === 'added') return `<ins style="background:#d4edda;display:block">${escapeHtml(line.content)}</ins>`;
      return `<del style="background:#f8d7da;display:block">${escapeHtml(line.content)}</del>`;
    })
    .join('\n');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
