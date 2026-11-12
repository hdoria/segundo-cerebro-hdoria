// Build-time adapter. The installed Console imports only the self-contained bundle.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
const parser = unified().use(remarkParse);
export const parseNoteMarkdown = text => parser.parse(text);
