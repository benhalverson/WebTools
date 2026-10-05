interface Asset { type: 'asset'; fileName: string; source: Uint8Array; }
interface Plugin {
    name: string;
    configResolved(config: { base: string; command: string }): void;
    transform(code: string, id: string): { code: string; map: null } | null;
    generateBundle(this: { emitFile(asset: Asset): string }): void;
}
declare function mavlinkAssets(): Plugin;
export = mavlinkAssets;
