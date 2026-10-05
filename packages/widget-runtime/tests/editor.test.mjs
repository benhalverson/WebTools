import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import test from 'node:test'
import { registerWidgetFields, registerWidgetEditor } from '../dist/index.js'

const legacy = execFileSync('git', ['show', 'e4d333f04cd3eb3da98fed787d5f3ce1c18ed7bd:VideoOverlay/WidgetEdit.js'], { encoding: 'utf8' })

/** Give each fake vendor constructor its own fresh edit schema, like Formio. */
function component() {
    return class {
        /** Merge saved component overrides after defaults. */
        static schema(...fields) { return Object.assign({}, ...fields) }
        /** Return a representative schema with allowed and disallowed nested settings. */
        static editForm() { return { components: [{ components: [
            { key: 'display', components: ['label', 'description', 'tooltip', 'hidden'].map(key => ({ key })) },
            { key: 'data', components: ['defaultValue', 'data.values', 'values', 'multiple', 'storage'].map(key => ({ key, components: [{ key: 'shortcut' }, { key: 'value' }] })) },
            { key: 'api', components: [{ key: 'key' }, { key: 'tags' }] },
            { key: 'validation', components: [{ key: 'required' }] },
        ] }] } }
    }
}

/** Compare the migrated filtering to the actual branch-base editor function, not a duplicate oracle. */
test('shared editor preserves the legacy restricted field settings and is idempotent', () => {
    const names = ['select', 'input', 'textfield', 'number', 'checkbox', 'selectboxes', 'file', 'radio', 'htmlelement', 'columns', 'fieldset', 'panel', 'table', 'tabs']
    const components = Object.fromEntries(names.map(name => [name, component()]))
    const formio = { Components: { components }, use(plugin) { Object.assign(components, plugin.components) } }
    registerWidgetFields(formio, {})
    delete components.mavlinkmsg
    delete components.mavlinkfield
    const start = legacy.indexOf('    function strip_component(')
    const end = legacy.indexOf('\n    strip_component(Formio.', start)
    const context = vm.createContext({ target: { editForm: component().editForm } })
    vm.runInContext(legacy.slice(start, end), context)
    vm.runInContext('strip_component(target, {display:["label","description","tooltip"],data:["defaultValue","values"],api:["key"]}, "shortcut")', context)
    const expected = JSON.stringify(vm.runInContext('target.editForm()', context))
    registerWidgetEditor(formio)
    assert.equal(JSON.stringify(components.radio.editForm()), expected)
    assert.equal(components.color.builderInfo.title, 'Color picker')
    const before = JSON.stringify(components.color.editForm())
    registerWidgetEditor(formio)
    assert.equal(JSON.stringify(components.color.editForm()), before)
})
