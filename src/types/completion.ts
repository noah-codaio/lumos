/**
 * Represents a rewrite suggestion
 */
export interface RewriteSuggestion {
  /** The key for the suggestion (e.g., 'a', 'b', 'custom') */
  key: string;
  /** The label to show in the UI */
  label: string;
  /** Description of what this rewrite will do */
  description: string;
  /** Optional preview text */
  preview?: string;
}

/**
 * Represents different versions of rewritten text
 */
export interface Rewrites {
  /** A shorter, more direct version of the text */
  concise: string;
  /** A more detailed version with additional context */
  elaborate: string;
  /** A version using simpler language */
  simple: string;
}

/**
 * Represents a cached entry for rewrites with timestamp
 */
export interface CacheEntry {
  /** The cached rewrites */
  rewrites: Rewrites;
  /** Timestamp when the cache entry was created */
  timestamp: number;
}

/**
 * Represents an inline completion with timestamp
 */
export interface InlineCompletion {
  /** The suggested completion text */
  completion: string;
  /** Timestamp when the completion was generated */
  timestamp: number;
}

/**
 * Represents a text suggestion (spelling, grammar, etc.)
 */
export interface TextSuggestion {
  /** The start position of the suggestion */
  from: number;
  /** The end position of the suggestion */
  to: number;
  /** The type of suggestion (e.g., 'spelling', 'grammar', 'style') */
  type: 'spelling' | 'grammar' | 'style';
  /** The suggested correction */
  replacement: string;
  /** Description of why this suggestion is being made */
  description: string;
  /** Original text that was flagged */
  original: string;
}

/**
 * Represents a cached entry for text suggestions with timestamp
 */
export interface SuggestionCacheEntry {
  /** The cached suggestions */
  suggestions: TextSuggestion[];
  /** Timestamp when the cache entry was created */
  timestamp: number;
} 