import { promises as fs } from 'fs';
import path from 'path';
import { SearchOptions, SearchResult } from './types.js';

async function isTextFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return false;

    // Simple text file extension check
    const textExtensions = [
      '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.html', 
      '.css', '.scss', '.less', '.py', '.java', '.c', '.cpp', '.h', 
      '.hpp', '.rs', '.go', '.rb', '.php', '.xml', '.yaml', '.yml'
    ];
    return textExtensions.includes(path.extname(filePath).toLowerCase());
  } catch {
    return false;
  }
}

async function* walkDirectory(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and .git directories
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      yield* walkDirectory(fullPath);
    } else if (await isTextFile(fullPath)) {
      yield fullPath;
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
