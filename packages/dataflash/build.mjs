import { mkdir, copyFile } from 'node:fs/promises'
await mkdir(new URL('./dist/vendor/', import.meta.url), { recursive: true })
for (const name of ['parser.js', 'LICENSE']) {
  await copyFile(new URL(`../../modules/JsDataflashParser/${name}`, import.meta.url), new URL(`./dist/vendor/${name}`, import.meta.url))
}
