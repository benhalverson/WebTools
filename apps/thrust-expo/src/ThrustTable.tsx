import { useEffect, useRef } from 'react';
import type { ThrustRow } from './model';

interface TableRange {
  getLeftEdge(): number;
  getTopEdge(): number;
}
interface TableRow {
  getPosition(): number | false;
}
interface TableCell {
  getRow(): TableRow;
}
interface TableInstance {
  element: HTMLElement;
  getData(): ThrustRow[];
  getRows(): TableRow[];
  getRanges(): TableRange[];
  setData(rows: ThrustRow[]): Promise<unknown>;
  addRow(row: ThrustRow): Promise<unknown>;
  setHeight(height: string): void;
  on(event: 'tableBuilt' | 'dataChanged' | 'renderComplete', callback: () => void): void;
  on(event: 'cellEdited', callback: (cell: TableCell) => void): void;
  off(event: 'tableBuilt' | 'dataChanged' | 'renderComplete', callback: () => void): void;
  off(event: 'cellEdited', callback: (cell: TableCell) => void): void;
  destroy(): void;
}
interface TableColumn {
  title: string;
  field: keyof ThrustRow;
  hozAlign: 'right';
  validator: 'numeric';
  minWidth: number;
}
interface TableOptions {
  rowHeight: number;
  layout: 'fitColumns';
  selectableRange: number;
  selectableRangeColumns: boolean;
  selectableRangeRows: boolean;
  selectableRangeClearCells: boolean;
  editTriggerEvent: 'dblclick';
  clipboard: boolean;
  clipboardCopyStyled: boolean;
  clipboardCopyConfig: { rowHeaders: boolean; columnHeaders: boolean };
  clipboardCopyRowRange: 'range';
  clipboardPasteParser(text: string): Partial<ThrustRow>[];
  clipboardPasteAction: 'range';
  rowHeader: {
    resizable: boolean; frozen: boolean; width: number; hozAlign: 'center';
    formatter: 'rownum'; cssClass: string; editor: false;
  };
  columnDefaults: { headerSort: boolean; headerHozAlign: 'center'; editor: 'input'; resizable: 'header' };
  columns: TableColumn[];
  addRowPos: 'bottom';
  dataLoaded(this: TableInstance, data: ThrustRow[]): void;
}

/** The small surface used from the pinned, separately loaded Tabulator bundle. */
export interface TabulatorConstructor {
  new(element: HTMLElement, options: TableOptions): TableInstance;
}

/** Validate the script boundary without extending the Window global type. */
export function readTabulator(value: unknown): TabulatorConstructor | null {
  if (typeof value !== 'function') return null;
  const prototype: unknown = Reflect.get(value, 'prototype');
  if (typeof prototype !== 'object' || prototype === null ||
      typeof Reflect.get(prototype, 'destroy') !== 'function') return null;
  return value as unknown as TabulatorConstructor;
}

/** Return a distinct blank row, preserving the legacy empty-string cell values. */
function blankRow(): ThrustRow {
  return { pwm: '', thrust: '', voltage: '', current: '' };
}

/** Copy rows because Tabulator edits its input objects in place. */
function copyRows(rows: readonly ThrustRow[]): ThrustRow[] {
  return rows.map((row) => ({ ...row }));
}

export interface ThrustTableProps {
  rows: readonly ThrustRow[];
  /** Increment for an import, example, or reset; ordinary edits only update rows. */
  revision: number;
  tabulator: TabulatorConstructor | null;
  onData(rows: ThrustRow[]): void;
  onError(message: string): void;
}

