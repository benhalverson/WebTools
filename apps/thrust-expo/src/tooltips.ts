import { useEffect, type RefObject } from 'react'

interface TooltipInstance { destroy(): void }
/** Pinned Tippy accepts an element list and returns independently disposable instances. */
type Tippy = (targets: Element[], options: { content: (element: Element) => string; maxWidth: number }) => TooltipInstance[]

/** Attach the original styled tooltips only to owned nodes; always release document listeners and poppers. */
export function useTooltips(root: RefObject<HTMLElement | null>): void {
    useEffect(() => {
        const candidate: unknown = Reflect.get(window, 'tippy')
        if (typeof candidate !== 'function' || !root.current) return
        const targets = [...root.current.querySelectorAll('.tooltip-trigger')]
        const tippy = candidate as Tippy
        const instances = tippy(targets, {
            /** Preserve the exact help text shared with the native fallback title. */
            content: element => element.getAttribute('title') ?? '', maxWidth: 750,
        })
        // Avoid a second native tooltip when the pinned renderer is available.
        const titles = targets.map(element => element.getAttribute('title') ?? '')
        for (const target of targets) target.removeAttribute('title')
        return () => {
            for (const instance of instances) instance.destroy()
            targets.forEach((element, index) => element.setAttribute('title', titles[index] ?? ''))
        }
    }, [root])
}
