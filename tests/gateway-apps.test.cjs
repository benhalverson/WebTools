const assert = require('node:assert/strict');
const { test } = require('node:test');

test('gateway defaults to every registered app and validates explicit selections before startup', async () => {
    const { selectedApplications } = await import('../tooling/gateway-apps.ts');
    const { applications } = await import('../packages/routing/src/index.ts');
    assert.deepEqual(selectedApplications(['--port', '0']), Object.keys(applications));
    assert.deepEqual(selectedApplications(['--apps', 'portal,rotationCheck,dfuLoader']), ['portal', 'rotationCheck', 'dfuLoader']);
    for (const args of [['--apps'], ['--apps', ''], ['--apps', '--port'], ['--apps', 'portal,'], ['--apps', '__proto__'], ['--apps', 'unknown'], ['--apps', 'portal,portal'], ['--apps', 'portal', '--apps', 'dfuLoader']]) {
        assert.throws(() => selectedApplications(args), JSON.stringify(args));
    }
});

test('HTTP and HMR route resolution preserves selected origins and denies unstarted owners', async () => {
    const { gatewayRoute } = await import('../tooling/gateway-apps.ts');
    const origins = { portal: 'http://127.0.0.1:1', rotationCheck: 'http://127.0.0.1:2', dfuLoader: 'http://127.0.0.1:3' };
    for (const prefix of ['/', '/Tools/WebTools/']) {
        for (const [path, target] of [['', origins.portal], ['RotationCheck/@vite/client?x=1', origins.rotationCheck], ['DFULoader/dfu.js', origins.dfuLoader], ['DFULoader/not-found', origins.dfuLoader]]) {
            assert.deepEqual(gatewayRoute(prefix + path, prefix, origins), { target, path: prefix + path });
        }
        assert.deepEqual(gatewayRoute(prefix + 'MAGFit/', prefix, origins), { status: 503 });
        assert.deepEqual(gatewayRoute(prefix + 'MAGFit/@vite/client', prefix, origins), { status: 503 });
        assert.deepEqual(gatewayRoute(prefix, prefix, { dfuLoader: origins.dfuLoader }), { status: 503 });
    }
    assert.deepEqual(gatewayRoute('//other/DFULoader/', '/', origins), { status: 400 });
});
