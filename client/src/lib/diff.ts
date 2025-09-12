import * as Diff from 'diff';

export interface DiffResult {
  field: string;
  status: 'unchanged' | 'changed' | 'added' | 'removed';
  oldValue?: any;
  newValue?: any;
  textDiff?: string;
}

export function compareObjects(oldObj: Record<string, any>, newObj: Record<string, any>): DiffResult[] {
  const results: DiffResult[] = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of Array.from(allKeys)) {
    const oldValue = oldObj[key];
    const newValue = newObj[key];

    if (!(key in oldObj)) {
      results.push({
        field: key,
        status: 'added',
        newValue
      });
    } else if (!(key in newObj)) {
      results.push({
        field: key,
        status: 'removed',
        oldValue
      });
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      let textDiff = '';
      if (typeof oldValue === 'string' && typeof newValue === 'string') {
        const changes = Diff.diffChars(oldValue, newValue);
        textDiff = changes.map((change: any) => {
          if (change.added) return `+${change.value}`;
          if (change.removed) return `-${change.value}`;
          return change.value;
        }).join('');
      }

      results.push({
        field: key,
        status: 'changed',
        oldValue,
        newValue,
        textDiff
      });
    } else {
      results.push({
        field: key,
        status: 'unchanged',
        oldValue,
        newValue
      });
    }
  }

  return results;
}

export function generateJsonDiff(oldObj: Record<string, any>, newObj: Record<string, any>): string {
  const oldStr = JSON.stringify(oldObj, null, 2);
  const newStr = JSON.stringify(newObj, null, 2);
  
  const changes = Diff.diffLines(oldStr, newStr);
  
  return changes.map((change: any) => {
    if (change.added) {
      return change.value.split('\n').map((line: string) => line ? `+${line}` : '').join('\n');
    }
    if (change.removed) {
      return change.value.split('\n').map((line: string) => line ? `-${line}` : '').join('\n');
    }
    return change.value;
  }).join('');
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  
  // Fallback for older browsers
  const textArea = document.createElement('textarea');
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
  return Promise.resolve();
}
