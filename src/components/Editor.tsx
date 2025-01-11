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

    const startState = EditorState.create({
      doc: '',
      extensions: createEditorConfig(editorRef)
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current
    });
    
    viewRef.current = view;

    return () => view.destroy();
  }, []);

  return <div ref={editorRef} className="editor" style={{ width: '100%' }} />;
};

export default Editor;   