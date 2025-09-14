import JSZip from 'jszip';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { sha256File, sha256Buffer } from '../crypto/sha256';

export interface ZipItem {
  path: string;
  sha256: string;
  bytes: number;
  kind: string;
}

export interface ZipResult {
  zipPath: string;
  manifestPath: string;
  sha256: string;
  items: ZipItem[];
}

/**
 * Create a ZIP file from a directory or list of files
 */
export async function makeZip(
  sourceDir: string,
  outputZipPath: string,
  manifestPath?: string
): Promise<ZipResult> {
  const zip = new JSZip();
  const items: ZipItem[] = [];

  // Recursively add files from directory
  function addDirectoryToZip(dirPath: string, zipFolder?: JSZip) {
    const files = readdirSync(dirPath);
    
    for (const file of files) {
      const fullPath = join(dirPath, file);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        const folder = (zipFolder || zip).folder(file);
        if (folder) {
          addDirectoryToZip(fullPath, folder);
        }
      } else {
        const content = readFileSync(fullPath);
        const relativePath = relative(sourceDir, fullPath);
        const normalizedPath = relativePath.replace(/\\/g, '/'); // Use forward slashes
        
        (zipFolder || zip).file(normalizedPath, content);
        
        items.push({
          path: normalizedPath,
          sha256: sha256File(fullPath),
          bytes: stat.size,
          kind: getFileKind(fullPath)
        });
      }
    }
  }

  addDirectoryToZip(sourceDir);

  // Generate ZIP buffer
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  // Write ZIP file
  writeFileSync(outputZipPath, zipBuffer);
  const zipSha256 = sha256Buffer(zipBuffer);

  // Create manifest if requested
  if (manifestPath) {
    const manifest = {
      generatedAt: new Date().toISOString(),
      zipPath: outputZipPath,
      sha256: zipSha256,
      totalItems: items.length,
      items: items
    };
    
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  return {
    zipPath: outputZipPath,
    manifestPath: manifestPath || '',
    sha256: zipSha256,
    items
  };
}

/**
 * Determine file kind based on extension
 */
function getFileKind(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() || '';
  
  switch (ext) {
    case 'pdf': return 'document';
    case 'json': return 'data';
    case 'xml': return 'export';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp': return 'image';
    case 'txt':
    case 'md': return 'text';
    default: return 'file';
  }
}