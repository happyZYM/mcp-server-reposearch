import { promises as fs } from 'fs';
import path from 'path';
import createIgnore from 'ignore';
import { SearchOptions, SearchResult } from './types.js';

class FileFilter {
  private ignoreInstance = createIgnore();
  private initialized = false;

  async initialize(baseDir: string) {
    if (this.initialized) return;

    try {
      // Try to read .reposearchignore file
      const ignoreFilePath = path.join(baseDir, '.reposearchignore');
      const ignoreContent = await fs.readFile(ignoreFilePath, 'utf-8');
      this.ignoreInstance.add(ignoreContent);
    } catch (error) {
      // If .reposearchignore doesn't exist, use default patterns
      const defaultPatterns = [
        'node_modules/',
        '.git/',
        'build/',
        'dist/',
        // Add basic binary file patterns
        '*.exe', '*.dll', '*.so', '*.dylib',
        '*.jpg', '*.jpeg', '*.png', '*.gif',
        '*.mp3', '*.mp4', '*.zip', '*.tar.gz',
        // Allow common text files
        '!*.txt', '!*.md', '!*.js', '!*.ts',
        '!*.jsx', '!*.tsx', '!*.json', '!*.html',
        '!*.css', '!*.scss', '!*.less', '!*.py',
        '!*.java', '!*.c', '!*.cpp', '!*.h',
        '!*.hpp', '!*.rs', '!*.go', '!*.rb',
        '!*.php', '!*.xml', '!*.yaml', '!*.yml'
      ];
      this.ignoreInstance.add(defaultPatterns);
    }

    this.initialized = true;
  }

  shouldIncludeFile(filePath: string, baseDir: string): boolean {
    const relativePath = path.relative(baseDir, filePath);
    return !this.ignoreInstance.ignores(relativePath);
  }
}

const fileFilter = new FileFilter();

async function* walkDirectory(dir: string): AsyncGenerator<string> {
  await fileFilter.initialize(dir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Check if directory should be included
      if (fileFilter.shouldIncludeFile(fullPath, dir)) {
        yield* walkDirectory(fullPath);
      }
    } else if (fileFilter.shouldIncludeFile(fullPath, dir)) {
      try {
        // Basic binary file check
        const buffer = await fs.readFile(fullPath, { encoding: 'utf8', flag: 'r' });
        // Check for null bytes which typically indicate binary content
        if (!buffer.includes('\0')) {
          yield fullPath;
        }
      } catch {
        // If we can't read the file or it's binary, skip it
        continue;
      }
    }
  }
}

function createSearchRegex(options: SearchOptions): RegExp {
  let { query, isRegex, caseSensitive, wholeWord } = options;
  
  if (!isRegex) {
    // Escape special regex characters for literal search
    query = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  if (wholeWord) {
    query = `\\b${query}\\b`;
  }
  
  return new RegExp(query, caseSensitive ? 'g' : 'gi');
}

export async function searchFiles(
  directory: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const regex = createSearchRegex(options);
  
  try {
    for await (const filePath of walkDirectory(directory)) {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        let match: RegExpExecArray | null;
        
        regex.lastIndex = 0; // Reset regex state
        while ((match = regex.exec(line)) !== null) {
          results.push({
            file: path.relative(directory, filePath),
            line: lineNum + 1,
            content: line.trim(),
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error during file search:', error);
    throw error;
  }
  
  return results;
}
