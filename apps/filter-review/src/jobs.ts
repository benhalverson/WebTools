import type { Recording, Source } from './ingestion.ts'
import type { Settings, Spectrum } from './spectrum.ts'

export interface Request { bytes: ArrayBuffer; parserUrl: string; source: Source; instance: number; settings: Settings }
export type Response = { kind: 'progress'; value: number } | { kind: 'error'; message: string } |
    { kind: 'result'; recording: Recording; spectrum: Spectrum; instance: number }
