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
    let timeoutId: number | null = null;

    const initializeEditor = () => {
      if (!editorRef.current || !mounted) return;

      try {
        console.log('Initializing editor...');
        
        // Clear any existing editor
        if (viewRef.current) {
          viewRef.current.destroy();
          viewRef.current = undefined;
        }

        // Set initial content with proper line endings
        const initialContent = '# Heading\n1. First list item\n2. Second list itemm\n3. Third list item';
        console.log('Initial content:', initialContent);
        
        // Create editor state with initial content
        const editorState = EditorState.create({
          doc: initialContent,
          extensions: createEditorConfig(editorRef)
        });
        
        // Create and mount editor view
        const editorView = new EditorView({
          state: editorState,
          parent: editorRef.current
        });
        
        // Store view reference and force initial update
        viewRef.current = editorView;
        requestAnimationFrame(() => {
          if (mounted && viewRef.current) {
            viewRef.current.dispatch({});
          }
        });
      } catch (error) {
        console.error('Error initializing editor:', error);
      }
    };

    initializeEditor();

    return () => {
      mounted = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = undefined;
      }
    };
  }, []);

  return <div ref={editorRef} className="editor" style={{ width: '100%' }} />;
};

export default Editor;                                                                                                                     