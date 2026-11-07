import { Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

interface DiagramInteractionLabels {
    zoomIn: string;
    zoomOut: string;
    reset: string;
    fit: string;
    panLeft: string;
    panRight: string;
    panUp: string;
    panDown: string;
    region: string;
    hint: string;
    preview: string;
    edit: string;
    copy: string;
}
type DiagramInteractionOptions = boolean | {
    labels?: Partial<DiagramInteractionLabels>;
};
declare const diagramLabels: DiagramInteractionLabels;
interface DiagramSnapshot {
    source: string;
    language: string;
    scale: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
}
/** Session-local view data: transactions map block positions without altering document/history. */
declare function createDiagramStatePlugin(): Plugin<Map<number, DiagramSnapshot>>;
declare function diagramSnapshot(view: EditorView, pos: number, source: string, language: string): DiagramSnapshot;
interface DiagramController {
    destroy(): void;
    refresh(): void;
    originalSize(svg: SVGSVGElement): {
        width: number;
        height: number;
    } | undefined;
}
declare function createDiagramController(args: {
    preview: HTMLElement;
    wrapper: HTMLElement;
    toolbar: HTMLElement;
    toolbarRight: HTMLElement;
    view: EditorView;
    getPos(): number | undefined;
    snapshot: DiagramSnapshot;
    labels: DiagramInteractionLabels;
}): DiagramController;

export { type DiagramController, type DiagramInteractionLabels, type DiagramInteractionOptions, type DiagramSnapshot, createDiagramController, createDiagramStatePlugin, diagramLabels, diagramSnapshot };
