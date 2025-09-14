import * as fs from 'fs/promises';
import * as path from 'path';
import JSZip from 'jszip';

interface ZipEntry {
  filename: string;
  filePath: string;
}

export async function makeZip(entries: ZipEntry[], outputPath: string): Promise<void> {
  const zip = new JSZip();

  // Add each file to the zip
  for (const entry of entries) {
    try {
      const fileContent = await fs.readFile(entry.filePath);
      zip.file(entry.filename, fileContent);
    } catch (error) {
      console.warn(`Failed to add file ${entry.filePath} to zip:`, error);
    }
  }

  // Generate zip buffer
  const zipBuffer = await zip.generateAsync({ 
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  // Write zip file
  await fs.writeFile(outputPath, zipBuffer);
}

export async function makeZipFromDirectory(sourceDir: string, outputPath: string, excludePatterns: string[] = []): Promise<void> {
  const zip = new JSZip();

  async function addDirectoryToZip(dirPath: string, zipPath: string = '') {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      const itemZipPath = zipPath ? `${zipPath}/${item.name}` : item.name;

      // Check if item should be excluded
      const shouldExclude = excludePatterns.some(pattern => 
        itemPath.includes(pattern) || item.name.includes(pattern)
      );
      if (shouldExclude) continue;

      if (item.isDirectory()) {
        await addDirectoryToZip(itemPath, itemZipPath);
      } else {
        try {
          const fileContent = await fs.readFile(itemPath);
          zip.file(itemZipPath, fileContent);
        } catch (error) {
          console.warn(`Failed to add file ${itemPath} to zip:`, error);
        }
      }
    }
  }

  await addDirectoryToZip(sourceDir);

  // Generate and write zip
  const zipBuffer = await zip.generateAsync({ 
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  await fs.writeFile(outputPath, zipBuffer);
}