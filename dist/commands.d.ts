import { Command } from 'prosemirror-state';
export { Command, EditorState, Transaction } from 'prosemirror-state';
export { Node } from 'prosemirror-model';

type GfmTableAction = {
    kind: 'insert';
} | {
    kind: 'add-row' | 'delete-row' | 'add-column' | 'delete-column' | 'next-cell' | 'previous-cell';
} | {
    kind: 'align-column';
    alignment: 'left' | 'center' | 'right';
};
/** Commands for rectangular GFM tables, using only the current editor's schema. */
declare function gfmTableCommand(action: GfmTableAction): Command;

declare const toggleBold: Command;
declare const toggleItalic: Command;
declare const toggleStrikethrough: Command;
declare const toggleCode: Command;
declare const toggleHighlight: Command;
declare function setHeading(level: 1 | 2 | 3 | 4 | 5 | 6): Command;
declare const toggleBlockquote: Command;
declare const toggleOrderedList: Command;
declare const toggleBulletList: Command;
declare const wrapInBulletList: Command;
declare const wrapInOrderedList: Command;
/**
 * Wrap current block(s) in a bullet list with task-list items (checked: false).
 * Two-step: first apply wrapInList against the bullet_list type, then
 * post-process newly-created list_item nodes within the affected range to
 * set `checked: false` so they render as task items.
 */
declare const wrapInTaskList: Command;
declare const toggleCodeBlock: Command;
declare const insertHorizontalRule: Command;
/** Insert a 3×3 GFM table using the current editor's schema. */
declare const insertTable: Command;
declare const insertMathBlock: Command;
declare function toggleLink(href?: string): Command;
declare function insertImage(src: string, alt?: string): Command;

export { type GfmTableAction, gfmTableCommand, insertHorizontalRule, insertImage, insertMathBlock, insertTable, setHeading, toggleBlockquote, toggleBold, toggleBulletList, toggleCode, toggleCodeBlock, toggleHighlight, toggleItalic, toggleLink, toggleOrderedList, toggleStrikethrough, wrapInBulletList, wrapInOrderedList, wrapInTaskList };
