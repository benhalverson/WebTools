// The generated script intentionally uses classic-script globals. Evaluating it
// as an ES module would change its semantics. Keep its relative jspack import.
if (!window.mavlink20) {
    await new Promise(/**
     * Insert the classic script only when no legacy codec global exists.
     * The inserted element remains in the document after loading; its load event
     * does not guarantee jspack readiness, which is awaited separately below.
     * @param resolve Complete script loading; does not yet guarantee codec readiness.
     * @param reject Fail module evaluation when the runtime asset cannot load.
     */ (resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('./runtime/mavlink.js', import.meta.url).href;
        script.onload = resolve;
        /** Reject the pending import on a script fetch or loading failure. */
        script.onerror = () => reject(new Error('Unable to load the MAVLink runtime'));
        document.head.append(script);
    });
}
await window.mavlink20.ready;
export const mavlink20 = window.mavlink20;
export const MAVLink20Processor = window.MAVLink20Processor;
