import OpenAI from 'openai';
import { Rewrites, CacheEntry, InlineCompletion, TextSuggestion, SuggestionCacheEntry } from '../types/completion';

/**
 * Service for handling text completions and rewrites using OpenAI's API
 */
export interface RewriteSuggestion {
  key: string;
  label: string;
  description: string;
}

export interface DynamicRewrite {
  type: string;
  content: string;
}

export class CompletionService {
  private openai: OpenAI;
  private readonly cache: Map<string, CacheEntry>;
  private readonly inlineCache: Map<string, InlineCompletion>;
  private readonly suggestionCache: Map<string, SuggestionCacheEntry>;
  private readonly CACHE_TTL = 1000 * 60 * 5; // 5 minutes

  constructor(apiKey?: string) {
    this.openai = new OpenAI({
      apiKey: apiKey || '',
      dangerouslyAllowBrowser: true
    });
    this.cache = new Map();
    this.inlineCache = new Map();
    this.suggestionCache = new Map();
  }

  updateApiKey(apiKey: string) {
    this.openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });
  }

  /**
   * Trims text to the last complete sentence
   * @param text - The text to trim
   * @returns The text trimmed to the last complete sentence
   */
  private trimToLastCompleteSentence(text: string): string {
    const sentenceEndings = ['.', '!', '?'];
    const lastIndex = Math.max(
      ...sentenceEndings.map(punct => text.lastIndexOf(punct))
    );
    return lastIndex >= 0 ? text.slice(0, lastIndex + 1) : '';
  }

  /**
   * Gets suggested rewrite types based on the selected text
   * @param text - The text to analyze
   * @returns Promise resolving to an array of rewrite suggestions
   */
  async getRewriteSuggestions(text: string): Promise<RewriteSuggestion[]> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system",
          content: "You are a writing assistant. Analyze the given text and suggest 3-5 ways it could be structurally or stylistically modified. Focus on editing operations rather than content changes. For each suggestion:\n\n1. The key MUST be a SINGLE letter that matches the first letter of the main action word (e.g., 'e' for 'expand', 'c' for 'condense', 's' for 'strengthen')\n2. The label should be 2-3 words starting with the action word\n3. Include a brief description\n\nFormat as JSON with a 'suggestions' array containing objects with keys: key, label, description.\nExample: {\"suggestions\": [\n  {\"key\": \"e\", \"label\": \"Expand Detail\", \"description\": \"Add more supporting information and examples\"},\n  {\"key\": \"c\", \"label\": \"Condense Text\", \"description\": \"Remove redundancy and make more concise\"},\n  {\"key\": \"s\", \"label\": \"Strengthen Arguments\", \"description\": \"Enhance logical flow and supporting evidence\"},\n  {\"key\": \"r\", \"label\": \"Restructure Flow\", \"description\": \"Reorganize for better progression of ideas\"}\n]}"
        }, {
          role: "user",
          content: text
        }],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.7
      });
      
      const response = JSON.parse(completion.choices[0]?.message?.content || '{"suggestions": []}');
      return Array.isArray(response.suggestions) ? response.suggestions : [];
    } catch (error) {
      console.error('OpenAI API error:', error);
      return [];
    }
  }

  /**
   * Gets a rewrite of the input text based on the specified type
   * @param text - The text to rewrite
   * @param type - The type of rewrite to perform
   * @returns Promise resolving to the rewritten text
   */
  async getRewrite(text: string, type: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system", 
          content: "You are a writing assistant. Your ONLY task is to rewrite the given text according to the specified type. You must ONLY output the rewritten text - no explanations, no additional content, no quotes, no prefixes, no suffixes. Just the rewritten text."
        }, {
          role: "user",
          content: `Rewrite type: ${type}\nText: ${text}`
        }],
        max_tokens: 500,
        temperature: 0.7
      });
      
      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenAI API error:', error);
      return '';
    }
  }

  /**
   * Gets different versions of the input text based on dynamic suggestions
   * @param text - The text to rewrite
   * @returns Promise resolving to different versions of the text
   * @deprecated Use getRewriteSuggestions and getRewrite instead
   */
  async getRewrites(text: string): Promise<Rewrites> {
    // Check cache first
    const cached = this.cache.get(text);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.rewrites;
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system",
          content: "You are a writing assistant. Provide three versions of the input text: 1) A concise version that's shorter and more direct 2) An elaborate version with more detail 3) A simple version using simpler language. Format the response as JSON with keys: concise, elaborate, simple."
        }, {
          role: "user",
          content: text
        }],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.7
      });
      
      const result = JSON.parse(completion.choices[0]?.message?.content || '{}') as Rewrites;
      
      // Cache the result
      this.cache.set(text, {
        rewrites: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.error('OpenAI API error:', error);
      return {
        concise: '',
        elaborate: '',
        simple: ''
      };
    }
  }

  /**
   * Gets an inline completion suggestion for the given text
   * @param text - The text to complete
   * @returns Promise resolving to the completion suggestion
   */
  async getInlineCompletion(text: string, documentContext: string = ''): Promise<string> {
    // Only provide suggestions at the end of a line
    const currentLine = text.split('\n').pop() || '';
    const cursorPosition = currentLine.length;
    const remainingLineContent = documentContext.split('\n').find(line => line.startsWith(currentLine))?.slice(cursorPosition) || '';
    
    // If there's non-whitespace content after our cursor position, we're in the middle of a line
    if (remainingLineContent.trim().length > 0) {
      return '';
    }

    // Check cache first
    const cached = this.inlineCache.get(text);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.completion;
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system" as const,
          content: "You are continuing to write the user's text. Your task is to:\n1) Analyze both the full document context and immediate line context\n2) Continue writing in the exact same style, tone, and technical level\n3) Never repeat what's already written\n4) Only output the next immediate words that naturally follow\n5) Complete your last sentence - never leave thoughts incomplete\n6) Maintain consistent terminology with the document\n7) If code is detected, maintain consistent syntax and style\n8) Do not add a space at the start of your response"
        },
        ...(documentContext ? [{
          role: "user" as const,
          content: `Document context:\n${documentContext}\n\nCurrent line to complete:\n${text}`
        }] : [{
          role: "user" as const,
          content: text
        }])],
        max_tokens: 50,
        temperature: 0.4,
        presence_penalty: 0.6,
        frequency_penalty: 0.6
      });
      
      const result = completion.choices[0]?.message?.content || '';
      
      // Only add a space if the text doesn't end with a space and the completion doesn't start with a space
      const needsSpace = !text.endsWith(' ') && !result.startsWith(' ');
      const completionWithSpace = needsSpace ? ' ' + result : result;
      
      // Cache the result
      this.inlineCache.set(text, {
        completion: completionWithSpace,
        timestamp: Date.now()
      });

      return completionWithSpace;
    } catch (error) {
      console.error('OpenAI API error:', error);
      return '';
    }
  }

  /**
   * Gets text suggestions for spelling, grammar, and style improvements
   * @param text - The text to analyze
   * @returns Promise resolving to an array of text suggestions
   */
  async getTextSuggestions(text: string): Promise<TextSuggestion[]> {
    // Check cache first
    const cached = this.suggestionCache.get(text);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.suggestions;
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system",
          content: `You are a writing assistant. Analyze the given text for spelling, grammar, and style improvements. For each issue found, provide:
1) The exact text that needs correction (must be an exact substring match)
2) The type of issue (spelling, grammar, or style)
3) A suggested correction
4) A brief explanation of why the change is suggested

Format as JSON with an array of objects containing: text, type, replacement, description.
Example: {"suggestions": [
  {"text": "there", "type": "spelling", "replacement": "their", "description": "'there' should be 'their' when indicating possession"},
  {"text": "is completed", "type": "grammar", "replacement": "has been completed", "description": "Use present perfect tense for completed actions"}
]}`
        }, {
          role: "user",
          content: text
        }],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.3
      });
      
      const response = JSON.parse(completion.choices[0]?.message?.content || '{"suggestions": []}');
      const rawSuggestions = Array.isArray(response.suggestions) ? response.suggestions : [];
      
      // Convert the suggestions to include proper position information
      const suggestions: TextSuggestion[] = [];
      for (const suggestion of rawSuggestions) {
        const index = text.indexOf(suggestion.text);
        if (index !== -1) {
          suggestions.push({
            from: index,
            to: index + suggestion.text.length,
            type: suggestion.type as 'spelling' | 'grammar' | 'style',
            replacement: suggestion.replacement,
            description: suggestion.description,
            original: suggestion.text
          });
        }
      }
      
      // Cache the result
      this.suggestionCache.set(text, {
        suggestions,
        timestamp: Date.now()
      });

      return suggestions;
    } catch (error) {
      console.error('OpenAI API error:', error);
      return [];
    }
  }
}

export const completionService = new CompletionService(); 