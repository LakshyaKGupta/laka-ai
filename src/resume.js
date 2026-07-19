const fs = require('fs/promises');
const path = require('path');

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_CHARS = 24_000;
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

function normalizeResumeText(value, limit = MAX_RESUME_CHARS) {
  return String(value || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n').trim().slice(0, limit);
}

async function extractResumeText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) throw new Error('Choose a PDF, DOCX, TXT, or Markdown resume.');
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_RESUME_BYTES) throw new Error('Resume files must be under 5 MB.');
  const buffer = await fs.readFile(filePath);
  if (ext === '.txt' || ext === '.md') return normalizeResumeText(buffer.toString('utf8'));
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return normalizeResumeText(result.value);
  }
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try { return normalizeResumeText((await parser.getText()).text); }
  finally { await parser.destroy(); }
}

module.exports = { MAX_RESUME_CHARS, SUPPORTED_EXTENSIONS, extractResumeText, normalizeResumeText };
