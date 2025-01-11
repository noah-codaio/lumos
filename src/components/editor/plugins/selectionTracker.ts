import { ViewPlugin, ViewUpdate } from '@codemirror/view';
import { setCustomRewrite } from '../state/customRewrite';

export const selectionTrackerPlugin = ViewPlugin.fromClass(class {
  private lastSelection = { from: -1, to: -1 };

  update(update: ViewUpdate) {
    if (update.selectionSet || update.docChanged) {
      const selection = update.state.selection.main;
      const view = update.view;
      
      // Clear buffer if selection changes or becomes empty
      if (selection.empty || 
          selection.from !== this.lastSelection.from || 
          selection.to !== this.lastSelection.to) {
        // Schedule the update for next tick
        Promise.resolve().then(() => {
          // Make sure the selection hasn't changed again
          if (view.state.selection.main.from === selection.from &&
              view.state.selection.main.to === selection.to) {
            view.dispatch({
              effects: setCustomRewrite.of('')
            });
          }
        });
      }
      
      this.lastSelection = { from: selection.from, to: selection.to };
    }
  }
});   