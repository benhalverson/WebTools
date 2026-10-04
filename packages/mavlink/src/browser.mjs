// The generated script intentionally uses classic-script globals. Evaluating it
// as an ES module would change its semantics. Keep its relative jspack import.
if (!window.mavlink20) {
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('./runtime/mavlink.js', import.meta.url).href;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Unable to load the MAVLink runtime'));
        document.head.append(script);
    });
}
await window.mavlink20.ready;
export const mavlink20 = window.mavlink20;
export const MAVLink20Processor = window.MAVLink20Processor;
