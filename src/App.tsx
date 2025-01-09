import React from 'react';
import Editor from './components/Editor';

function App() {
  return (
    <div className="app">
      <header>
        <h1 style={{ 
          fontSize: '1.125rem', 
          fontWeight: 500,
          color: 'var(--text-light)',
          marginBottom: '2rem'
        }}>
          Lumos
        </h1>
      </header>
      <main>
        <Editor />
      </main>
    </div>
  );
}

export default App; 