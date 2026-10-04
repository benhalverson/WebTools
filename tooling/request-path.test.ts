import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestPath } from './request-path.ts'

test('gateway accepts only origin-form targets without authority or fragments', () => {
    for (const path of [undefined, '', '//[', '//other/RotationCheck/', 'http://other/', '/\\other/', '/#fragment']) {
        assert.equal(requestPath(path), undefined, String(path))
    }
    assert.deepEqual(requestPath('/Tools/RotationCheck/?q=a%20b'), { path: '/Tools/RotationCheck/?q=a%20b', pathname: '/Tools/RotationCheck/' })
})
