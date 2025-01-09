import React, { useState } from 'react';
import Editor from './components/Editor';
import ApiKeyInput from './components/ApiKeyInput';
import { completionService } from './services/CompletionService';

const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState(false);

  const handleApiKeySubmit = (apiKey: string) => {
    completionService.updateApiKey(apiKey);
    setHasApiKey(true);
  };

  return (
    <div className="app">
      {!hasApiKey ? (
        <ApiKeyInput onSubmit={handleApiKeySubmit} />
      ) : (
        <Editor />
      )}
    </div>
  );
};

export default App; 