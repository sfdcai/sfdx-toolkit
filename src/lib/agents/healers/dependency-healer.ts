import fs from 'fs';
import path from 'path';
import { stageDeltaFiles, resolveSourcePathsForComponent } from '../../deploy';

export async function healDependency(
  type: string,
  fullName: string,
  sourceDir: string,
  deployDir: string
): Promise<{ success: boolean; filesModified: string[]; detail?: string }> {
  try {
    const relPaths = resolveSourcePathsForComponent(type, fullName);
    if (!relPaths.length) {
      return { success: false, filesModified: [], detail: `Could not resolve source paths for component ${type}:${fullName}` };
    }

    const stageResult = stageDeltaFiles(sourceDir, deployDir, relPaths);
    
    const copiedPaths: string[] = [];
    relPaths.forEach(relPath => {
      const stdPath = path.join(deployDir, 'force-app', 'main', 'default', relPath);
      const directPath = path.join(deployDir, relPath);
      if (fs.existsSync(stdPath) || fs.existsSync(directPath)) {
        copiedPaths.push(relPath);
      }
    });

    if (stageResult.copied > 0) {
      return { success: true, filesModified: copiedPaths };
    } else {
      return { success: false, filesModified: [], detail: `Failed to copy files from source. Copied 0 files.` };
    }
  } catch (err: any) {
    return { success: false, filesModified: [], detail: `Error in dependency healer: ${err.message}` };
  }
}
