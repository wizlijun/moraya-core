import { Node } from 'prosemirror-model';
import { NodeViewConstructor } from 'prosemirror-view';

type SessionTableWidths = readonly (number | null)[] | null;
interface SessionTablePainter {
    getPos(): number | undefined;
    paint(widths: SessionTableWidths): void;
}
interface SessionTableViewOptions {
    readWidths(position: number | undefined, node: Node): SessionTableWidths;
    register(painter: SessionTablePainter): () => void;
}
/** Paint session widths on the upstream DOM without changing document attributes. */
declare function createSessionTableView(options: SessionTableViewOptions): NodeViewConstructor;

export { type SessionTablePainter, type SessionTableViewOptions, type SessionTableWidths, createSessionTableView };
