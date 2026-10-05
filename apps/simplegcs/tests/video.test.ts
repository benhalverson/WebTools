import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { test } from 'node:test'
import { readVideoSettings, readerOptions, hlsUrl, saveVideoSettings, videoError } from '../src/video-settings.ts'
const base = '2ce2994419c96d5912f952c3cd659d1b6e630aff'
/** Provide browser-compatible storage for exact legacy key comparisons. */
function storage(): Storage {
    const values = new Map<string, string>()
    return { get length() { return values.size }, clear() { values.clear() }, key(index) { return [...values.keys()][index] ?? null }, getItem(key) { return values.get(key) ?? null }, setItem(key, value) { values.set(key, value) }, removeItem(key) { values.delete(key) } }
}
test('video endpoint bytes, defaults, settings and error text match actual branch-base legacy', () => {
    const localStorage = storage(), location = { hostname: 'fixture.test', protocol: 'https:' }
    const source = execFileSync('git', ['show', `${base}:SimpleGCS/video.js`], { encoding: 'utf8' }).replace('window.VideoPanel = {', 'window.panel = _instance; window.VideoPanel = {')
    const context = vm.createContext({ window: {}, localStorage, location, prompt: () => null })
    vm.runInContext(source, context)
    for (const [host, path, user, pass] of [['fixture.test', 'stream', '', ''], ['host.test', 'camera/front?legacy=query', 'viewer', 'p:a ss']]) {
        const settings = { ...readVideoSettings(localStorage, location), host: host!, path: path!, user: user!, pass: pass! }
        Object.assign(context, { settings }); vm.runInContext('Object.assign(window.panel, settings)', context)
        assert.equal(JSON.stringify(readerOptions(settings)), vm.runInContext('JSON.stringify(window.panel._webRTCOptions())', context))
        assert.equal(hlsUrl(settings), vm.runInContext('window.panel._hlsUrl()', context))
        saveVideoSettings(localStorage, settings)
        assert.deepEqual(readVideoSettings(localStorage, location), settings)
    }
    const player = execFileSync('git', ['show', `${base}:SimpleGCS/webrtc-player.js`], { encoding: 'utf8' })
    vm.runInContext(player, context)
    for (const error of ['401 unauthorized retrying', '403', '404 stream not found', 'network failure']) {
        Object.assign(context, { error })
        assert.equal(videoError(error), vm.runInContext('(() => { let text; window.WebRTCPlayer.prototype.showError.call({setStatus(value) { text = value }}, error); return text })()', context))
    }
})

test('playback disposes media/listeners even if vendor close throws and ignores stale callbacks', async () => {
    const { startPlayback } = await import('../src/video-playback.ts')
    const owner = new EventTarget(), target = new EventTarget(), statuses: string[] = []
    let paused = 0, loaded = 0, readerConfig: import('../src/video-playback.ts').ReaderConfig | undefined
    const video = Object.assign(target, { srcObject: null as MediaStream | null, pause() { paused++ }, load() { loaded++ }, removeAttribute() {}, play() { return Promise.resolve() } }) as unknown as HTMLVideoElement
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', { configurable: true, value: owner })
    try {
        const close = startPlayback(video, { url: 'https://fixture/stream/whep', user: 'viewer', pass: 'secret' }, { reader(config) { readerConfig = config; return { close() { throw Error('vendor disposal') } } } }, status => statuses.push(status.text))
        close(); close()
        assert.equal(paused, 1); assert.equal(loaded, 1); assert.equal(video.srcObject, null)
        readerConfig!.onError('401'); readerConfig!.onTrack({ streams: [{}] } as unknown as RTCTrackEvent)
        assert.deepEqual(statuses, ['WebRTC · Connecting']); assert.equal(video.srcObject, null)
        owner.dispatchEvent(new Event('pagehide')); assert.equal(paused, 1)
    } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window') }
})

