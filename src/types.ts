export interface SearchOptions {
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  includeContent?: boolean;
}

export interface SearchResult {
  file: string;
  line: number;
  content?: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchToolArgs {
  directory: string;
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  includeContent?: boolean;
}
