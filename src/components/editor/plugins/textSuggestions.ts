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
      'data-original': suggestion.original || ''
    },
    inclusive: true,
    side: 1,
    priority: 150
  });
}

// State field to track suggestions
export const suggestionState = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(suggestions, tr) {
    if (!tr?.state?.doc) {
      return suggestions;
    }

    // Map through changes first
    suggestions = suggestions.map(tr.changes);
    
    for (const effect of tr.effects) {
      if (effect.is(addSuggestions)) {
        const validSuggestions = effect.value?.filter(s => 
          s && typeof s === 'object' && 
          typeof s.from === 'number' && 
          typeof s.to === 'number' &&
          s.from < s.to &&
          s.from >= 0 &&
          s.to <= tr.state.doc.length
        );

        if (!validSuggestions?.length) {
          continue;
        }

        const marks = validSuggestions.map(s => {
          const text = tr.state.doc.sliceString(s.from, s.to);
          return createSuggestionMark({
            from: s.from,
            to: s.to,
            type: s.type || 'spelling',
            replacement: s.replacement || text,
            description: s.description || '',
            original: text
          }).range(s.from, s.to);
        });

        if (marks.length > 0) {
          suggestions = Decoration.set(marks, true);
        }
        continue;
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
    if (!update?.view?.state?.doc) return;

    // Schedule a check only for document changes or initial load
    if (update.docChanged || !this.timeout) {
      // Cancel any pending checks
      if (this.timeout) {
        window.clearTimeout(this.timeout);
      }

      // Schedule a new check immediately for the initial load
      if (!this.timeout) {
        this.checkDocument();
      } else {
        // For subsequent changes, use debounce
        this.scheduleCheck();
      }
    }
  }

  private scheduleCheck() {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }
    
    this.timeout = window.setTimeout(() => {
      if (this.view?.state?.doc) {
        this.checkDocument();
      }
    }, DEBOUNCE_MS);
  }

  private async checkDocument() {
    if (!this.view?.state?.doc) return;
    
    const doc = this.view.state.doc;
    const text = doc.toString();
    
    if (!text || text.trim().length === 0) return;
    
    try {
      // Clear existing suggestions
      this.view.dispatch({
        effects: clearSuggestions.of(null)
      });

      const suggestions = await completionService.getTextSuggestions(text);
      if (!Array.isArray(suggestions) || suggestions.length === 0) return;

      // Process and validate suggestions
      const validSuggestions = suggestions.reduce((acc: TextSuggestion[], s) => {
        if (!s || typeof s !== 'object') return acc;
        
        const isValid = 
          typeof s.from === 'number' && 
          typeof s.to === 'number' && 
          typeof s.replacement === 'string' &&
          typeof s.type === 'string' &&
          s.from >= 0 && 
          s.to <= doc.length && 
          s.from < s.to;

        if (!isValid) return acc;

        acc.push({
          ...s,
          from: Math.max(0, Math.min(s.from, doc.length)),
          to: Math.max(0, Math.min(s.to, doc.length))
        });
        return acc;
      }, []);

      if (validSuggestions.length > 0 && this.view?.state) {
        this.view.dispatch({
          effects: addSuggestions.of(validSuggestions)
        });
      }
    } catch (error) {
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