interface Lease { id: number; release: () => void }
/** Own one tab's Web Lock, replacing a lease only after a new ID is acquired. */
export class ComponentIdentity {
    private lease: Lease | null = null
    private generation = 0
    private readonly locks: LockManager | undefined
    /** Inject the browser lock manager; unavailable Web Locks retain legacy fallback behavior. */
    constructor(locks?: LockManager) { this.locks = locks }
    /** Reserve the preferred ID or scan 1–255; cancelled acquisitions release immediately. */
    async claim(preferred: number): Promise<number | null> {
        const generation = ++this.generation
        if (this.lease?.id === preferred || !this.locks) return preferred
        for (let offset = 0; offset < 255; offset++) {
            const id = 1 + (preferred - 1 + offset) % 255
            const lease = await new Promise<Lease | null>((resolve, reject) => {
                void this.locks!.request(`simplegcs.component.${id}`, { ifAvailable: true }, lock => {
                    if (!lock) { resolve(null); return }
                    return new Promise<void>(release => resolve({ id, release }))
                }).catch(reject)
            })
            if (generation !== this.generation) { lease?.release(); return null }
            if (lease) { this.lease?.release(); this.lease = lease; return id }
        }
        throw new Error('All GCS component IDs are in use. Close an unused GCS tab.')
    }
    /** Invalidate pending work while retaining the tab identity across disconnects. */
    cancel(): void { this.generation++ }
    /** Release the held lease and invalidate every in-flight acquisition on unmount. */
    dispose(): void { this.cancel(); this.lease?.release(); this.lease = null }
}
