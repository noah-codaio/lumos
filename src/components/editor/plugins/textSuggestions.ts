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
      'data-description': suggestion.description || ''
    },
    inclusive: true
  });
}

// State field to track suggestions
export const suggestionState = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(suggestions, tr) {

    // Map through changes first
    suggestions = suggestions.map(tr.changes);
    
    for (const effect of tr.effects) {
      if (effect.is(addSuggestions)) {

        const marks = effect.value.map(suggestion => {
          try {
            // Get the line containing the suggestion
            const line = tr.state.doc.lineAt(suggestion.from);
            const lineText = line.text;
            // Find list marker if present
            const listMatch = lineText.match(/^(\s*(?:\d+\.|[-*])\s+)/);
            const listMarkerLength = listMatch ? listMatch[1].length : 0;
            
            // Calculate positions relative to line start
            const relativeFrom = suggestion.from - line.from;
            const relativeTo = suggestion.to - line.from;
            
            // Create decoration directly without position adjustment
            const text = tr.state.doc.sliceString(suggestion.from, suggestion.to);
            
            if (text.trim().length > 0) {
              const mark = createSuggestionMark({
                ...suggestion,
                from: suggestion.from,
                to: suggestion.to
              }).range(suggestion.from, suggestion.to);
              
              return mark;
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
      return;
    }
  }

  update(update: ViewUpdate) {
    try {
      // Ensure we have a valid view and state
      if (!update?.view?.state) {
        return;
      }

      // Ensure we have a valid document
      const doc = update.state.doc;
      if (!doc) {
        return;
      }

      // Only schedule checks for document changes
      if (update.docChanged) {

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

        return;
      }

      // Ensure we have a valid state and document
      const state = this.view.state;
      if (!state?.doc) {

        return;
      }

      // Get full document text safely
      let text: string;
      try {
        text = state.doc.toString();
      } catch (error) {
        return;
      }
      
      // Check if there's enough content to analyze
      const lines = text.split('\n');
      
      // Process each line for list items
      const listItemContent = lines
        .map(line => {
          const trimmed = line.trim();
          // Match both numbered and bullet lists with more permissive spacing
          const match = trimmed.match(/^(\d+\.|\-|\*)\s*(.+)$/);
          if (match) {
            return {
              content: match[2].trim(),
              fullLine: line
            };
          }
          return null;
        })
        .filter(item => item !== null);
      
      if (listItemContent.length === 0) {
        return;
      }

      // Clear existing suggestions before requesting new ones
      this.view.dispatch({
        effects: clearSuggestions.of(null)
      });

      let suggestions;
      try {
        suggestions = await completionService.getTextSuggestions(text);
        
        // Validate suggestions is an array
        if (!Array.isArray(suggestions)) {
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
          
          return isValid;
        });
      } catch (apiError) {
        console.error('API error:', apiError);
        return;
      }
      
      // Ensure view is still valid before dispatching
      if (!this.view?.state) {

        return;
      }

      if (suggestions.length > 0) {
        try {
          // Ensure suggestions are within document bounds
          const validSuggestions = suggestions.map(suggestion => ({
            ...suggestion,
            from: Math.max(0, Math.min(suggestion.from, state.doc.length)),
            to: Math.max(0, Math.min(suggestion.to, state.doc.length))
          })).filter(suggestion => suggestion.from < suggestion.to);

          if (validSuggestions.length > 0) {
            // Always dispatch suggestions if they're valid
            if (this.view?.state) {
              try {
                this.view.dispatch({
                  effects: addSuggestions.of(validSuggestions)
                });
              } catch (error) {
                // Silently handle error
              }
            }
          }
        } catch (error) {
          // Silently handle error
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