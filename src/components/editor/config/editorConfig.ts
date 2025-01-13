import { Extension, EditorState } from '@codemirror/state';
import { EditorView, keymap, tooltips } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { defaultKeymap } from '@codemirror/commands';
import { autocompletion, startCompletion } from '@codemirror/autocomplete';
import { completionState, inlineCompletionPlugin } from '../plugins/inlineCompletion';
import { createRewriteCompletions } from '../plugins/rewriteCompletion';
import { acceptCompletion } from '../commands/completion';
import { createRewriteShortcuts } from '../commands/shortcuts';
import { textSuggestionPlugin, suggestionState, suggestionTooltipState } from '../plugins/textSuggestions';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { hideMarkdownPlugin } from '../plugins/hideMarkdown';
import { customRewriteState } from '../state/customRewrite';
import { selectionTrackerPlugin } from '../plugins/selectionTracker';

const DEBOUNCE_MS = 500;

// Custom highlighting for Markdown
const markdownHighlighting = HighlightStyle.define([
  { tag: t.heading1, fontSize: '2em', lineHeight: '1.4' },
  { tag: t.heading2, fontSize: '1.5em', lineHeight: '1.4' },
  { tag: t.heading3, fontSize: '1.17em', lineHeight: '1.4' },
  { tag: t.heading4, fontSize: '1.1em', lineHeight: '1.4' },
  { tag: t.heading5, fontSize: '1.05em', lineHeight: '1.4' },
  { tag: t.heading6, fontSize: '1em', lineHeight: '1.4' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--accent)' },
  { tag: t.quote, display: 'block', marginLeft: '1em', color: 'var(--text-light)' },
  { tag: t.list, display: 'block', padding: '0.1em 0' }
]);

/**
 * Creates the base configuration for the editor
 * @param editorRef - Reference to the editor DOM element
 * @param completionTimeoutRef - Reference to the completion timeout
 * @returns Editor configuration extensions
 */
export const createEditorConfig = (
  editorRef: React.MutableRefObject<HTMLDivElement | null>
): Extension[] => {
  // Create a separate timeout ref for rewrite completions
  const rewriteTimeoutRef = { current: null as number | null };

  return [
    // Core setup
    basicSetup,
    markdown(),
    syntaxHighlighting(markdownHighlighting),
    keymap.of(defaultKeymap),
    
    // State fields (must be initialized first)
    EditorState.allowMultipleSelections.of(true),
    customRewriteState,
    completionState,
    suggestionState,
    suggestionTooltipState,
    
    // View configuration
    EditorView.lineWrapping,
    (() => {
      let isUpdating = false;
      return EditorView.updateListener.of(update => {
        if (!update?.view?.state?.doc) return;
        
        // Only handle document changes and ensure no update is in progress
        if (update.docChanged && !isUpdating) {
          const view = update.view;
          
          // Use microtask to ensure sequential updates
          isUpdating = true;
          queueMicrotask(() => {
            if (view.state) {
              try {
                view.dispatch({
                  changes: update.changes,
                  effects: [],
                  annotations: []
                });
              } catch (error) {
                // Silently handle any update errors
                console.debug('Update error:', error);
              }
            }
            isUpdating = false;
          });
        }
      });
    })(),
    
    // Plugins (initialized after state fields)
    hideMarkdownPlugin,
    selectionTrackerPlugin,
    textSuggestionPlugin,
    tooltips({
      position: 'absolute',
      parent: editorRef.current || undefined,
      tooltipSpace: (view) => {
        const rect = view.dom.getBoundingClientRect();
        const selectionRanges = view.contentDOM.querySelectorAll('.cm-selectionBackground');
        
        if (selectionRanges.length > 0) {
          let maxBottom = rect.top;
          
          // Find the selection background with the lowest bottom position
          selectionRanges.forEach((range) => {
            const rangeRect = range.getBoundingClientRect();
            if (rangeRect.bottom > maxBottom) {
              maxBottom = rangeRect.bottom;
            }
          });
          
          return {
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: maxBottom + 200 // Give extra space below the selection
          };
        }
        
        return {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom
        };
      }
    }),
    inlineCompletionPlugin,
    autocompletion({
      override: [createRewriteCompletions(rewriteTimeoutRef)],
      defaultKeymap: true,
      icons: false,
      closeOnBlur: false,
      activateOnTyping: true,
      updateSyncTime: DEBOUNCE_MS + 100,
      tooltipClass: () => "cm-tooltip-autocomplete",
      optionClass: () => "",
      addToOptions: [],
      positionInfo: (view: EditorView) => {
        const editorRect = view.dom.getBoundingClientRect();
        const selectionRanges = Array.from(view.contentDOM.querySelectorAll('.cm-selectionBackground'));

        if (selectionRanges.length > 0) {
          let minTop = Infinity;
          let maxBottom = -Infinity;
          let minLeft = Infinity;

          // Gather the overall bounding box of all selection highlights
          selectionRanges.forEach(rangeEl => {
            const rect = rangeEl.getBoundingClientRect();
            if (rect.top < minTop) minTop = rect.top;
            if (rect.bottom > maxBottom) maxBottom = rect.bottom;
            if (rect.left < minLeft) minLeft = rect.left;
          });

          // Position the tooltip just below the bottom of the entire selection
          return {
            style: "absolute",
            top: maxBottom - editorRect.top + 8,
            left: minLeft - editorRect.left
          };
        }

        // Fallback when no selection highlights are found
        const endCoords = view.coordsAtPos(view.state.selection.main.to);
        if (!endCoords) return {};
        return {
          style: "absolute",
          top: endCoords.bottom - editorRect.top + 8,
          left: endCoords.left - editorRect.left
        };
      }
    }),
    EditorView.updateListener.of(update => {
      if (update.selectionSet) {
        const selection = update.state.selection.main;
        if (!selection.empty) {
          startCompletion(update.view);
        }
      }
    }),
    keymap.of([
      ...createRewriteShortcuts(),
      {
        key: 'Tab',
        run: acceptCompletion
      }
    ]),
    EditorView.theme({
      '.cm-editor': {
        position: 'relative'
      }
    })
  ];
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                