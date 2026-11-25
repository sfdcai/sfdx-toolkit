import fs from 'fs';
import path from 'path';
import { getFeatureFlag } from '../../feature-flags';
import { decryptSecret } from '../../secret-store';

export async function healWithLlm(
  filePath: string,
  errorMessage: string,
  projectDir: string,
  tenantId?: string
): Promise<{ success: boolean; modified: boolean; detail?: string }> {
  if (!fs.existsSync(filePath)) {
    return { success: false, modified: false, detail: 'File does not exist' };
  }

  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && tenantId) {
    try {
      const flag = getFeatureFlag(tenantId, 'autonomous_healing');
      const encryptedKey = flag.settings?.encryptedKey as any;
      if (encryptedKey) {
        apiKey = decryptSecret(encryptedKey);
      }
    } catch (err: any) {
      console.error(`Failed to decrypt tenant Gemini key: ${err.message}`);
    }
  }

  if (!apiKey) {
    return { 
      success: false, 
      modified: false, 
      detail: 'GEMINI_API_KEY is not configured. Please configure it in Settings to enable LLM healing.' 
    };
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const prompt = `You are a Salesforce development expert. The following Apex file failed to compile, deploy, or run tests.

Error message:
${errorMessage}

File Path:
${filePath}

File Content:
\`\`\`
${fileContent}
\`\`\`

Please fix the code to resolve the error. Maintain all existing functionality, comments, and docstrings. Do not remove unrelated code.
Return the result ONLY as a JSON object of this structure:
{
  "code": "the complete corrected code file"
}
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, modified: false, detail: `Gemini API returned HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json() as any;
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      return { success: false, modified: false, detail: 'Empty response from Gemini API' };
    }

    const parsed = JSON.parse(responseText.trim());
    if (typeof parsed.code !== 'string' || !parsed.code.trim()) {
      return { success: false, modified: false, detail: 'Invalid JSON response structure from Gemini API' };
    }

    fs.writeFileSync(filePath, parsed.code, 'utf8');
    return { success: true, modified: true };
  } catch (err: any) {
    return { success: false, modified: false, detail: `Error calling Gemini: ${err.message}` };
  }
}
