import { ViewPlugin, ViewUpdate, Decoration, DecorationSet, EditorView, WidgetType, Tooltip, showTooltip } from '@codemirror/view';
import { StateField, StateEffect, Range } from '@codemirror/state';
import { TextSuggestion } from '../../../types/completion';
import { completionService } from '../../../services/CompletionService';

const DEBOUNCE_MS = 3000;

// Effects for managing suggestions
export const addSuggestions = StateEffect.define<TextSuggestion[]>();
export const clearSuggestions = StateEffect.define<null>();
export const acceptSuggestion = StateEffect.define<TextSuggestion>();
export const dismissSuggestion = StateEffect.define<TextSuggestion>();

// Widget for displaying the suggestion tooltip
class SuggestionTooltip extends WidgetType {
  constructor(
    readonly suggestion: TextSuggestion,
    readonly view: EditorView
  ) { super(); }

  toDOM() {
    const tooltip = document.createElement('div');
    tooltip.className = 'cm-suggestion-tooltip';
    tooltip.style.pointerEvents = 'auto'; // Enable interactions

    const replacement = document.createElement('div');
    replacement.className = 'cm-suggestion-replacement';
    replacement.textContent = this.suggestion.replacement;
    tooltip.appendChild(replacement);

    const description = document.createElement('div');
    description.className = 'cm-suggestion-description';
    description.textContent = this.suggestion.description;
    tooltip.appendChild(description);

    const actions = document.createElement('div');
    actions.className = 'cm-suggestion-actions';

    const acceptButton = document.createElement('button');
    acceptButton.className = 'cm-suggestion-action cm-suggestion-accept';
    acceptButton.textContent = 'Accept';
    acceptButton.onclick = (e) => {
      e.stopPropagation();
      this.view.dispatch({
        changes: { from: this.suggestion.from, to: this.suggestion.to, insert: this.suggestion.replacement },
        effects: acceptSuggestion.of(this.suggestion)
      });
    };
    actions.appendChild(acceptButton);

    const dismissButton = document.createElement('button');
    dismissButton.className = 'cm-suggestion-action cm-suggestion-dismiss';
    dismissButton.textContent = 'Dismiss';
    dismissButton.onclick = (e) => {
      e.stopPropagation();
      this.view.dispatch({
        effects: dismissSuggestion.of(this.suggestion)
      });
    };
    actions.appendChild(dismissButton);

    tooltip.appendChild(actions);
    return tooltip;
  }

  ignoreEvent() { return false; }
}

// Create decorations for suggestions
function createSuggestionMark(suggestion: TextSuggestion) {
  return Decoration.mark({
    class: `cm-text-suggestion cm-text-suggestion-${suggestion.type}`,
    tagName: 'span',
    attributes: {
      'data-suggestion': suggestion.replacement,
      'data-type': suggestion.type,
      'data-description': suggestion.description || '',
      'data-inline': 'true',
      'data-no-break': 'true',
      'style': `
        display: inline-block !important;
        white-space: pre !important;
        position: static !important;
        visibility: visible !important;
        word-break: keep-all !important;
        overflow: visible !important;
        z-index: 2 !important;
        vertical-align: top !important;
        width: auto !important;
        min-width: min-content !important;
        max-width: none !important;
        line-height: inherit !important;
      `
    },
    inclusive: true,
    inclusiveStart: true,
    inclusiveEnd: true,
    preserveWhitespace: true
  });
}

