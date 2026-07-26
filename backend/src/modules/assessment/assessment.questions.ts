/**
 * Seed question bank for the aptitude test — Excel, Word, Cybersecurity.
 *
 * Each item is multiple-choice with exactly one correct option. `correctIndex`
 * points at the correct entry in `options` as written here; the server SHUFFLES
 * option order per attempt, so the position carries no signal to candidates.
 * Case-study items pose a short scenario but still resolve to one best answer,
 * which is what keeps auto-marking reliable.
 *
 * Admins can add/deactivate questions at runtime via the admin API; this array
 * only bootstraps an empty bank.
 */
export type Topic = 'EXCEL' | 'WORD' | 'CYBERSECURITY' | 'TAX';

export interface SeedQuestion {
  topic: Topic;
  /** Short topic title (e.g. "Spreadsheet Calculation") — from the KIRS pattern. */
  title?: string | null;
  stem: string;
  options: string[];
  correctIndex: number;
  /** "Competency assessed" note — from the KIRS pattern. */
  competency?: string | null;
  isCaseStudy?: boolean;
}

export const SEED_QUESTIONS: SeedQuestion[] = [
  // ── Excel ────────────────────────────────────────────────────────────────
  { topic: 'EXCEL', stem: 'Every Excel formula must begin with which symbol?', options: ['=', '+', '@', '#'], correctIndex: 0 },
  { topic: 'EXCEL', stem: 'Which function adds up a range of numbers?', options: ['=SUM()', '=ADD()', '=TOTAL()', '=PLUS()'], correctIndex: 0 },
  { topic: 'EXCEL', stem: 'Which function counts only the cells in a range that contain numbers?', options: ['=COUNT()', '=COUNTA()', '=SUM()', '=NUM()'], correctIndex: 0 },
  { topic: 'EXCEL', stem: 'To keep a cell reference fixed when a formula is copied, you use:', options: ['An absolute reference ($A$1)', 'A relative reference (A1)', 'A blank reference', 'A circular reference'], correctIndex: 0 },
  { topic: 'EXCEL', stem: 'Which function looks up a value in the leftmost column of a table and returns a value from the same row?', options: ['VLOOKUP', 'HLOOKUP', 'ROUND', 'CONCAT'], correctIndex: 0 },
  { topic: 'EXCEL', stem: 'Dragging the small square at the bottom-right of a selected cell (the fill handle) will:', options: ['Copy or extend the content/series', 'Delete the cells', 'Merge the cells', 'Lock the cells'], correctIndex: 0 },
  { topic: 'EXCEL', stem: 'Which chart type best shows the parts of a whole as percentages?', options: ['Pie chart', 'Line chart', 'Scatter chart', 'Radar chart'], correctIndex: 0 },
  { topic: 'EXCEL', stem: 'On Windows, which shortcut saves the current workbook?', options: ['Ctrl + S', 'Ctrl + P', 'Ctrl + V', 'Ctrl + F'], correctIndex: 0 },
  { topic: 'EXCEL', stem: 'A cell shows "#####". This usually means:', options: ['The column is too narrow to display the value', 'The formula divides by zero', 'The function name is misspelled', 'The reference was deleted'], correctIndex: 0 },
  { topic: 'EXCEL', stem: 'Which function returns the average of a range of numbers?', options: ['=AVERAGE()', '=MEAN()', '=AVG()', '=MID()'], correctIndex: 0 },
  { topic: 'EXCEL', isCaseStudy: true, stem: 'A price is in cell B2. You must add 7.5% VAT to it. Which formula gives the VAT-inclusive amount?', options: ['=B2*1.075', '=B2+7.5', '=B2*7.5', '=B2/1.075'], correctIndex: 0 },
  { topic: 'EXCEL', isCaseStudy: true, stem: 'Column A holds region names and column B holds sales amounts. You need the total sales for "Lagos" only. Which function fits best?', options: ['=SUMIF()', '=SUM()', '=COUNT()', '=IF()'], correctIndex: 0 },

  // ── Word ─────────────────────────────────────────────────────────────────
  { topic: 'WORD', stem: 'Which shortcut makes selected text bold?', options: ['Ctrl + B', 'Ctrl + I', 'Ctrl + U', 'Ctrl + L'], correctIndex: 0 },
  { topic: 'WORD', stem: 'Which feature automatically builds a list of headings with their page numbers?', options: ['Table of Contents', 'Mail Merge', 'SmartArt', 'WordArt'], correctIndex: 0 },
  { topic: 'WORD', stem: 'Which feature sends one letter to many recipients, personalising fields such as names?', options: ['Mail Merge', 'Track Changes', 'Macros', 'Themes'], correctIndex: 0 },
  { topic: 'WORD', stem: 'To record edits so a reviewer can see every change, you turn on:', options: ['Track Changes', 'Read Mode', 'Dark Mode', 'Compatibility Mode'], correctIndex: 0 },
  { topic: 'WORD', stem: 'Which shortcut undoes the last action?', options: ['Ctrl + Z', 'Ctrl + Y', 'Ctrl + X', 'Ctrl + U'], correctIndex: 0 },
  { topic: 'WORD', stem: 'Content placed in the top margin that repeats on every page is called the:', options: ['Header', 'Footnote', 'Caption', 'Endnote'], correctIndex: 0 },
  { topic: 'WORD', stem: '"Justify" alignment does what to a paragraph?', options: ['Aligns text evenly to both left and right margins', 'Centres the text', 'Aligns text to the right only', 'Indents the first line'], correctIndex: 0 },
  { topic: 'WORD', stem: 'Which view shows the document as it will appear when printed?', options: ['Print Layout', 'Web Layout', 'Outline', 'Draft'], correctIndex: 0 },
  { topic: 'WORD', stem: 'A red wavy underline under a word usually indicates:', options: ['A possible spelling error', 'A hyperlink', 'A tracked change', 'A comment'], correctIndex: 0 },
  { topic: 'WORD', stem: 'Which feature applies a consistent set of formatting (font, size, spacing) in one click?', options: ['Styles', 'Clipboard', 'Ruler', 'Zoom'], correctIndex: 0 },
  { topic: 'WORD', isCaseStudy: true, stem: 'A new section of your report must always start at the top of a fresh page, even if earlier text is edited later. What should you insert?', options: ['A page break', 'Several blank lines by pressing Enter', 'A text box', 'A comment'], correctIndex: 0 },
  { topic: 'WORD', isCaseStudy: true, stem: 'A report must show the company name at the very top of every page automatically. Where do you put it?', options: ['In the header', 'Typed once in the body', 'In a footnote', 'In a comment'], correctIndex: 0 },

  // ── Cybersecurity ─────────────────────────────────────────────────────────
  { topic: 'CYBERSECURITY', stem: 'What is "phishing"?', options: ['Fraudulent messages that trick you into revealing information', 'A type of firewall', 'A method of backing up data', 'A strong-password technique'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', stem: 'Which of these is the strongest password?', options: ['A 12+ character mix of upper/lowercase letters, numbers and symbols', 'password123', 'Your first name', '123456'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', stem: 'Multi-factor authentication (MFA) improves security by:', options: ['Requiring a second proof of identity beyond the password', 'Making login faster', 'Increasing storage space', 'Speeding up the processor'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', stem: 'What is malware?', options: ['Software designed to harm, exploit or gain unauthorised access', 'A hardware firewall', 'A web browser', 'A password manager'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', stem: 'Using public Wi-Fi for sensitive work is risky mainly because:', options: ['Data can be intercepted by attackers on the network', 'It is always slower', 'It drains the battery', 'It requires a cable'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', stem: 'Installing a software update or security patch usually:', options: ['Fixes known security vulnerabilities', 'Deletes your personal files', 'Permanently slows the computer', 'Changes your password'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', stem: 'Ransomware typically:', options: ['Encrypts your files and demands payment to unlock them', 'Speeds up your computer', 'Automatically backs up your data', 'Blocks online adverts'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', stem: 'The best protection against losing data to ransomware is:', options: ['Keeping regular offline / separate backups', 'A brighter screen', 'A faster mouse', 'Deleting old emails'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', stem: 'Before entering sensitive data, a safer sign that a website is secure is:', options: ['HTTPS with a padlock in the address bar', 'A colourful logo', 'Many pop-up adverts', 'A very long web address'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', stem: 'You should share a one-time password (OTP) code sent to your phone with:', options: ['No one', 'Anyone who asks', 'A caller claiming to be your bank', 'Close colleagues'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', isCaseStudy: true, stem: 'You receive an email from your "bank" asking you to click a link and confirm your PIN urgently. The safest action is to:', options: ['Not click, and verify through the bank’s official channel', 'Click the link quickly before it expires', 'Reply with your PIN', 'Forward it to colleagues to check'], correctIndex: 0 },
  { topic: 'CYBERSECURITY', isCaseStudy: true, stem: 'A caller says they are IT support and asks for your login password to "fix" your account. This is an example of:', options: ['Social engineering — refuse and report it', 'Routine maintenance you must allow', 'A software update', 'A data backup'], correctIndex: 0 },
];
