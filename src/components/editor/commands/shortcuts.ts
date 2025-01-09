import { EditorView } from '@codemirror/view';
import { completionStatus, closeCompletion, currentCompletions } from '@codemirror/autocomplete';
import { completionService } from '../../../services/CompletionService';
import { KeyBinding } from '@codemirror/view';

/**
 * Creates keyboard shortcuts for rewrite commands
 * @returns Array of keyboard command configurations
 */
export const createRewriteShortcuts = (): KeyBinding[] => {
  const handleKey = (key: string) => (view: EditorView) => {
    const status = completionStatus(view.state);
    if (status === 'active') {
      const completions = currentCompletions(view.state);
      if (!completions?.length) return false;

      // Find the completion option that matches the pressed key
      const option = completions.find(opt => {
        const keyMatch = opt.label.match(/\((\w+)\)$/);
        return keyMatch && keyMatch[1] === key;
      });

      if (option && option.apply) {
        const selection = view.state.selection.main;
        const text = typeof option.apply === 'string' ? option.apply : option.apply.toString();
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text }
        });
        closeCompletion(view);
        return true;
      }
    }
    return false;
  };

  // Create handlers for common keys
  const shortcuts: KeyBinding[] = [];
  for (const key of 'abcdefghijklmnopqrstuvwxyz'.split('')) {
    shortcuts.push({
      key,
      run: handleKey(key)
    });
  }

  return shortcuts;
}; 