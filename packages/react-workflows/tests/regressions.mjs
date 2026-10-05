import assert from 'node:assert/strict'

/** Install observation that owns only WeakRefs and primitive delivery evidence.
 * Native FileReader and native two-second timers still perform the operation;
 * an external target stand-in discards payloads instead of opening a provider. */
function observeTransfers() {
    const probe = window.transferProbe = { files: [], readers: [], buffers: [], targets: [], sent: [], timers: new Set() }
    const read = FileReader.prototype.readAsArrayBuffer
    FileReader.prototype.readAsArrayBuffer = function(file) {
        probe.files.push(new WeakRef(file))
        probe.readers.push(new WeakRef(this))
        this.addEventListener('load', function() { probe.buffers.push(new WeakRef(this.result)) }, { once: true })
        return read.call(this, file)
    }
    window.open = () => {
        const target = {
            /** Record only primitive checks; never retain the delivered buffer. */
            postMessage(message, origin) {
                const bytes = new Uint8Array(message.data)
                probe.sent.push({ type: message.type, size: bytes.length, first: bytes[0], last: bytes.at(-1), origin })
            },
        }
        probe.targets.push(new WeakRef(target))
        return target
    }
    const schedule = window.setTimeout.bind(window), cancel = window.clearTimeout.bind(window)
    window.setTimeout = (callback, delay, ...args) => {
        if (delay !== 2000) return schedule(callback, delay, ...args)
        const id = schedule(() => { probe.timers.delete(id); callback(...args) }, delay)
        probe.timers.add(id)
        return id
    }
    window.clearTimeout = id => { probe.timers.delete(id); cancel(id) }
}

/** Force Chromium GC in a separate task from WeakRef dereferencing. No remote
 * object handles or evaluate results retain readers, targets, or payloads. */
async function lifetimes(page, session) {
    await session.send('HeapProfiler.collectGarbage')
    return page.evaluate(() => Object.fromEntries(['readers', 'buffers', 'targets'].map(key =>
        [key, window.transferProbe[key].map(ref => ref.deref() !== undefined)])))
}

/** Exercise nullable metadata and mounted transfer ownership at both hosting
 * prefixes. Baseline mode records the two original failures before the fix. */
