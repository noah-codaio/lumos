import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, PluginValue } from "@codemirror/view"
import { RangeSetBuilder } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"

// Create a decoration to hide markdown syntax
const hideMark = Decoration.mark({
  class: "cm-markdown-hidden"
})

// Create a decoration for list lines
const createListLineDecoration = (level: number, style: 'bullet' | 'number', number?: string) => {
  return Decoration.line({
    attributes: {
      'data-list-level': level.toString(),
      'data-list-style': style,
      'data-list-number': number || '',
      'data-list-marker-hidden': 'true',
      'data-preserve-whitespace': 'true'
    },
    class: 'cm-list-line'
  });
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

  buildDecorations(view: EditorView) {
    const decorations: DecorationRange[] = [];
    const currentLine = view.state.doc.lineAt(view.state.selection.main.head);
    
    // Process each visible line
    for (const { from, to } of view.visibleRanges) {
      // Collect all nodes first
      const nodes: { node: { from: number, to: number, type: { name: string } }, line: { from: number, text: string, number: number } }[] = [];
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          const line = view.state.doc.lineAt(node.from);
          nodes.push({ node, line });
        }
      });

      // Process nodes to collect decorations
      for (const { node, line } of nodes) {
        if (node.type.name === "ListItem") {
          // Find the ListMark within this ListItem
          let listMarkText = "";
          let listLevel = 0;
          let listType: 'bullet' | 'number' = 'bullet';
          
          for (const { node: innerNode } of nodes) {
            if (innerNode.type.name === "ListMark" && 
                view.state.doc.lineAt(innerNode.from).number === line.number) {
              listMarkText = view.state.doc.sliceString(innerNode.from, innerNode.to);
              const indent = line.text.slice(0, innerNode.from - line.from).length;
              listLevel = Math.floor(indent / 2);
              listType = /^\d+\./.test(listMarkText) ? 'number' : 'bullet';
              break;
            }
          }
          
          if (listMarkText) {
            const listNumber = listType === 'number' ? listMarkText.replace(/\.$/, '') : '';
            
            // Find and completely remove list markers
            const currentLineNumber = line.number;
            
            // Find all list-related nodes in this line
            const listNodes = nodes.filter(({ node: n, line: l }) => 
              l.number === currentLineNumber &&
              (n.type.name === "ListMark" || n.type.name === "OrderedList" || n.type.name === "BulletList")
            );
            
            // Sort nodes by position to handle them in order
            listNodes.sort((a, b) => a.node.from - b.node.from);
            
            // Replace each list-related node with empty content
            for (const { node: n } of listNodes) {
              // Calculate any trailing whitespace after the marker
              const nodeText = view.state.doc.sliceString(n.from, n.to);
              const afterNode = view.state.doc.sliceString(n.to, Math.min(n.to + 2, view.state.doc.length));
              const spaceMatch = afterNode.match(/^\s*/);
              const trailingSpace = spaceMatch ? spaceMatch[0].length : 0;
              
              decorations.push({
                from: n.from,
                to: n.to + trailingSpace,
                decoration: Decoration.replace({})
              });
            }
            
            // Add the line decoration for styling with proper list marker
            const lineEnd = view.state.doc.line(line.number).to;
            decorations.push({
              from: line.from,
              to: lineEnd,
              decoration: createListLineDecoration(listLevel, listType, listNumber)
            });
          }
        }
        
        // Add mark decorations for syntax hiding
        if (line.number !== currentLine.number) {
          if (
            node.type.name === "HeaderMark" || // #, ##, etc.
            node.type.name === "QuoteMark" || // >
            node.type.name === "ListMark" || // -, *, 1.
            node.type.name === "EmphasisMark" || // *, _
            node.type.name === "StrongMark" || // **, __
            node.type.name === "LinkMark" || // [], ()
            node.type.name === "CodeMark" // `
          ) {
            decorations.push({
              from: node.from,
              to: node.to,
              decoration: hideMark
            });
          }
        }
      }
    }

    // Sort decorations by from position and startSide
    decorations.sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from;
      // Line decorations should come before mark decorations at the same position
      const aIsLine = a.decoration.spec.type === "line";
      const bIsLine = b.decoration.spec.type === "line";
      if (aIsLine !== bIsLine) return aIsLine ? -1 : 1;
      return 0;
    });

    // Add sorted decorations to builder
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to, decoration } of decorations) {
      builder.add(from, to, decoration);
    }

    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});                                                                                                                                                                                                                                                                                                                        