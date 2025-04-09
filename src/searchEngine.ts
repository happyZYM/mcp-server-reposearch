import { promises as fs } from 'fs';
import path from 'path';
import createIgnore from 'ignore';
import { SearchOptions, SearchResult, SearchSummary } from './types.js';

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

  shouldIncludeFile(filePath: string, rootDir: string, isDirectory: boolean = false): boolean {
    // Always use path relative to the root directory
    let relativePath = path.relative(rootDir, filePath);
    
    // For directories, ensure path ends with '/' as per ignore rules
    if (isDirectory) {
      relativePath = relativePath.endsWith('/') ? relativePath : relativePath + '/';
    }
    
    return !this.ignoreInstance.ignores(relativePath);
  }
}

const fileFilter = new FileFilter();

async function* walkDirectory(currentDir: string, rootDir: string): AsyncGenerator<string> {
  // Initialize with root directory
  await fileFilter.initialize(rootDir);
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    
    if (entry.isDirectory()) {
      // Check if directory should be included, passing isDirectory flag
      if (fileFilter.shouldIncludeFile(fullPath, rootDir, true)) {
        yield* walkDirectory(fullPath, rootDir);
      }
    } else if (fileFilter.shouldIncludeFile(fullPath, rootDir, false)) {
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

// Calculate the byte size of a search result
function calculateResultSize(result: SearchResult): number {
  // Calculate JSON string size in bytes
  return Buffer.from(JSON.stringify(result)).length;
}

export async function searchFiles(
  directory: string,
  options: SearchOptions
): Promise<{ results: SearchResult[], summary: SearchSummary }> {
  const results: SearchResult[] = [];
  const regex = createSearchRegex(options);
  let totalBytes = 0;
  let matchCount = 0;
  const maxOutputBytes = options.maxOutputBytes ?? 4096; // Default to 4096 bytes
  const hasLimit = maxOutputBytes >= 0; // -1 means no limit
  
  try {
    for await (const filePath of walkDirectory(directory, directory)) {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        let match: RegExpExecArray | null;
        
        regex.lastIndex = 0; // Reset regex state
        while ((match = regex.exec(line)) !== null) {
          matchCount++;
          
          const result: SearchResult = {
            file: path.relative(directory, filePath),
            line: lineNum + 1,
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          };
          
          if (options.includeContent !== false) {
            result.content = line.trim();
          }
          
          const resultSize = calculateResultSize(result);
          totalBytes += resultSize;
          
          // Only add to results if we're under the limit or if there's no limit
          if (!hasLimit || maxOutputBytes === -1 || totalBytes <= maxOutputBytes) {
            results.push(result);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error during file search:', error);
    throw error;
  }
  
  const summary: SearchSummary = {
    matchCount,
    totalBytes,
    limitExceeded: hasLimit && maxOutputBytes !== -1 && totalBytes > maxOutputBytes
  };
  
  // If limit exceeded, clear results to save bandwidth
  if (summary.limitExceeded) {
    return { results: [], summary };
  }
  
  return { results, summary };
}
