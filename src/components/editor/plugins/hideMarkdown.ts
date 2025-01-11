import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from "@codemirror/view"
import { RangeSetBuilder } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"

// Create a decoration to hide markdown syntax
const hideMark = Decoration.mark({
  class: "cm-markdown-hidden"
})

// Create a decoration for list lines
const createListLineDecoration = (level: number, style: 'bullet' | 'number') => {
  return Decoration.line({
    attributes: {
      'data-list-level': level.toString(),
      'data-list-style': style
    }
  })
}

interface DecorationRange {
  from: number
  to: number
  decoration: Decoration
}

export const hideMarkdownPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  currentLine: number = -1

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view)
    this.currentLine = view.state.doc.lineAt(view.state.selection.main.head).number
  }

  update(update: ViewUpdate) {
    const newLine = update.state.doc.lineAt(update.state.selection.main.head).number
    if (update.docChanged || update.viewportChanged || newLine !== this.currentLine) {
      this.currentLine = newLine
      this.decorations = this.buildDecorations(update.view)
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const currentLine = view.state.doc.lineAt(view.state.selection.main.head);
    
    // Process each visible line
    for (const { from, to } of view.visibleRanges) {
      let lineStart = view.state.doc.lineAt(from).from;
      let currentListLevel = 0;
      
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          const line = view.state.doc.lineAt(node.from);
          if (line.number === currentLine.number) return;
          
          // Reset list level when moving to a new line
          if (line.from !== lineStart) {
            currentListLevel = 0;
            lineStart = line.from;
          }
          
          if (node.type.name === "ListItem") {
            currentListLevel++;
          }
          
          if (node.type.name === "ListMark") {
            const listMarkText = view.state.doc.sliceString(node.from, node.to);
            const isNumbered = /^\d+\./.test(listMarkText);
            
            // Add list style decoration to the line
            builder.add(line.from, line.from + 1, createListLineDecoration(
              currentListLevel,
              isNumbered ? 'number' : 'bullet'
            ));
            
            // Hide the original list marker
            builder.add(node.from, node.to, hideMark);
          } else if (
            node.type.name === "HeaderMark" || // #, ##, etc.
            node.type.name === "QuoteMark" || // >
            node.type.name === "EmphasisMark" || // *, _
            node.type.name === "StrongMark" || // **, __
            node.type.name === "LinkMark" || // [], ()
            node.type.name === "CodeMark" // `
          ) {
            builder.add(node.from, node.to, hideMark);
          }
        }
      });
    }
    
    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});                                                                                                                                                                                                                                                                                                                                                                                                                  