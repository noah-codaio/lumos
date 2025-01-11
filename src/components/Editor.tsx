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
    let mounted = true;

    if (!editorRef.current) return;

    // Create editor state
    const editorState = EditorState.create({
      doc: '',
      extensions: createEditorConfig(editorRef)
    });
    
    // Create and mount editor view
    const editorView = new EditorView({
      state: editorState,
      parent: editorRef.current
    });
    
    // Store view reference
    viewRef.current = editorView;

    return () => {
      mounted = false;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = undefined;
      }
    };
  }, []);

  return <div ref={editorRef} className="editor" style={{ width: '100%' }} />;
};

export default Editor;                                                                                                                           