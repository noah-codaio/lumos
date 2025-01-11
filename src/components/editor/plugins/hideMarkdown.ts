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

  buildDecorations(view: EditorView) {
    const decorations: DecorationRange[] = []
    const currentLine = view.state.doc.lineAt(view.state.selection.main.head)
    
    // Process each visible line
    for (const { from, to } of view.visibleRanges) {
      // Collect all nodes first
      const nodes: { node: { from: number, to: number, type: { name: string } }, line: { from: number, text: string, number: number } }[] = []
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          const line = view.state.doc.lineAt(node.from)
          nodes.push({ node, line })
        }
      })

      // Process nodes to collect decorations
      for (const { node, line } of nodes) {
        if (node.type.name === "ListItem") {
          // Find the ListMark within this ListItem
          let listMarkText = ""
          let listLevel = 0
          let listType: 'bullet' | 'number' = 'bullet'
          
          for (const { node: innerNode } of nodes) {
            if (innerNode.type.name === "ListMark" && 
                view.state.doc.lineAt(innerNode.from).number === line.number) {
              listMarkText = view.state.doc.sliceString(innerNode.from, innerNode.to)
              const indent = line.text.slice(0, innerNode.from - line.from).length
              listLevel = Math.floor(indent / 2)
              listType = /^\d+\./.test(listMarkText) ? 'number' : 'bullet'
              break
            }
          }
          
          if (listMarkText) {
            decorations.push({
              from: line.from,
              to: line.from + 1,
              decoration: createListLineDecoration(listLevel, listType)
            })
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
            })
          }
        }
      }
    }

    // Sort decorations by from position and startSide
    decorations.sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from
      // Line decorations should come before mark decorations at the same position
      const aIsLine = a.decoration.spec.type === "line"
      const bIsLine = b.decoration.spec.type === "line"
      if (aIsLine !== bIsLine) return aIsLine ? -1 : 1
      return 0
    })

    // Add sorted decorations to builder
    const builder = new RangeSetBuilder<Decoration>()
    for (const { from, to, decoration } of decorations) {
      builder.add(from, to, decoration)
    }

    return builder.finish()
  }
}, {
  decorations: v => v.decorations
})      