import React from 'react';

interface ApiKeyInputProps {
  onSubmit: (apiKey: string) => void;
}

const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ onSubmit }) => {
  const [apiKey, setApiKey] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(apiKey);
  };

  return (
    <div className="api-key-container">
      <h1>Welcome to Lumos</h1>
      <p>Please enter your OpenAI API key to continue</p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          required
          pattern="^sk-[a-zA-Z0-9]+$"
          title="Please enter a valid OpenAI API key starting with 'sk-'"
        />
        <button type="submit">Start Writing</button>
      </form>
    </div>
  );
};

export default ApiKeyInput; 