import { ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType, EditorView } from '@codemirror/view';
import { StateEffect, StateField, Transaction } from '@codemirror/state';
import { completionService } from '../../../services/CompletionService';
import { syntaxTree } from '@codemirror/language';

const DEBOUNCE_MS = 500;

// Effects for managing completions
export const addCompletion = StateEffect.define<{from: number, completion: string}>();
export const clearCompletions = StateEffect.define<null>();

// Create a decoration for inline completions
// Removed unused completion mark widget

// State field for managing completion decorations
export const completionState = StateField.define<{decorations: DecorationSet, completion: string | null}>({
  create() {
    return { decorations: Decoration.none, completion: null };
  },
  update(state, tr) {
    let { decorations } = state;
    const { completion } = state;

    // Clear completion if user types something else
    if (tr.docChanged && !tr.annotation(Transaction.remote)) {
      return { decorations: Decoration.none, completion: null };
    }

    // Map decorations through document changes
    decorations = decorations.map(tr.changes);

    // Handle effects
    for (const e of tr.effects) {
      if (e.is(addCompletion)) {
        const widget = Decoration.widget({
          widget: new class extends WidgetType {
            constructor(readonly text: string) { super(); }
            toDOM() {
              const span = document.createElement('span');
              span.style.color = '#999';
              span.style.opacity = '0.6';
              span.textContent = e.value.completion;
              return span;
            }
            ignoreEvent() { return false; }
          }(e.value.completion),
          side: 1  // Show after cursor
        });
        return {
          decorations: Decoration.set([widget.range(e.value.from)]),
          completion: e.value.completion
        };
      } else if (e.is(clearCompletions)) {
        return { decorations: Decoration.none, completion: null };
      }
    }

    return { decorations, completion };
  },
  provide: f => EditorView.decorations.from(f, state => state.decorations)
});

// Plugin to handle inline completions
export const inlineCompletionPlugin = ViewPlugin.fromClass(class {
  private lastPos: number = -1;
  private timeoutHandle: number | null = null;

  constructor(readonly view: EditorView) {}

  update(update: ViewUpdate) {
    // Don't proceed if no changes or selection changes
    if (!update.docChanged && !update.selectionSet) {
      return;
    }

    const pos = update.state.selection.main.head;
    // Don't trigger completion if cursor hasn't moved
    if (pos === this.lastPos) return;
    this.lastPos = pos;

    // Clear completions if cursor moves without document changes (clicks, arrow keys, etc)
    if (update.selectionSet && !update.docChanged) {
      // Schedule the clear for next tick
      Promise.resolve().then(() => {
        if (this.view.state.selection.main.head === pos) {
          this.view.dispatch({
            effects: clearCompletions.of(null)
          });
        }
      });
      return;
    }

    // Clear any existing timeout
    if (this.timeoutHandle !== null) {
      window.clearTimeout(this.timeoutHandle);
    }

    // Set new timeout for completion
    this.timeoutHandle = window.setTimeout(async () => {
      // Recheck selection state before completing
      const currentState = this.view.state;
      if (!currentState.selection.main.empty) return;

      const pos = currentState.selection.main.head;
      const line = currentState.doc.lineAt(pos);
      const text = line.text.slice(0, pos - line.from);

      // Don't complete if text is too short
      if (text.trim().length < 3) return;

      // Don't complete if cursor is not at the end of the line
      if (pos - line.from !== line.text.length) return;

      // Don't complete if we're in a header line
      const tree = syntaxTree(currentState);
      let isHeader = false;
      tree.iterate({
        from: line.from,
        to: line.to,
        enter: (node) => {
          if (node.type.name.startsWith('Header')) {
            isHeader = true;
            return false;
          }
        }
      });
      if (isHeader) return;

      try {
        // Get surrounding context (up to 25 lines before and after)
        const startLine = Math.max(1, line.number - 25);
        const endLine = Math.min(currentState.doc.lines, line.number + 25);
        const contextLines: string[] = [];
        
        for (let i = startLine; i <= endLine; i++) {
          if (i === line.number) continue; // Skip current line
          const contextLine = currentState.doc.line(i);
          contextLines.push(contextLine.text);
        }
        
        const documentContext = contextLines.join('\n');
        const completion = await completionService.getInlineCompletion(text, documentContext);
        
        // Schedule the update for next tick and verify state hasn't changed
        Promise.resolve().then(() => {
          const finalState = this.view.state;
          if (finalState.selection.main.head === pos && completion) {
            this.view.dispatch({
              effects: addCompletion.of({ 
                from: pos,
                completion 
              })
            });
          }
        });
      } catch (error) {
        console.error('Error getting inline completion:', error);
      }
    }, DEBOUNCE_MS);
  }

  destroy() {
    if (this.timeoutHandle !== null) {
      window.clearTimeout(this.timeoutHandle);
    }
  }
});         