test('popup handshakes reject forged messages and release listeners/timers on every exit', async context => {
    const { openVideoWindow } = await import('../src/video-window.ts')
    context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
    const sent: unknown[] = [], completed: unknown[] = [], opened: string[] = [], listeners = new Set<EventListenerOrEventListenerObject>()
    const popup = { closed: false, postMessage(message: unknown) { sent.push(message) } }
    const owner = Object.assign(new EventTarget(), { open(url: URL) { opened.push(url.href); return popup } })
    const nativeAdd = owner.addEventListener.bind(owner), nativeRemove = owner.removeEventListener.bind(owner)
    owner.addEventListener = (name, listener, options) => { if (listener) listeners.add(listener); nativeAdd(name, listener, options) }
    owner.removeEventListener = (name, listener, options) => { if (listener) listeners.delete(listener); nativeRemove(name, listener, options) }
    const replacements = { window: owner, document: { baseURI: 'https://fixture/Tools/WebTools/SimpleGCS-preview/?retained=1' }, location: { origin: 'https://fixture' } }
    const previous = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value })
    /** Deliver a controlled message event with its source and origin independently chosen. */
    function ready(source: unknown, origin: string): void { owner.dispatchEvent(Object.assign(new Event('message'), { source, origin, data: 'simplegcs-video-ready' })) }
    try {
        const options = { url: 'https://fixture:8889/stream/whep', user: 'viewer', pass: 'fixture-secret' }
        openVideoWindow(options, cleanup => completed.push(cleanup))
        ready({}, 'https://fixture'); ready(popup, 'https://untrusted'); assert.equal(sent.length, 0)
        ready(popup, 'https://fixture'); assert.deepEqual(sent, [{ type: 'simplegcs-video-config', options }]); assert.equal(listeners.size, 0); assert.equal(completed.length, 1)
        assert.deepEqual(opened, ['https://fixture/Tools/WebTools/SimpleGCS-preview/video.html'])
        openVideoWindow(options, cleanup => completed.push(cleanup)); context.mock.timers.tick(30000); assert.equal(listeners.size, 0); assert.equal(completed.length, 2)
        openVideoWindow(options, cleanup => completed.push(cleanup)); popup.closed = true; context.mock.timers.tick(250); assert.equal(listeners.size, 0); assert.equal(completed.length, 3)
        openVideoWindow(options, cleanup => completed.push(cleanup)); owner.dispatchEvent(new Event('pagehide')); assert.equal(listeners.size, 0); assert.equal(completed.length, 4)
    } finally { for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } }
})

test('throwing HLS disposal still releases media, retries and stale HLS callbacks', async context => {
    const { startPlayback } = await import('../src/video-playback.ts')
    context.mock.timers.enable({ apis: ['setTimeout'] })
    const owner = new EventTarget(), target = new EventTarget(), instances: ControlledHls[] = []
    let paused = 0, plays = 0, fallbacks = 0
    const video = Object.assign(target, { srcObject: null as MediaStream | null, pause() { paused++ }, load() {}, removeAttribute() {}, canPlayType() { return '' }, play() { plays++; return Promise.resolve() } }) as unknown as HTMLVideoElement
    class ControlledHls {
        static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest' }
        handlers = new Map<string, (event: string, data?: { fatal?: boolean }) => void>()
        /** Register each generation without touching a network or decoder. */
        constructor() { instances.push(this) }
        /** Advertise controlled HLS support. */
        static isSupported(): boolean { return true }
        /** Retain callbacks so stale delivery remains possible after disposal. */
        on(event: string, callback: (event: string, data?: { fatal?: boolean }) => void): void { this.handlers.set(event, callback) }
        /** Model the legacy vendor's best-effort destruction contract. */
        destroy(): void { throw Error('broken vendor') }
        /** Ignore fixture source URLs; no request is made. */
        loadSource(): void {}
        /** No media resources are allocated by this controlled vendor. */
        attachMedia(): void {}
    }
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
    Object.defineProperty(globalThis, 'window', { configurable: true, value: owner }); Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:' } })
    try {
        const close = startPlayback(video, { url: 'https://fixture/whep', user: '', pass: '' }, { reader() { throw Error('unexpected WebRTC') }, hls: ControlledHls }, () => {}, { settings: { host: 'fixture', path: 'stream', user: 'viewer', pass: 'secret', scheme: 'https', hlsPort: 8888, wrtcPort: 8889 }, fallback() { fallbacks++ } })
        instances[0]!.handlers.get('error')!('error', { fatal: true }); context.mock.timers.tick(2000); assert.equal(instances.length, 2)
        instances[1]!.handlers.get('error')!('error', { fatal: true }); close(); context.mock.timers.tick(5000)
        for (const instance of instances) { instance.handlers.get('manifest')!('manifest'); instance.handlers.get('error')!('error', { fatal: true }) }
        context.mock.timers.tick(5000); assert.equal(instances.length, 2); assert.equal(plays, 0); assert.equal(fallbacks, 0); assert.equal(paused, 1)
        owner.dispatchEvent(new Event('pagehide')); assert.equal(paused, 1)
    } finally {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window')
        if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation); else Reflect.deleteProperty(globalThis, 'location')
    }
})
