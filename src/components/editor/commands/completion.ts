import { EditorView } from '@codemirror/view';
import { completionStatus, currentCompletions, acceptCompletion as accept } from '@codemirror/autocomplete';
import { completionState, clearCompletions } from '../plugins/inlineCompletion';

/**
 * Accept an inline completion if one is present
 */
export const acceptInlineCompletion = (view: EditorView): boolean => {
  const state = view.state.field(completionState, false);
  if (!state?.completion) return false;

  const pos = view.state.selection.main.head;
  const newPos = pos + state.completion.length;
  view.dispatch({
    changes: { from: pos, insert: state.completion },
    selection: { anchor: newPos, head: newPos },
    effects: clearCompletions.of(null)
  });
  return true;
};

/**
 * Command to accept the current completion (either inline or dropdown)
 */
export const acceptCompletion = (view: EditorView): boolean => {
  // First try to accept an inline completion
  if (acceptInlineCompletion(view)) return true;

  // Then try to accept a dropdown completion
  const status = completionStatus(view.state);
  if (status === 'active') {
    const completions = currentCompletions(view.state);
    if (!completions?.length) return false;
    
    return accept(view);
  }
  return false;
}; 