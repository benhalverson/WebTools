/** Resolve the legacy nearest-hour Open-Meteo temperature, with caller-owned
 * cancellation and a five-second timeout. Failure leaves the ISA preset intact. */
export async function fetchGroundTemperature(
    lat: number,
    lng: number,
    when: Date,
    signal: AbortSignal,
): Promise<number | null> {
    const base =
        'latitude=' +
        lat.toFixed(4) +
        '&longitude=' +
        lng.toFixed(4) +
        '&hourly=temperature_2m&temperature_unit=celsius&timezone=GMT'
    const days = (Date.now() - when.getTime()) / 86400000
    const day = when.toISOString().slice(0, 10)
    const url =
        days <= 90
            ? 'https://api.open-meteo.com/v1/forecast?' +
              base +
              '&past_days=' +
              Math.min(92, Math.max(1, Math.ceil(days) + 1)) +
              '&forecast_days=1'
            : 'https://archive-api.open-meteo.com/v1/archive?' + base + '&start_date=' + day + '&end_date=' + day
    const controller = new AbortController()
    /** Release the request when the owning file session ends. */
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const timer = setTimeout(abort, 5000)
    try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) return null
        const json: unknown = await response.json()
        if (!json || typeof json !== 'object' || !('hourly' in json)) return null
        const hourly = json.hourly
        if (!hourly || typeof hourly !== 'object' || !('time' in hourly) || !('temperature_2m' in hourly)) return null
        const times = hourly.time,
            temps = hourly.temperature_2m
        if (!Array.isArray(times) || !Array.isArray(temps)) return null
        let best: number | null = null,
            distance = Infinity
        for (let i = 0; i < times.length; i++) {
            if (temps[i] == null || typeof times[i] !== 'string') continue
            const diff = Math.abs(Date.parse(times[i] + ':00Z') - when.getTime())
            if (diff < distance) {
                distance = diff
                best = typeof temps[i] === 'number' ? temps[i] : null
            }
        }
        return best !== null && isFinite(best) ? best : null
    } catch {
        return null
    } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
    }
}
