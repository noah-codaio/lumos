import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { completionService } from '../../../services/CompletionService';
import { customRewriteState } from '../state/customRewrite';

const DEBOUNCE_MS = 500;

/**
 * Creates a debounced completion function for text rewrites
 * @param completionTimeoutRef - Reference to the completion timeout
 * @returns A function that returns completion results with debouncing
 */
export const createRewriteCompletions = (completionTimeoutRef: { current: number | null }) => {
  // Store the original suggestions between calls
  let cachedResult: CompletionResult | null = null;
  let lastSelection: { from: number, to: number } | null = null;

  const getCompletions = async (context: CompletionContext): Promise<CompletionResult | null> => {
    const selection = context.state.selection.main;
    
    // Only show rewrites when text is selected
    if (selection.empty) {
      cachedResult = null;
      lastSelection = null;
      return null;
    }

    const selectedText = context.state.sliceDoc(selection.from, selection.to);

    // Only process if we have some text
    if (selectedText.trim().length < 3) {
      cachedResult = null;
      lastSelection = null;
      return null;
    }

    // Get the custom rewrite if any
    const customRewrite = context.state.field(customRewriteState);

    // Check if we need to fetch new suggestions
    const needNewSuggestions = !cachedResult || 
      !lastSelection || 
      lastSelection.from !== selection.from || 
      lastSelection.to !== selection.to;

    if (needNewSuggestions) {
      try {
        const suggestions = await completionService.getRewriteSuggestions(selectedText);
        
        if (!Array.isArray(suggestions)) {
          return null;
        }

        if (suggestions.length === 0) {
          return null;
        }
        
        // Get all rewrites in parallel
        const rewrites = await Promise.all(
          suggestions.map(async (suggestion) => {
            if (!suggestion || typeof suggestion !== 'object') {
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
          return null;
        }

        // Cache the result
        cachedResult = {
          from: selection.from,
          to: selection.to,
          options: validRewrites.map(({suggestion, rewrite}, index) => ({
            label: `${suggestion.label} (${suggestion.key})`,
            detail: rewrite,
            apply: rewrite,
            type: 'text',
            boost: 1 - (index * 0.1)
          })),
          filter: false
        };
        lastSelection = { from: selection.from, to: selection.to };
      } catch (error) {
        // Silently handle error
        return null;
      }
    }

    // If we have a custom rewrite, add it to the cached suggestions
    if (customRewrite && cachedResult) {
      const [text, preview] = customRewrite.split('|');
      return {
        ...cachedResult,
        options: [
          {
            label: text,
            detail: preview || 'Loading preview...',
            apply: preview || text,
            type: 'text',
            boost: 2
          },
          ...cachedResult.options
        ]
      };
    }

    // If we only have a custom rewrite but no cached results yet
    if (customRewrite) {
      const [text, preview] = customRewrite.split('|');
      return {
        from: selection.from,
        to: selection.to,
        options: [{
          label: text,
          detail: preview || 'Loading preview...',
          apply: preview || text,
          type: 'text',
          boost: 2
        }],
        filter: false
      };
    }

    return cachedResult;
  };

  return (context: CompletionContext): Promise<CompletionResult | null> => {
    // If we have a custom rewrite or no cached result, return immediately
    const customRewrite = context.state.field(customRewriteState);
    if (customRewrite || !cachedResult) {
      return getCompletions(context);
    }

    // Otherwise use debouncing for normal suggestions
    return new Promise((resolve) => {
      if (completionTimeoutRef.current) {
        window.clearTimeout(completionTimeoutRef.current);
      }

      completionTimeoutRef.current = window.setTimeout(() => {
        getCompletions(context).then(resolve);
      }, DEBOUNCE_MS);
    });
  };
};                     