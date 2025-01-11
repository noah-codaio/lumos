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
    attributes: {
      'data-suggestion': suggestion.replacement,
      'data-type': suggestion.type,
      'data-description': suggestion.description || '',
      'data-inline': 'true',
      'data-no-break': 'true'
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
    // Map through changes first
    suggestions = suggestions.map(tr.changes);
    
    for (const effect of tr.effects) {
      if (effect.is(addSuggestions)) {
        const marks = effect.value.map(suggestion => {
          // Ensure positions are within document bounds and handle list items
          const line = tr.state.doc.lineAt(suggestion.from);
          const lineText = line.text;
          const listMatch = lineText.match(/^(\s*(?:\d+\.|[-*])\s+)/);
          
          // Calculate the actual text start position after any list marker
          const lineStartPos = line.from;
          const textStartPos = listMatch 
            ? lineStartPos + listMatch[1].length 
            : suggestion.from;
          
          // Only apply suggestion to the actual text content, not the list marker
          const from = Math.max(textStartPos, suggestion.from);
          const to = Math.min(suggestion.to, tr.state.doc.length);
          
          // Create decoration only if we have a valid range
          if (from < to) {
            return createSuggestionMark(suggestion).range(from, to);
          }
          return null;
        }).filter((mark): mark is Range<Decoration> => mark !== null); // Type guard to handle nulls
        suggestions = Decoration.set(marks, true);
      } else if (effect.is(clearSuggestions)) {
        suggestions = Decoration.none;
      } else if (effect.is(acceptSuggestion) || effect.is(dismissSuggestion)) {
        const suggestionToRemove = effect.value;
        const newMarks: { from: number, to: number, value: Decoration }[] = [];
        suggestions.between(0, tr.state.doc.length, (from, to, value) => {
          const suggestion = JSON.parse(value.spec.attributes?.['data-suggestion'] || '{}');
          if (suggestion.from !== suggestionToRemove.from || suggestion.to !== suggestionToRemove.to) {
            // Ensure positions are within document bounds
            const validFrom = Math.min(from, tr.state.doc.length)
            const validTo = Math.min(to, tr.state.doc.length)
            if (validFrom < validTo) {
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
    const suggestionData = JSON.parse(deco.value.spec.attributes?.['data-suggestion'] || '{}');
    
    return { 
      pos: deco.from,
      above: false,
      create(view) {
        return { dom: new SuggestionTooltip(suggestionData, view).toDOM() };
      }
    };
  },
  provide: f => showTooltip.from(f)
});

// Plugin to handle text suggestions
export const textSuggestionPlugin = ViewPlugin.fromClass(class {
  private timeout: number | null = null;

  constructor(readonly view: EditorView) {
    this.checkDocument();
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.scheduleCheck();
    }
  }

  private scheduleCheck() {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }
    this.timeout = window.setTimeout(() => this.checkDocument(), DEBOUNCE_MS);
  }

  private async checkDocument() {
    const text = this.view.state.doc.toString();
    if (text.trim().length < 3) return;

    try {
      const suggestions = await completionService.getTextSuggestions(text);
      
      if (suggestions.length > 0) {
        this.view.dispatch({
          effects: addSuggestions.of(suggestions)
        });
      } else {
        this.view.dispatch({
          effects: clearSuggestions.of(null)
        });
      }
    } catch (error) {
      console.error('Error getting text suggestions:', error);
    }
  }

  destroy() {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }
  }
});                                       