import React, { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { createEditorConfig } from './editor/config/editorConfig';

/**
 * A markdown editor component with AI-powered completions and rewrites
 */
const Editor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const completionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Create editor state with test content
    const initialContent = `# Heading
1. First list item
2. Second list itemm
3. Third list item

The list above should show properly with suggestions.`;

    // Clean up existing view
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    // Create new editor state with proper list handling
    const editorState = EditorState.create({
      doc: initialContent,
      extensions: [
        ...createEditorConfig(editorRef),
        EditorView.lineWrapping
      ]
    });
    
    // Create and mount editor view
    const view = new EditorView({
      state: editorState,
      parent: editorRef.current
    });
    
    // Store view reference
    viewRef.current = view;

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
      }
    };
  }, []);

  return <div ref={editorRef} className="editor" style={{ width: '100%' }} />;
};

export default Editor;                                                                                                                                                               