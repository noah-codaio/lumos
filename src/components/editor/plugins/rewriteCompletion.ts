import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { completionService } from '../../../services/CompletionService';

const DEBOUNCE_MS = 500;

/**
 * Creates a debounced completion function for text rewrites
 * @param completionTimeoutRef - Reference to the completion timeout
 * @returns A function that returns completion results with debouncing
 */
export const createRewriteCompletions = (completionTimeoutRef: { current: number | null }) => {
  const debouncedCompletions = async (context: CompletionContext): Promise<CompletionResult | null> => {
    const selection = context.state.selection.main;
    
    // Only show rewrites when text is selected
    if (selection.empty) return null;

    const selectedText = context.state.sliceDoc(selection.from, selection.to);

    // Only process if we have some text
    if (selectedText.trim().length < 3) return null;

    try {
      const suggestions = await completionService.getRewriteSuggestions(selectedText);
      
      if (!Array.isArray(suggestions)) {
        console.error('Expected suggestions to be an array, got:', suggestions);
        return null;
      }

      if (suggestions.length === 0) {
        console.log('No suggestions returned');
        return null;
      }
      
      // Get all rewrites in parallel
      const rewrites = await Promise.all(
        suggestions.map(async (suggestion) => {
          if (!suggestion || typeof suggestion !== 'object') {
            console.error('Invalid suggestion:', suggestion);
            return null;
          }
          return {
            suggestion,
            rewrite: await completionService.getRewrite(selectedText, suggestion.label)
          };
        })
      );
      
      const validRewrites = rewrites.filter(r => r !== null);
      if (validRewrites.length === 0) {
        console.log('No valid rewrites generated');
        return null;
      }

      return {
        from: selection.from,
        to: selection.to,
        options: validRewrites.map(({suggestion, rewrite}, index) => ({
          label: `${suggestion.label} (${suggestion.key})`,
          detail: rewrite,
          apply: rewrite,
          type: 'text',
          boost: 1 - (index * 0.1) // Slightly decrease boost for each subsequent option
        })),
        filter: false
      };
    } catch (error) {
      console.error('Error getting completions:', error);
      return null;
    }
  };

  return (context: CompletionContext): Promise<CompletionResult | null> => {
    return new Promise((resolve) => {
      if (completionTimeoutRef.current) {
        window.clearTimeout(completionTimeoutRef.current);
      }

      completionTimeoutRef.current = window.setTimeout(() => {
        debouncedCompletions(context).then(resolve);
      }, DEBOUNCE_MS);
    });
  };
}; 