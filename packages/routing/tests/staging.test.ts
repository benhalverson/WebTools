import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { isStrictDescendant } from '../src/path-containment.ts'
import { stageRuntimeAssets } from '../src/tooling.ts'

test('containment accepts descendants with POSIX and Windows path semantics', () => {
    for (const [paths, root] of [[posix, '/repo'], [win32, 'C:\\repo']] as const) {
        for (const file of ['asset.js', 'nested/asset.js', '..assets/file.js']) {
            assert.equal(isStrictDescendant(root, paths.resolve(root, file), paths), true, `${root}: ${file}`)
        }
        for (const file of ['', '.', '..', '../outside.js', '../repo-other/asset.js', 'nested/../../outside.js']) {
            assert.equal(isStrictDescendant(root, paths.resolve(root, file), paths), false, `${root}: ${file}`)
        }
        assert.equal(isStrictDescendant(root + paths.sep, paths.resolve(root, 'asset.js'), paths), true)
        const filesystemRoot = paths.parse(root).root
        assert.equal(isStrictDescendant(filesystemRoot, paths.resolve(root, 'asset.js'), paths), true)
        assert.equal(isStrictDescendant(filesystemRoot, filesystemRoot, paths), false)
    }
    assert.equal(isStrictDescendant('C:\\repo', 'D:\\repo\\asset.js', win32), false)
    assert.equal(isStrictDescendant('C:\\repo', 'c:\\REPO\\nested\\asset.js', win32), true)
    assert.equal(isStrictDescendant('C:/repo', 'C:\\repo\\nested/asset.js', win32), true)
    assert.equal(isStrictDescendant('\\\\server\\share\\repo', '\\\\server\\share\\repo\\asset.js', win32), true)
    assert.equal(isStrictDescendant('\\\\server\\share\\', '\\\\server\\share\\asset.js', win32), true)
    assert.equal(isStrictDescendant('\\\\server\\share\\repo', '\\\\server\\other\\repo\\asset.js', win32), false)
    assert.equal(isStrictDescendant('\\\\server\\share\\repo', '\\\\other\\share\\repo\\asset.js', win32), false)
})

test('staging copies nested files byte-for-byte and replaces the old staging tree', async t => {
    const temp = await realpath(await mkdtemp(join(tmpdir(), 'webtools-staging-')))
    t.after(() => rm(temp, { recursive: true, force: true }))
    const root = join(temp, 'repo')
    const destination = join(temp, 'staged')
    await mkdir(join(root, 'runtime'), { recursive: true })
    await mkdir(destination)
    const bytes = Buffer.from([0, 255, 13, 10, 128])
    await writeFile(join(root, 'runtime', 'asset.bin'), bytes)
    await writeFile(join(destination, 'stale.txt'), 'old')
    await stageRuntimeAssets(root, destination, { 'nested/asset.bin': 'runtime/asset.bin' })
    assert.deepEqual(await readFile(join(destination, 'nested', 'asset.bin')), bytes)
    await assert.rejects(lstat(join(destination, 'stale.txt')), { code: 'ENOENT' })
    assert.deepEqual(await readFile(join(root, 'runtime', 'asset.bin')), bytes)
})

test('unsafe or absent assets are rejected before deleting any existing staging files', async t => {
    const temp = await realpath(await mkdtemp(join(tmpdir(), 'webtools-staging-')))
    t.after(() => rm(temp, { recursive: true, force: true }))
    const root = join(temp, 'repo')
    const destination = join(temp, 'staged')
    await mkdir(join(root, 'directory'), { recursive: true })
    await mkdir(destination)
    await mkdir(join(temp, 'repo-other'))
    await writeFile(join(root, 'valid.bin'), 'valid')
    await writeFile(join(temp, 'outside.bin'), 'outside')
    await writeFile(join(temp, 'repo-other', 'asset.bin'), 'sibling')
    const sentinel = join(destination, 'sentinel.txt')
    await writeFile(sentinel, 'keep')
    for (const source of ['missing.bin', 'directory', '.', '../outside.bin', '../repo-other/asset.bin']) {
        await assert.rejects(stageRuntimeAssets(root, destination, { 'valid.bin': 'valid.bin', 'bad.bin': source }), /Missing or unsafe runtime asset/)
        assert.equal(await readFile(sentinel, 'utf8'), 'keep', source)
    }
    for (const target of ['.', '..', '../escaped.bin', '../staged-other/asset.bin', join(temp, 'absolute.bin')]) {
        await assert.rejects(stageRuntimeAssets(root, destination, { 'valid.bin': 'valid.bin', [target]: 'valid.bin' }), /Unsafe asset destination/)
        assert.equal(await readFile(sentinel, 'utf8'), 'keep', target)
    }
    await assert.rejects(lstat(join(destination, 'valid.bin')), { code: 'ENOENT' })
    await assert.rejects(lstat(join(temp, 'escaped.bin')), { code: 'ENOENT' })
})

test('staging retains rejection of symlink files and symlinked ancestor directories', async t => {
    const temp = await realpath(await mkdtemp(join(tmpdir(), 'webtools-staging-')))
    t.after(() => rm(temp, { recursive: true, force: true }))
    const root = join(temp, 'repo')
    const destination = join(temp, 'staged')
    await mkdir(join(root, 'real'), { recursive: true })
    await mkdir(destination)
    await writeFile(join(root, 'real', 'asset.bin'), 'asset')
    await writeFile(join(destination, 'sentinel.txt'), 'keep')
    try {
        await symlink(join(root, 'real', 'asset.bin'), join(root, 'link.bin'), 'file')
        await symlink(join(root, 'real'), join(root, 'linked-directory'), 'junction')
    } catch (error) {
        if (process.platform === 'win32' && error instanceof Error && 'code' in error && error.code === 'EPERM') {
            t.skip('Creating Windows symlinks requires privileges or Developer Mode')
            return
        }
        throw error
    }
    for (const source of ['link.bin', 'linked-directory/asset.bin']) {
        await assert.rejects(stageRuntimeAssets(root, destination, { 'asset.bin': source }), /Missing or unsafe runtime asset/)
        assert.equal(await readFile(join(destination, 'sentinel.txt'), 'utf8'), 'keep', source)
    }
})
