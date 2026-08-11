import { Plugin, PluginKey } from 'prosemirror-state';
import { Node } from 'prosemirror-model';

/**
 * Footnote plugin — 脚注的跳转与悬停提示。
 *
 * 角标显示的就是 `[^id]` 里的 id,直接由 schema 的 `data-label` 属性驱动 CSS,
 * 插件不参与渲染 —— 所以这里没有 decoration,只处理交互:
 *
 *   正文角标   → 底部对应的定义
 *   定义前的标记 → 首次引用处
 *
 * Schema-agnostic:通过 `node.type.name` 判定,不引用 schema 单例。
 */

declare const footnotePluginKey: PluginKey<any>;
/** 按 label 查找定义节点。找不到返回 null。 */
declare function findDefinition(doc: Node, label: string): {
    node: Node;
    pos: number;
} | null;
/** 按 label 查找首个引用节点,用于从定义回跳。找不到返回 null。 */
declare function findFirstRef(doc: Node, label: string): {
    node: Node;
    pos: number;
} | null;
/** 定义的纯文本,用于 hover 提示。多段之间用空格连接。 */
declare function definitionText(doc: Node, label: string): string;
declare function createFootnotePlugin(): Plugin;

export { createFootnotePlugin, definitionText, findDefinition, findFirstRef, footnotePluginKey };
