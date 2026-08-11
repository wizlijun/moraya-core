import { Plugin, PluginKey } from 'prosemirror-state';
import { Node } from 'prosemirror-model';

/**
 * Footnote plugin — 角标编号与交互。
 *
 * 编号是**派生值**:按 `footnote_ref` 在正文中首次出现的顺序给每个 label 分配序号,
 * 同一 label 的多次引用共用一个编号。它不进节点 attrs(那会污染磁盘语义),而是每次
 * 文档变化时重算并以 Decoration 的形式挂上 `data-num`,由 CSS `content: attr(data-num)`
 * 渲染出来。
 *
 * Schema-agnostic:通过 `node.type.name` 判定,不引用 schema 单例。
 */

declare const footnotePluginKey: PluginKey<any>;
/** 按 label 查找定义节点。找不到返回 null。 */
declare function findDefinition(doc: Node, label: string): {
    node: Node;
    pos: number;
} | null;
/** 按 label 查找首个引用节点,用于从定义块回跳。找不到返回 null。 */
declare function findFirstRef(doc: Node, label: string): {
    node: Node;
    pos: number;
} | null;
/** 定义的纯文本,用于 hover 浮层。多段之间用空格连接。 */
declare function definitionText(doc: Node, label: string): string;
declare function createFootnotePlugin(): Plugin;

export { createFootnotePlugin, definitionText, findDefinition, findFirstRef, footnotePluginKey };
