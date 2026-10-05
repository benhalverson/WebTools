const fs = require('node:fs');
const path = require('node:path');

/** Build both module formats against the unchanged codec boundary; copy declarations to each package scope. */
async function buildPackage() {
    const { build } = await import('vite');
    for (const format of ['es', 'cjs']) {
        const directory = format === 'es' ? 'esm' : 'cjs';
        await build({
            configFile: false,
            logLevel: 'warn',
            build: {
                outDir: `dist/${directory}`, emptyOutDir: false,
                lib: { entry: path.resolve('src/index.ts'), formats: [format], fileName: () => 'index.js' },
                rollupOptions: { external: ['@webtools/mavlink'] },
                minify: false,
            },
        });
    }
    fs.writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }));
    for (const file of fs.readdirSync('dist/esm').filter(file => file.endsWith('.d.ts'))) {
        fs.copyFileSync(`dist/esm/${file}`, `dist/cjs/${file}`);
    }
}
buildPackage().catch(error => { console.error(error); process.exitCode = 1; });
