# Lumos - AI-Powered Text Editor

A modern, AI-powered text editor built with React and CodeMirror that provides intelligent text completions and rewrites.

## Features

- **Inline Completions**: Get real-time suggestions as you type
- **Smart Rewrites**: Select text to get three different versions:
  - Concise (press 'c'): A shorter, more direct version
  - Elaborate (press 'e'): A more detailed version
  - Simple (press 's'): A version using simpler language
- **Modern UI**: Clean, minimalist interface with beautiful typography
- **Markdown Support**: Full markdown editing capabilities

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
│   │   └── plugins/
│   │       ├── inlineCompletion.ts  # Inline completion plugin
│   │       └── rewriteCompletion.ts # Text rewrite plugin
│   └── Editor.tsx               # Main editor component
├── services/
│   └── CompletionService.ts     # OpenAI API integration
├── types/
│   └── completion.ts            # TypeScript type definitions
├── styles.css                   # Global styles
├── App.tsx                      # Root application component
└── main.tsx                     # Application entry point
```

## Technical Details

- Built with React and TypeScript
- Uses CodeMirror 6 for the editor implementation
- Integrates with OpenAI's GPT-3.5 for AI features
- Implements efficient caching and debouncing
- Follows modern React best practices with hooks

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
2. Select text to see rewrite options
3. Use keyboard shortcuts:
   - Tab: Accept inline completion
   - c: Apply concise rewrite
   - e: Apply elaborate rewrite
   - s: Apply simple rewrite

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this project for any purpose. 