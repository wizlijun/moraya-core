import { Node, Schema } from 'prosemirror-model';
import { Step, StepResult, StepMap, Mappable } from 'prosemirror-transform';

type RawEdit = Readonly<{
    from: number;
    to: number;
    removed: string;
    text: string;
}>;
type RootIdRow = Readonly<{
    rootOrdinal: number;
    id: string;
}>;
type BindingImage = Readonly<{
    sourceHash: string;
    roots: readonly RootIdRow[];
}>;
type RawDelta = Readonly<{
    beforeLineage: string;
    afterLineage: string;
    beforeHash: string;
    afterHash: string;
    edits: readonly RawEdit[];
    bindings?: Readonly<{
        before: BindingImage;
        after: BindingImage;
    }>;
}>;
type TableImage = Readonly<{
    position: number;
    columns: number;
    widths: readonly (number | null)[];
}>;
type TableDelta = Readonly<{
    id: string;
    before: TableImage | null;
    after: TableImage | null;
}>;
declare function failActiveHistoryAttempts(): void;
/** Synchronous failure scope only; the PM history plugin owns the event stack. */
declare function withSourceHistoryAttempt<T>(fn: () => T): {
    value: T;
    failed: boolean;
};
declare class SourceHistoryStep extends Step {
    readonly deltas: readonly RawDelta[];
    constructor(deltas: readonly RawDelta[]);
    static canonicalEdits(input: readonly RawEdit[]): readonly RawEdit[];
    static invertEdits(input: readonly RawEdit[]): readonly RawEdit[];
    apply(doc: Node): StepResult;
    invert(_doc?: Node): SourceHistoryStep;
    getMap(): StepMap;
    map(_mapping?: Mappable): SourceHistoryStep;
    merge(_other?: Step): null;
    toJSON(): {
        stepType: string;
        v: number;
        deltas: readonly Readonly<{
            beforeLineage: string;
            afterLineage: string;
            beforeHash: string;
            afterHash: string;
            edits: readonly RawEdit[];
            bindings?: Readonly<{
                before: BindingImage;
                after: BindingImage;
            }>;
        }>[];
    };
    static fromJSON(_schema: Schema, json: unknown): SourceHistoryStep;
}
declare class TableLayoutStep extends Step {
    readonly deltas: readonly TableDelta[];
    constructor(deltas: readonly TableDelta[]);
    apply(doc: Node): StepResult;
    invert(_doc?: Node): TableLayoutStep;
    getMap(): StepMap;
    map(_mapping?: Mappable): TableLayoutStep;
    merge(_other?: Step): null;
    toJSON(): {
        stepType: string;
        v: number;
        deltas: readonly Readonly<{
            id: string;
            before: TableImage | null;
            after: TableImage | null;
        }>[];
    };
    static fromJSON(_schema: Schema, json: unknown): TableLayoutStep;
}

export { type BindingImage, type RawDelta, type RawEdit, type RootIdRow, SourceHistoryStep, type TableDelta, type TableImage, TableLayoutStep, failActiveHistoryAttempts, withSourceHistoryAttempt };