// State field to track suggestions
export const suggestionState = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(suggestions, tr) {
    console.log('Updating suggestions state');
    // Map through changes first
    suggestions = suggestions.map(tr.changes);
    
    for (const effect of tr.effects) {
      if (effect.is(addSuggestions)) {
        console.log('Processing addSuggestions effect:', effect.value);
        const marks = effect.value.map(suggestion => {
          try {
            // Get the line containing the suggestion
            const line = tr.state.doc.lineAt(suggestion.from);
            const lineText = line.text;
            console.log('Processing suggestion for line:', {
              lineText,
              suggestion
            });
            
            // Find list marker if present
            const listMatch = lineText.match(/^(\s*(?:\d+\.|[-*])\s+)/);
            const listMarkerLength = listMatch ? listMatch[1].length : 0;
            console.log('List marker info:', { listMatch, listMarkerLength });
            
            // Calculate positions relative to line start
            const relativeFrom = suggestion.from - line.from;
            const relativeTo = suggestion.to - line.from;
            
            // Create decoration directly without position adjustment
            const text = tr.state.doc.sliceString(suggestion.from, suggestion.to);
            console.log('Creating suggestion mark:', {
              text,
              from: suggestion.from,
              to: suggestion.to,
              type: suggestion.type
            });
            
            if (text.trim().length > 0) {
              const mark = createSuggestionMark({
                ...suggestion,
                from: suggestion.from,
                to: suggestion.to
              }).range(suggestion.from, suggestion.to);
              
              console.log('Created suggestion mark:', mark);
              return mark;
            } else {
              console.log('Skipping empty suggestion text');
            }
          } catch (error) {
            console.error('Error creating suggestion mark:', error);
          }
          return null;
        }).filter((mark): mark is Range<Decoration> => mark !== null);
        suggestions = Decoration.set(marks, true);
      } else if (effect.is(clearSuggestions)) {
        suggestions = Decoration.none;
      } else if (effect.is(acceptSuggestion) || effect.is(dismissSuggestion)) {
        const suggestionToRemove = effect.value;
        const newMarks: { from: number, to: number, value: Decoration }[] = [];
        suggestions.between(0, tr.state.doc.length, (from, to, value) => {
          const replacement = value.spec.attributes?.['data-suggestion'] || '';
          const type = value.spec.attributes?.['data-type'] || '';
          const description = value.spec.attributes?.['data-description'] || '';
          
          if (from !== suggestionToRemove.from || to !== suggestionToRemove.to) {
            // Ensure positions are within document bounds
            const validFrom = Math.min(from, tr.state.doc.length);
            const validTo = Math.min(to, tr.state.doc.length);
            if (validFrom < validTo) {
              const suggestion: TextSuggestion = {
                from: validFrom,
                to: validTo,
                type: type as 'spelling' | 'grammar' | 'style',
                replacement,
                description,
                original: tr.state.doc.sliceString(validFrom, validTo)
              };
              newMarks.push(createSuggestionMark(suggestion).range(validFrom, validTo));
            }
          }
          return false;
        });
        suggestions = Decoration.set(newMarks, true);
      }
    }
    return suggestions;
  },
  provide: f => EditorView.decorations.from(f)
});

// Tooltip state field
export const suggestionTooltipState = StateField.define<Tooltip | null>({
  create() { return null; },
  update(tooltip, tr) {
    // Check for dismiss effect first
    for (const effect of tr.effects) {
      if (effect.is(dismissSuggestion)) {
        return null;
      }
    }

    if (!tr.docChanged && !tr.selection) return tooltip;
    
    const pos = tr.state.selection.main.head;
    const decorations = tr.state.field(suggestionState);
    const matches: { from: number; to: number; value: Decoration }[] = [];
    
    decorations.between(pos, pos, (from, to, value) => {
      matches.push({ from, to, value });
      return false;
    });
    
    if (!matches.length) return null;
    
    const deco = matches[0];
    if (!deco?.value?.spec?.attributes) return null;
    
    const suggestion: TextSuggestion = {
      from: deco.from,
      to: deco.to,
      type: (deco.value.spec.attributes['data-type'] || 'spelling') as 'spelling' | 'grammar' | 'style',
      replacement: deco.value.spec.attributes['data-suggestion'] || '',
      description: deco.value.spec.attributes['data-description'] || '',
      original: deco.value.spec.attributes['data-original'] || ''
    };
    
    return { 
      pos: deco.from,
      above: false,
      create(view) {
        return { dom: new SuggestionTooltip(suggestion, view).toDOM() };
      }
    };
  },
  provide: f => showTooltip.from(f)
});

