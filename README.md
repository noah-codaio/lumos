# Lumos - AI-Powered Text Editor

A modern, AI-powered text editor built with React and CodeMirror that provides intelligent text completions, suggestions, and rewrites.

## Features

- **Inline Completions**: Get real-time suggestions as you type
- **Smart Rewrites**: Select text and type any letter to get a custom rewrite
  - Use uppercase letters (e.g. 'C', 'E', 'S') to apply the rewrite
  - Use lowercase letters to preview different rewrite options
- **Text Suggestions**: Get contextual suggestions for improving your writing
- **Clean Writing Experience**: Markdown syntax is automatically hidden while writing
- **Modern UI**: Clean, minimalist interface with beautiful typography and smooth interactions
- **Markdown Support**: Full markdown editing capabilities with live preview styling

## Project Structure

```
src/
├── components/
│   ├── editor/
│   │   ├── commands/
│   │   │   ├── completion.ts    # Completion command handlers
│   │   │   └── shortcuts.ts     # Keyboard shortcut definitions
│   │   ├── config/
│   │   │   └── editorConfig.ts  # Editor configuration
│   │   ├── plugins/
│   │   │   ├── inlineCompletion.ts  # Inline completion plugin
│   │   │   ├── rewriteCompletion.ts # Text rewrite plugin
│   │   │   ├── textSuggestions.ts   # Writing suggestions plugin
│   │   │   ├── hideMarkdown.ts      # Markdown syntax hiding
│   │   │   └── selectionTracker.ts  # Selection state management
│   │   └── state/
│   │       └── customRewrite.ts      # Custom rewrite state
│   ├── Editor.tsx               # Main editor component
│   └── ApiKeyInput.tsx         # API key input component
├── services/
│   └── CompletionService.ts     # OpenAI API integration
├── types/
│   └── completion.ts            # TypeScript type definitions
├── styles.css                   # Global styles
└── App.tsx                      # Root application component
```

## Technical Details

- Built with React 18 and TypeScript
- Uses CodeMirror 6 for the editor implementation
- Integrates with OpenAI's GPT models for AI features
- Implements efficient caching and debouncing for API calls
- Features a modern component architecture with React hooks
- Uses CSS variables for theming and consistent styling

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your OpenAI API key:
   ```
   VITE_OPENAI_API_KEY=your_api_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

1. Start typing to get inline completions
2. Press Tab to accept inline completions
3. Select text and type any letter to get custom rewrites:
   - Type lowercase letters to preview different rewrites
   - Type uppercase letters to apply the rewrite
4. Look for suggestion tooltips that appear to improve your writing
5. Enjoy distraction-free writing with hidden markdown syntax

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this project for any purpose. 