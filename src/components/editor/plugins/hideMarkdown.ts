import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view"
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
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          if (node.type.name === "ListItem") {
            const line = view.state.doc.lineAt(node.from);
            const indent = Math.floor((line.text.length - line.text.trimStart().length) / 2);
            
            // Find the list marker within this list item
            syntaxTree(view.state).iterate({
              from: line.from,
              to: line.to,
              enter: (innerNode) => {
                if (innerNode.type.name === "ListMark") {
                  const listMarkText = view.state.doc.sliceString(innerNode.from, innerNode.to);
                  const isNumbered = /^\d+\./.test(listMarkText);
                  const number = isNumbered ? parseInt(listMarkText) : null;
                  
                  // Add list style decoration with proper attributes
                  const lineAttrs: Record<string, string> = {
                    'data-list-style': isNumbered ? 'number' : 'bullet',
                    'data-list-level': indent.toString(),
                    'data-list-number': number?.toString() || ''
                  };
                  
                  // Add line decoration with list attributes
                  builder.add(line.from, line.to, Decoration.line({
                    attributes: lineAttrs
                  }));
                  
                  // Hide the list marker
                  builder.add(innerNode.from, innerNode.to + 1, hideMark);
                  
                  // Add list content decoration with proper styling
                  const contentStart = innerNode.to + 1;
                  const contentEnd = line.to;
                  
                  // Create a decoration for the list content that prevents line breaks
                  builder.add(contentStart, contentEnd, Decoration.mark({
                    class: "cm-list-content",
                    tagName: "span",
                    inclusive: true,
                    attributes: {
                      'style': 'display: inline !important; white-space: pre !important; word-break: keep-all !important;'
                    }
                  }));
                  
                  return false;
                }
              }
            });
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