import { validName } from './packed.js';
import type { DefinitionCache, DefinitionOptions, DefinitionResult, VehicleParameterDefinition } from './types.js';

export class MAVParamDefinitions {
    private readonly fetcher: typeof globalThis.fetch;
    private readonly cache: DefinitionCache | undefined;
    private readonly maxAge: number;
    private readonly baseUrl: string;
    private readonly memory = new Map<string, { data: unknown; time: number }>();
    /** Create a weekly per-vehicle cache with injectable browser storage and fetch ownership. */
    constructor({fetch:fetcher=globalThis.fetch, cache=globalThis.caches, maxAge=7*86400000,
                 baseUrl='https://autotest.ardupilot.org/Parameters'}: DefinitionOptions={}) {
        this.fetcher=fetcher.bind(globalThis); this.cache=cache; this.maxAge=maxAge; this.baseUrl=baseUrl;

    }
    /** Normalize upstream definition groups while preserving their display and numeric field values. */
    static parse(data: unknown): Map<string, VehicleParameterDefinition> {
        const result=new Map<string, VehicleParameterDefinition>();
        for (const group of Object.values(data as Record<string, unknown>)) {
            if (!group || typeof group !== 'object') continue;
            for (const [key,raw] of Object.entries(group)) {
                const p = raw as Record<string, unknown> | null;
                if (!p || typeof p !== 'object') continue;
                const name=key.split(':').at(-1)!;
                if (!validName(name)) continue;
                result.set(name,{name,label:p.DisplayName || p.displayName || p.humanName || '',description:p.Description || p.description || p.documentation || '',
                    units:p.Units || '',range:p.Range,increment:p.Increment,values:p.Values || {},bitmask:p.Bitmask || {},
                    readOnly:String(p.ReadOnly).toLowerCase()==='true',rebootRequired:String(p.RebootRequired).toLowerCase()==='true'});
            }
        }
        if (!result.size) throw new Error('Empty or invalid parameter definitions');
        return result;
    }
    /** Load fresh definitions or fall back to cached offline data, retaining legacy keys and refresh policy. */
    async load(vehicle: string, {refresh=false}: { refresh?: boolean }={}): Promise<DefinitionResult> {
        if (!['Rover','Plane','Copter','Sub','AntennaTracker','Blimp','Heli'].includes(vehicle)) throw new Error('Unknown vehicle definitions');
        // Canonical directories avoid legacy redirects without CORS headers.
        const directories: Readonly<Record<string, string>> = {Rover:'APMrover2',Plane:'ArduPlane',Copter:'ArduCopter',Sub:'ArduSub',Heli:'ArduCopter'};
        const directory = directories[vehicle] || vehicle;
        const url=`${this.baseUrl}/${directory}/apm.pdef.json`;
        let cached=this.memory.get(url);
        let store: Awaited<ReturnType<DefinitionCache["open"]>> | undefined;
        try {
            store=await this.cache?.open('mavparam-definitions-v1');
            if (!cached) {
                const response=await store?.match(url);
                if (response) cached={data:await response.json(),time:Number(response.headers.get('X-MAVParam-Cached'))};
            }
        } catch { /* Private browsing or cache quota: use memory. */ }
        if (cached && !refresh && Date.now()-cached.time < this.maxAge) return {definitions:MAVParamDefinitions.parse(cached.data),cached:true,stale:false};
        try {
            const response=await this.fetcher(url,{signal:AbortSignal.timeout(15000)});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data=await response.json(), definitions=MAVParamDefinitions.parse(data);
            cached={data,time:Date.now()}; this.memory.set(url,cached);
            try { await store?.put(url,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','X-MAVParam-Cached':String(cached.time)}})); } catch {}
            return {definitions,cached:false,stale:false};
        } catch (error) {
            if (cached) return {definitions:MAVParamDefinitions.parse(cached.data),cached:true,stale:true};
            throw error;
        }
    }
}