/** Own the editable vendor table; React retains the data used by fitting and exports. */
export function ThrustTable({ rows, revision, tabulator, onData, onError }: ThrustTableProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ rows, onData, onError });
  const replace = useRef<(() => void) | null>(null);

  useEffect(() => {
    latest.current = { rows, onData, onError };
  }, [rows, onData, onError]);

  useEffect(() => {
    const container = host.current;
    if (!container || !tabulator) return;
    // A separate child keeps vendor DOM mutation outside React's owned children.
    const mount = document.createElement('div');
    const element = document.createElement('div');
    mount.append(element);
    element.id = 'thrust-table';
    container.append(mount);
    let disposed = false;
    let built = false;
    let currentHeight = 0;
    let updateTimeout: ReturnType<typeof setTimeout> | undefined;
    let table: TableInstance;
    let replacementVersion = 0;
    let replacementQueue = Promise.resolve();
    const pendingRows = new Set<Promise<unknown>>();

    /** Report vendor errors while this particular table still belongs to the page. */
    function report(error: unknown): void {
      if (!disposed) latest.current.onError(error instanceof Error ? error.message : String(error));
    }

    /** Observe both synchronous vendor failures and rejected asynchronous operations. */
    function addBlankRow(): void {
      if (disposed) return;
      try {
        const pending = table.addRow(blankRow()).catch(report);
        pendingRows.add(pending);
        void pending.finally(() => { pendingRows.delete(pending); });
      } catch (error) { report(error); }
    }

    /** Parse rectangular clipboard data and retain legacy range offsets and expansion. */
    function parseClipboard(text: string): Partial<ThrustRow>[] {
      const fields = ['pwm', 'thrust', 'voltage', 'current'] as const;
      const range = table.getRanges()[0];
      if (!range || disposed) return [];
      const startCol = range.getLeftEdge() - 1;
      const parsed = text.trim().split('\n').map((row) => {
        const result: Partial<ThrustRow> = {};
        row.split('\t').forEach((value, index) => {
          const field = fields[startCol + index];
          if (field !== undefined) result[field] = parseFloat(value);
        });
        return result;
      });
      let rowCount = table.getData().length;
      while (rowCount < range.getTopEdge() + parsed.length + 1) {
        addBlankRow();
        rowCount++;
      }
      return parsed;
    }

    /** Retain the legacy option callback, including its empty-value conversion. */
    function dataLoaded(this: TableInstance, data: ThrustRow[]): void {
      void this.setData(data.map((row) => ({
        pwm: row.pwm || '', thrust: row.thrust || '',
        voltage: row.voltage || '', current: row.current || '',
      }))).catch(report);
    }

    /** Publish one immutable data snapshot after edits have settled for 100 ms. */
    function dataChanged(): void {
      if (disposed) return;
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        if (!disposed) latest.current.onData(copyRows(table.getData()));
      }, 100);
    }

    /** Fit visible rows to the same 242 px maximum as the original page. */
    function renderComplete(): void {
      if (disposed) return;
      const header = table.element.querySelector<HTMLElement>('.tabulator-header');
      const height = Math.min(table.getRows().length * 22 + (header?.offsetHeight ?? 0), 242);
      if (currentHeight !== height) {
        currentHeight = height;
        table.setHeight(`${height}px`);
      }
    }

    /** Preserve the spare trailing row whenever the last row is edited. */
    function cellEdited(cell: TableCell): void {
      if (!disposed && cell.getRow().getPosition() === table.getRows().length) addBlankRow();
    }

    /** Serialize external replacements and discard superseded or unmounted work. */
    function replaceRows(): void {
      if (!built || disposed) return;
      clearTimeout(updateTimeout);
      const version = ++replacementVersion;
      const snapshot = copyRows(latest.current.rows);
      replacementQueue = replacementQueue.then(async () => {
        if (disposed || version !== replacementVersion) return;
        await table.setData(snapshot);
      }).catch(report);
    }

    /** Wait for Tabulator's asynchronous constructor before supplying initial data. */
    function tableBuilt(): void {
      built = true;
      if (disposed) {
        table.off('tableBuilt', tableBuilt);
        table.destroy();
        element.remove();
        return;
      }
      replaceRows();
    }

    try {
      table = new tabulator(element, {
        rowHeight: 22, layout: 'fitColumns', selectableRange: 1,
        selectableRangeColumns: true, selectableRangeRows: true, selectableRangeClearCells: true,
        editTriggerEvent: 'dblclick', clipboard: true, clipboardCopyStyled: false,
        clipboardCopyConfig: { rowHeaders: false, columnHeaders: false },
        clipboardCopyRowRange: 'range', clipboardPasteParser: parseClipboard, clipboardPasteAction: 'range',
        rowHeader: { resizable: false, frozen: true, width: 42, hozAlign: 'center',
          formatter: 'rownum', cssClass: 'range-header-col', editor: false },
        columnDefaults: { headerSort: false, headerHozAlign: 'center', editor: 'input', resizable: 'header' },
        columns: [
          { title: 'ESC signal (µs)', field: 'pwm', hozAlign: 'right', validator: 'numeric', minWidth: 132 },
          { title: 'Thrust', field: 'thrust', hozAlign: 'right', validator: 'numeric', minWidth: 132 },
          { title: 'Voltage (V)', field: 'voltage', hozAlign: 'right', validator: 'numeric', minWidth: 132 },
          { title: 'Current (A)', field: 'current', hozAlign: 'right', validator: 'numeric', minWidth: 132 },
        ],
        addRowPos: 'bottom', dataLoaded,
      });
      table.on('tableBuilt', tableBuilt);
      table.on('dataChanged', dataChanged);
      table.on('renderComplete', renderComplete);
      table.on('cellEdited', cellEdited);
      replace.current = replaceRows;
    } catch (error) {
      report(error);
      mount.remove();
      return;
    }

    /** Release listeners, debounce work and the imperative instance on every unmount. */
    return () => {
      disposed = true;
      replacementVersion++;
      clearTimeout(updateTimeout);
      replace.current = null;
      if (built) table.off('tableBuilt', tableBuilt);
      table.off('dataChanged', dataChanged);
      table.off('renderComplete', renderComplete);
      table.off('cellEdited', cellEdited);
      // The pinned constructor schedules _create with a private timer. If unmounted
      // before tableBuilt, that handler destroys it only after initialization ends.
      // Likewise, allow already-started local mutations to settle before destroy.
      if (built) {
        void Promise.allSettled([replacementQueue, ...pendingRows]).then(() => { table.destroy(); element.remove(); });
      }
      // Keep the vendor node parented until destroy: the pinned ResizeTable
      // module unobserves element.parentNode during its destruction event.
      mount.remove();
    };
  }, [tabulator]);

  useEffect(() => { replace.current?.(); }, [revision]);
  return <div ref={host} />;
}