// Plugin to handle text suggestions
export const textSuggestionPlugin = ViewPlugin.fromClass(class {
  private timeout: number | null = null;

  constructor(readonly view: EditorView) {
    if (!view?.state?.doc) {
      console.log('View not initialized, skipping constructor check');
      return;
    }

    // Delay initial check to ensure document is properly initialized
    setTimeout(() => {
      try {
        if (this.view?.state?.doc) {
          const text = this.view.state.doc.toString();
          if (text && text.trim().length > 0) {
            console.log('Initializing document check...');
            this.checkDocument();
          } else {
            console.log('Document empty, skipping initial check');
          }
        } else {
          console.log('View not ready, skipping initial check');
        }
      } catch (error) {
        console.error('Error in delayed initialization:', error);
      }
    }, 500); // Increased delay to ensure proper initialization
  }

  update(update: ViewUpdate) {
    try {
      // Ensure we have a valid view and state
      if (!update?.view?.state) {
        console.log('Invalid view or state, skipping update');
        return;
      }

      // Ensure we have a valid document
      const doc = update.state.doc;
      if (!doc) {
        console.log('Invalid document, skipping update');
        return;
      }

      // Only schedule checks for document changes
      if (update.docChanged) {
        console.log('Document changed, scheduling check...');
        // Cancel any pending checks
        if (this.timeout) {
          window.clearTimeout(this.timeout);
        }
        this.scheduleCheck();
      }
    } catch (error) {
      console.error('Error in update:', error);
    }
  }

  private scheduleCheck() {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }
    this.timeout = window.setTimeout(() => this.checkDocument(), DEBOUNCE_MS);
  }

  private async checkDocument() {
    try {
      // Ensure we have a valid view
      if (!this.view) {
        console.log('View not initialized, skipping suggestions');
        return;
      }

      // Ensure we have a valid state and document
      const state = this.view.state;
      if (!state?.doc) {
        console.log('State or document not initialized, skipping suggestions');
        return;
      }

      // Get full document text safely
      let text: string;
      try {
        text = state.doc.toString();
        console.log('Checking document text:', text);
      } catch (error) {
        console.error('Error getting document text:', error);
        return;
      }
      
      // Check if there's enough content to analyze
      const lines = text.split('\n');
      console.log('Processing lines:', lines);
      
      // Process each line for list items
      console.log('Processing lines:', lines);
      const listItemContent = lines
        .map(line => {
          const trimmed = line.trim();
          // Match both numbered and bullet lists with more permissive spacing
          const match = trimmed.match(/^(\d+\.|\-|\*)\s*(.+)$/);
          if (match) {
            console.log('Found list item:', match[2].trim());
            return {
              content: match[2].trim(),
              fullLine: line
            };
          }
          return null;
        })
        .filter(item => item !== null);
      
      console.log('Extracted list content:', listItemContent);
      
      if (listItemContent.length === 0) {
        console.log('No valid list items found, skipping suggestions');
        return;
      }
      
      // Process suggestions for each list item
      console.log('Processing suggestions for list items:', listItemContent);
      
      // Process if we have any list items, regardless of length
      console.log('Found list items:', listItemContent);

      // Clear existing suggestions before requesting new ones
      this.view.dispatch({
        effects: clearSuggestions.of(null)
      });

      console.log('Requesting suggestions from API...');
      let suggestions;
      try {
        suggestions = await completionService.getTextSuggestions(text);
        console.log('Raw API response:', suggestions);
        
        // Validate suggestions is an array
        if (!Array.isArray(suggestions)) {
          console.error('Invalid suggestions format - expected array:', suggestions);
          return;
        }
        
        // Ensure each suggestion has required properties
        suggestions = suggestions.filter(suggestion => {
          const isValid = suggestion &&
            typeof suggestion === 'object' &&
            typeof suggestion.from === 'number' &&
            typeof suggestion.to === 'number' &&
            typeof suggestion.type === 'string' &&
            typeof suggestion.replacement === 'string';
          
          if (!isValid) {
            console.warn('Filtered invalid suggestion:', suggestion);
          }
          return isValid;
        });
        
        console.log('Validated suggestions:', suggestions);
      } catch (apiError) {
        console.error('API error:', apiError);
        return;
      }
      
      // Ensure view is still valid before dispatching
      if (!this.view?.state) {
        console.log('View no longer valid, skipping suggestion dispatch');
        return;
      }

      if (suggestions.length > 0) {
        console.log('Dispatching suggestions:', suggestions);
        try {
          // Ensure suggestions are within document bounds
          const validSuggestions = suggestions.map(suggestion => ({
            ...suggestion,
            from: Math.max(0, Math.min(suggestion.from, state.doc.length)),
            to: Math.max(0, Math.min(suggestion.to, state.doc.length))
          })).filter(suggestion => suggestion.from < suggestion.to);

          if (validSuggestions.length > 0) {
            // Always dispatch suggestions if they're valid
            console.log('Dispatching valid suggestions:', validSuggestions);
            if (this.view?.state) {
              try {
                this.view.dispatch({
                  effects: addSuggestions.of(validSuggestions)
                });
                console.log('Successfully dispatched suggestions');
              } catch (error) {
                console.error('Error dispatching suggestions:', error);
              }
            } else {
              console.log('View not available for dispatching suggestions');
            }
          } else {
            console.log('No valid suggestions after bounds checking');
          }
        } catch (error) {
          console.error('Error dispatching suggestions:', error);
        }
      }
    } catch (error) {
      console.error('Error getting text suggestions:', error);
      // Clear suggestions on error to maintain consistent state
      if (this.view?.state) {
        this.view.dispatch({
          effects: clearSuggestions.of(null)
        });
      }
    }
  }

  destroy() {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }
  }
});                                                                                                         