/** Exercise deferred completions and real Cache-compatible responses without any network or vehicle. */
export async function scenarios({ MAVParam: P, MAVParamDefinitions: D }, fixture, assert) {
    const trace = [];
    const bytes = Uint8Array.from(fixture.hex.match(/../g), byte => parseInt(byte, 16));
    let get, put;
    const model = new P({ ftp: {
        /** Retain a pending transfer completion to simulate cancellation and stale results. */
        getFile(path, callback, options) { trace.push([path, options]); get = callback; },
        /** Retain close acknowledgement and capture exact serialized bytes. */
        putFile(path, data, callback, options) { trace.push([path, [...data], options]); put = callback; },
    } });
    const unsubscribe = model.subscribe(state => trace.push(['state', state.busy, state.connected, state.params.size]));
    for (let i = 0; i < 3; i++) {
        const interrupted = model.refresh();
        const rejected = assert.rejects(interrupted, /download failed/);
        get(null); await rejected;
        assert.equal(model.busy, false);
        const successful = model.refresh(); get(bytes); await successful;
        assert.equal(model.params.get('TEST_I32').value, 16777217);
    }
    const writing = model.apply(new Map([['TEST_I32', 16777219]]));
    const unacknowledged = assert.rejects(writing, /not acknowledged/);
    put(null); await Promise.resolve(); get(bytes); await unacknowledged;
    assert.equal(model.params.get('TEST_I32').value, 16777217);
    // A delayed upload completion from a disconnected model must never fetch readback.
    const stale = model.apply(new Map([['TEST_I32', 16777219]]));
    const disconnected = assert.rejects(stale, /disconnected/);
    model.disconnect(); put(1); await disconnected;
    assert.equal(model.params.size, 0);
    assert.equal(model.busy, false);
    await assert.rejects(model.refresh(), /disconnected/);
    assert.equal(unsubscribe(), true);
    assert.equal(unsubscribe(), false);

    const second = new P({ ftp: {
        /** Complete downloads immediately for an independent connection. */
        getFile(_path, callback) { callback(bytes); },
        /** Cancel readback after acknowledged close through the normal completion callback. */
        putFile(_path, _data, callback) {
            /** Complete an interrupted readback without stale bytes. */
            second.ftp.getFile = (_name, done) => done(null); callback(1);
        },
    } });
    await second.refresh();
    await assert.rejects(second.apply(new Map([['TEST_I8', 2]])), /unverified/);
    assert.equal(second.params.size, 0);
    assert.equal(second.busy, false);

    let offline = false, version = 0;
    const requests = [];
    const entries = new Map();
    const cache = { /** Provide cloneable responses with the real persistent cache contract. */
        async open(name) {
            trace.push(['cache', name]);
            return {
                /** Clone a saved response so repeated loads do not consume its body. */
                async match(url) { return entries.get(url)?.clone(); },
                /** Save the exact persisted response and headers. */
                async put(url, response) { entries.set(url, response); },
            };
        },
    };
    /** Serve deterministic metadata versions or an offline failure. */
    const fetch = async url => {
        requests.push(url);
        if (offline) throw Error('offline');
        return new Response(JSON.stringify({ group: { A: { Description: `version ${version}` } } }));
    };
    const store = new D({ fetch, cache });
    await store.load('Rover');
    version++;
    assert.equal((await store.load('Rover')).definitions.get('A').description, 'version 0');
    assert.equal((await store.load('Rover', { refresh: true })).definitions.get('A').description, 'version 1');
    offline = true;
    const reopened = new D({ fetch, cache, maxAge: 0 });
    const result = await reopened.load('Rover');
    assert.equal(result.cached, true); assert.equal(result.stale, true);
    assert.equal(result.definitions.get('A').description, 'version 1');
    await assert.rejects(reopened.load('Plane'), /offline/);
    const blocked = new D({ fetch, cache: { /** Simulate private browsing or cache permission failure. */
        async open() { throw Error('cache blocked'); },
    } });
    await assert.rejects(blocked.load('Rover'), /offline/);
    trace.push(requests);
    return trace;
}
