import { EditorView } from '@codemirror/view';
import { completionStatus, closeCompletion, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { completionService } from '../../../services/CompletionService';
import { KeyBinding } from '@codemirror/view';
import { setCustomRewrite, customRewriteState } from '../state/customRewrite';

// Track the custom rewrite being typed
let customRewriteTimeout: number | null = null;

/**
 * Creates keyboard shortcuts for rewrite commands
 * @returns Array of keyboard command configurations
 */
export const createRewriteShortcuts = (): KeyBinding[] => {
  const handleKey = (key: string) => (view: EditorView) => {
    // Always handle lowercase keys when there's a selection
    if (!view.state.selection.main.empty && key === key.toLowerCase()) {
      const currentBuffer = view.state.field(customRewriteState);
      const newBuffer = currentBuffer + key;
      
      // Update the buffer in state
      view.dispatch({
        effects: setCustomRewrite.of(newBuffer)
      });
      
      // Force refresh completions immediately to show loading state
      startCompletion(view);
      
      // Clear any existing timeout
      if (customRewriteTimeout) {
        window.clearTimeout(customRewriteTimeout);
      }

      // Set timeout to fetch rewrite after user stops typing
      customRewriteTimeout = window.setTimeout(async () => {
        const selection = view.state.selection.main;
        const selectedText = view.state.sliceDoc(selection.from, selection.to);
        
        try {
          // Get the rewrite using the buffer as the type
          const rewrite = await completionService.getRewrite(selectedText, newBuffer);
          
          // Update the buffer with the preview
          if (rewrite) {
            view.dispatch({
              effects: setCustomRewrite.of(newBuffer + '|' + rewrite)
            });
            // Force refresh completions to show the preview
            startCompletion(view);
          }
        } catch (error) {
          console.error('Error getting custom rewrite:', error);
        }
      }, 500);

      return true; // Prevent default typing
    }

    // Handle completions if they're active
    const status = completionStatus(view.state);
    if (status === 'active') {
      const completions = currentCompletions(view.state);
      if (!completions?.length) return true; // Still prevent default if we have no completions

      const keyLower = key.toLowerCase();
      const currentBuffer = view.state.field(customRewriteState);
      const [text, preview] = currentBuffer.split('|');

      // For uppercase keys, check both custom and regular options
      const option = completions.find(opt => {
        // Check if it's our custom option
        if (opt.label === text) {
          return key === key.toUpperCase();
        }
        // Check regular options
        const keyMatch = opt.label.match(/\((\w+)\)$/);
        return keyMatch && keyMatch[1].toLowerCase() === keyLower;
      });

      if (option && option.apply && key === key.toUpperCase()) {
        const selection = view.state.selection.main;
        const text = typeof option.apply === 'string' ? option.apply : option.apply.toString();
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          effects: setCustomRewrite.of('') // Clear buffer after accepting
        });
        closeCompletion(view);
        return true;
      }
      return true; // Prevent default for both cases if we have matching options
    }
    return false;
  };

  // Create handlers for both lowercase and uppercase letters
  const shortcuts: KeyBinding[] = [];
  for (const key of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
    shortcuts.push({
      key,
      run: handleKey(key)
    });
  }

  return shortcuts;
}; 