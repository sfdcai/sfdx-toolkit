import fs from 'fs';
import path from 'path';
import { sanitizeMetadataContent } from '../../deploy';

export async function healXmlFile(
  filePath: string,
  errorMessage: string,
  sourceDir: string,
  deployDir: string
): Promise<{ success: boolean; modified: boolean; detail?: string }> {
  if (!fs.existsSync(filePath)) {
    return { success: false, modified: false, detail: 'File does not exist' };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let sanitized = content;
    let modified = false;

    // 1. Remove problem related lists from layout if layout complains
    if (filePath.endsWith('.layout-meta.xml') && /relatedlist/i.test(errorMessage)) {
      const match = errorMessage.match(/relatedlist:\s*([a-zA-Z0-9_]+)/i);
      if (match && match[1]) {
        const listName = match[1];
        const regex = new RegExp(`<relatedLists>[\\s\\S]*?<relatedList>${listName}</relatedList>[\\s\\S]*?</relatedLists>`, 'g');
        if (regex.test(sanitized)) {
          sanitized = sanitized.replace(regex, '');
          modified = true;
        }
      }
    }

    // 2. Remove problematic actionOverrides in object-meta if object complains
    if (filePath.endsWith('.object-meta.xml') && /actionoverride/i.test(errorMessage)) {
      const regex = /<actionOverrides>[\s\S]*?<\/actionOverrides>/g;
      if (regex.test(sanitized)) {
        sanitized = sanitized.replace(regex, '');
        modified = true;
      }
    }

    // 3. Remove invalid userPermissions from Profile/PermissionSet
    if ((filePath.endsWith('.profile-meta.xml') || filePath.endsWith('.permissionset-meta.xml')) && /userpermission/i.test(errorMessage)) {
      const match = errorMessage.match(/userpermission:\s*([a-zA-Z0-9_]+)/i);
      if (match && match[1]) {
        const permName = match[1];
        const regex = new RegExp(`<userPermissions>[\\s\\S]*?<name>${permName}</name>[\\s\\S]*?</userPermissions>`, 'g');
        if (regex.test(sanitized)) {
          sanitized = sanitized.replace(regex, '');
          modified = true;
        }
      }
    }

    // 4. Always run the general metadata sanitizer as a baseline check
    const relPath = path.relative(deployDir, filePath);
    const baselineSanitized = sanitizeMetadataContent(relPath, sanitized, sourceDir, deployDir);
    if (baselineSanitized !== content) {
      sanitized = baselineSanitized;
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, sanitized, 'utf8');
      return { success: true, modified: true };
    }

    return { success: true, modified: false, detail: 'No matching XML healing patterns found' };
  } catch (err: any) {
    return { success: false, modified: false, detail: `Error in XML healer: ${err.message}` };
  }
}