export async function runRegressions(context, origin, prefix, baseline = false) {
    for (const initial of ['null', 'undefined']) {
        const page = await context.newPage(), errors = []
        page.on('pageerror', error => errors.push(String(error)))
        await page.goto(`${origin}${prefix}ReactWorkflows/?regressions=1&metadata=${initial}`)
        if (baseline) {
            await page.waitForFunction(() => !document.querySelector('#TEST'))
            await page.waitForTimeout(100)
            assert.ok(errors.some(error => /Cannot convert undefined or null/.test(error)), `${initial} crashes before fix`)
            console.log(`Reproduced initial ${initial} metadata crash at ${prefix}`)
        } else {
            await page.waitForSelector('#TEST')
            assert.equal(await page.locator('#TEST').inputValue(), '9')
            for (const missing of ['null', 'undefined']) {
                await page.locator('#metadata-values').click()
                assert.equal(await page.locator('#TEST').evaluate(node => node.selectedIndex), -1)
                await page.locator('#rerender').click()
                assert.equal(await page.locator('#TEST').evaluate(node => node.selectedIndex), -1)
                await page.locator(`#metadata-${missing}`).click()
                assert.equal(await page.locator('#TEST').getAttribute('type'), 'number')
                assert.equal(await page.locator('#TEST').inputValue(), '9')
            }
            assert.equal(await page.locator('#changes').textContent(), '0', 'loading never emits change')
            await page.locator('#metadata-values').click()
            await page.locator('#TEST').selectOption('1')
            await page.locator('#metadata-bits').click()
            assert.equal(await page.locator('#bit_0_TEST').isChecked(), true)
            await page.locator('#bit_7_TEST').check()
            assert.equal(await page.locator('#raw').textContent(), '-127')
            await page.locator('#metadata-undefined').click()
            await page.locator('#metadata-range').click()
            assert.equal(await page.locator('#TEST').getAttribute('min'), '0')
            assert.equal(await page.locator('#TEST').getAttribute('max'), '10')
            assert.equal(await page.locator('#TEST').inputValue(), '-127')
            assert.equal(await page.locator('#changes').textContent(), '2')
            assert.deepEqual(errors, [])
        }
        await page.close()
    }
    for (const legacy of [true, false]) {
        const page = await context.newPage(), errors = []
        page.on('pageerror', error => errors.push(String(error)))
        await page.addInitScript(observeTransfers)
        await page.goto(`${origin}${prefix}ReactWorkflows/?regressions=1&metadata=ready`)
        await page.waitForSelector('#transfers')
        const session = await context.newCDPSession(page)
        if (legacy) {
            await page.addScriptTag({ url: `${origin}${prefix}Libraries/OpenIn.js` })
            await page.evaluate(() => {
                const controls = get_open_in(() => new File([new Uint8Array(4 * 1024 * 1024).fill(173)], 'original.bin'))
                controls.tippy_div.id = 'legacy-transfer'
                document.body.appendChild(controls.tippy_div)
            })
        } else await page.locator('#select-file').click()
        const button = page.locator(legacy ? '#legacy-transfer' : '#transfers').getByRole('button', { name: 'UAV Log Viewer', exact: true })
        await button.click()
        await page.waitForFunction(() => window.transferProbe.targets.length === 1)
        let live = await lifetimes(page, session)
        assert.deepEqual(live.buffers, [true], 'pending transfer must retain payload')
        assert.deepEqual(live.targets, [true], 'pending transfer must retain recipient')
        await page.waitForFunction(() => window.transferProbe.sent.length === 1)
        live = await lifetimes(page, session)
        const retained = baseline && !legacy
        assert.deepEqual(live.buffers, [retained], 'completed buffers while component remains mounted')
        assert.deepEqual(live.readers, [retained], 'completed readers while component remains mounted')
        assert.deepEqual(live.targets, [false])
        assert.equal(await page.locator('#transfers').count(), 1)
        assert.deepEqual(await page.evaluate(() => window.transferProbe.sent), [{ type: 'arrayBuffer', size: 4194304, first: 173, last: 173, origin: '*' }])
        console.log(`${legacy ? 'Legacy' : baseline ? 'Pre-fix React' : 'Fixed React'} Chromium lifetimes at ${prefix}: ${JSON.stringify(live)}`)
        if (!legacy && !baseline) {
            // Repeat, preserving two independent pending recipients across props.
            await button.click(); await button.click()
            await page.waitForFunction(() => window.transferProbe.targets.length === 3)
            await page.locator('#clear-file').click(); await page.locator('#rerender').click()
            live = await lifetimes(page, session)
            assert.deepEqual(live.buffers, [false, true, true])
            assert.deepEqual(live.targets, [false, true, true])
            await page.waitForFunction(() => window.transferProbe.sent.length === 3)
            assert.deepEqual(await lifetimes(page, session), { readers: [false, false, false], buffers: [false, false, false], targets: [false, false, false] })
            assert.deepEqual(await page.evaluate(() => window.transferProbe.files.map(ref => ref.deref() !== undefined)), [false, false, false], 'old File props have aged out of both React fibers')
            await page.locator('#select-file').click()
            await button.click(); await button.click()
            await page.waitForFunction(() => window.transferProbe.targets.length === 5)
            await page.locator('#transfer-toggle').click()
            assert.equal(await page.evaluate(() => window.transferProbe.timers.size), 0, 'unmount cancels all pending recipients')
            assert.deepEqual(await lifetimes(page, session), { readers: [false, false, false, false, false], buffers: [false, false, false, false, false], targets: [false, false, false, false, false] })
            await page.waitForTimeout(2100)
            assert.equal(await page.evaluate(() => window.transferProbe.sent.length), 3)
        }
        if (!baseline && !legacy) {
            // Retain the public disposer deliberately; cleanup must clear its
            // ownership slots, not merely rely on OpenIn removing its entry.
            await page.evaluate(() => {
                window.retainedDispose = window.regressionTransfer(new File([new Uint8Array(4194304).fill(173)], 'standalone.bin'),
                    { name: 'Test external recipient', path: 'about:blank', hookLoad: false, enabled: () => true })
            })
            await page.waitForFunction(() => window.transferProbe.sent.length === 4)
            const live = await lifetimes(page, session)
            assert.equal(live.buffers.at(-1), false)
            assert.equal(live.readers.at(-1), false)
            assert.equal(live.targets.at(-1), false)
            assert.equal(await page.evaluate(() => window.transferProbe.files.at(-1).deref() !== undefined), false)
            await page.evaluate(() => { window.retainedDispose(); window.retainedDispose() })
            assert.equal(await page.evaluate(() => window.transferProbe.sent.length), 4)
        }
        assert.deepEqual(errors, [])
        await session.detach()
        await page.close()
    }
}
