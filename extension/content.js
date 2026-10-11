const DEV = false
const APP_URL = DEV ? "http://localhost:5500" : "https://xviniette.github.io/house-search"

const initialPath = location.pathname

function parseJson(text) {
    try {
        return JSON.parse(text)
    } catch {}
}

function dpeLetter(value) {
    const v = String(value || "").trim().toUpperCase()
    return /^[A-G]$/.test(v) ? v : undefined
}

function findDpeDate(text) {
    const m = String(text || "").match(/(?:dpe|diagnostic|réalisé|établi)\D{0,60}(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})/i)
    if (!m || Number(m[2]) > 12) return undefined
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

function extractLeBonCoin(doc) {
    const ad = parseJson(doc.getElementById("__NEXT_DATA__")?.textContent)?.props?.pageProps?.ad
    if (!ad) return {}
    const attrs = Object.fromEntries((ad.attributes || []).map(a => [a.key, a.value]))
    return {
        commune: ad.location?.city,
        code_postal: ad.location?.zipcode,
        surface: parseInt(attrs.square, 10) || undefined,
        type_batiment: { 1: "maison", 2: "appartement" }[attrs.real_estate_type],
        etiquette_dpe: dpeLetter(attrs.energy_rate),
        dpe_date: findDpeDate(ad.body),
    }
}

function extractSeLoger(doc) {
    // Data is a JSON string literal: JSON.parse("{\"app_cldp\":...}")
    const literal = doc.getElementById("__UFRN_LIFECYCLE_SERVERREQUEST__")?.textContent.match(/JSON\.parse\(("[\s\S]*")\)/)?.[1]
    const classified = parseJson(parseJson(literal))?.app_cldp?.data?.classified
    if (!classified) return {}
    const sections = classified.sections || {}
    const space = sections.hardFacts?.facts?.find(f => f.type === "livingSpace")?.splitValue
    const scales = (sections.energy?.certificates || []).flatMap(c => c.scales || [])
    const rating = prefix => dpeLetter(scales.find(s => s.type?.startsWith(prefix))?.efficiencyClass?.rating)
    return {
        commune: sections.location?.address?.city,
        code_postal: sections.location?.address?.zipCode,
        surface: Math.round(parseFloat(String(space).replace(",", "."))) || undefined,
        type_batiment: { HOUSE: "maison", APARTMENT: "appartement", BUILDING: "immeuble" }[classified.rawData?.propertyType],
        etiquette_dpe: rating("FR_ENERGY"),
        dpe_date: findDpeDate(sections.description?.description),
    }
}

function extractJinka(doc) {
    const data = {}
    const raw = doc.documentElement.innerHTML
    const text = doc.body.innerText

    const cityM = raw.match(/\\"city\\":\\"([^"\\]+)/)
    if (cityM) data.commune = cityM[1]

    const zipM = raw.match(/\\"postal_code\\":\\"(\d{5})/)
    if (zipM) data.code_postal = zipM[1]

    const areaM = raw.match(/\\"area\\":(\d+)/)
    if (areaM) data.surface = parseInt(areaM[1], 10)

    const typeM = raw.match(/\\"type\\":\\"(Maison|Appartement|Studio|Loft|Terrain)/i)
    if (typeM) data.type_batiment = typeM[1].toLowerCase()

    const dpeM = raw.match(/\\"energy_dpe\\":\\"([A-G])/i)
    if (dpeM) data.etiquette_dpe = dpeM[1].toUpperCase()

    if (!data.etiquette_dpe) {
        const m = raw.match(/bg-dpe-([a-g])"><span[^>]*>([A-G])</)
        if (m) data.etiquette_dpe = m[2].toUpperCase()
    }

    if (!data.surface) {
        const m = text.match(/(\d+)\s*m[²2]/)
        if (m) data.surface = parseInt(m[1], 10)
    }

    if (!data.commune || !data.code_postal) {
        const og = doc.querySelector('meta[property="og:title"]')
        if (og) {
            const t = og.getAttribute("content") || ""
            const cityZip = t.match(/-\s*([^()]+?)\s*\((\d{5})\)/)
            if (cityZip) {
                if (!data.commune) data.commune = cityZip[1].trim()
                if (!data.code_postal) data.code_postal = cityZip[2]
            }
            if (!data.type_batiment) {
                const tt = t.match(/^(Maison|Appartement|Studio|Loft)/i)
                if (tt) data.type_batiment = tt[1].toLowerCase()
            }
        }
    }

    return data
}

async function extractBienIci(id) {
    const res = await fetch(`https://www.bienici.com/realEstateAd.json?id=${encodeURIComponent(id)}`, { credentials: "include" })
    if (!res.ok) return {}
    const ad = await res.json()
    const types = {
        house: "maison",
        townhouse: "maison",
        villa: "maison",
        chalet: "maison",
        castle: "maison",
        manor: "maison",
        flat: "appartement",
        loft: "appartement",
        duplex: "appartement",
        studio: "appartement",
        building: "immeuble",
    }
    return {
        commune: ad.city,
        code_postal: ad.postalCode,
        surface: Math.round(ad.surfaceArea) || undefined,
        type_batiment: types[ad.propertyType],
        etiquette_dpe: dpeLetter(ad.energyClassification),
        dpe_date: String(ad.energyPerformanceDiagnosticDate || "").match(/\d{4}-\d{2}-\d{2}/)?.[0],
    }
}

// After an in-app navigation the page's embedded data is stale, so refetch the ad HTML
async function fromPage(extract) {
    const data = location.pathname === initialPath ? extract(document) : {}
    if (data.commune) return data
    const res = await fetch(location.href, { credentials: "include" })
    return extract(new DOMParser().parseFromString(await res.text(), "text/html"))
}

const SITES = [
    { host: "leboncoin.fr", adId: /^\/ad\/[^/]+\/(\d+)/, extract: () => fromPage(extractLeBonCoin) },
    { host: "seloger.com", adId: /^\/annonces?\/.+\/(\w+?)(?:\.htm)?$/, extract: () => fromPage(extractSeLoger) },
    { host: "bienici.com", adId: /^\/annonce\/.+\/([^/]+)$/, extract: extractBienIci },
    { host: "jinka.fr", adId: /^\/ad\/(.+)/, extract: () => fromPage(extractJinka) },
]

function departement(cp) {
    if (/^9[78]/.test(cp)) return cp.slice(0, 3)
    if (cp.startsWith("20")) return cp < "20200" ? "2A" : "2B"
    return cp.slice(0, 2)
}

function buildAppUrl({ commune, code_postal, ...data }) {
    const params = new URLSearchParams()
    // The app disambiguates homonyms with "Ville (dept)"
    params.set("commune", code_postal ? `${commune} (${departement(String(code_postal))})` : commune)
    for (const [key, val] of Object.entries(data)) {
        if (val) params.set(key, val)
    }
    params.set("from", "extension")
    return `${APP_URL}?${params}`
}

function injectPanel(data) {
    const existing = document.getElementById("dpe-finder-iframe")
    if (existing) {
        // Setting src would push a history entry, so the site's back button would navigate the iframe instead of the page
        existing.contentWindow.location.replace(buildAppUrl(data))
        return
    }

    const wrapper = document.createElement("div")
    wrapper.id = "dpe-finder-panel"

    const iframe = document.createElement("iframe")
    iframe.src = buildAppUrl(data)
    iframe.id = "dpe-finder-iframe"

    const toggle = document.createElement("button")
    toggle.id = "dpe-finder-toggle"
    toggle.textContent = "DPE"
    toggle.title = "Ouvrir/Fermer DPE Finder"

    let open = false
    toggle.addEventListener("click", () => {
        open = !open
        wrapper.classList.toggle("open", open)
    })

    wrapper.appendChild(toggle)
    wrapper.appendChild(iframe)
    document.body.appendChild(wrapper)
}

function removePanel() {
    document.getElementById("dpe-finder-panel")?.remove()
}

const site = SITES.find(s => location.hostname.endsWith(s.host))
let currentId = null

async function refresh() {
    const id = location.pathname.match(site.adId)?.[1]
    if (id === currentId) return
    currentId = id
    if (!id) return removePanel()

    const data = await site.extract(id).catch(() => ({}))
    if (id !== currentId) return
    if (data.commune) injectPanel(data)
    else removePanel()
}

// SPAs (Bien'ici, LeBonCoin, SeLoger) switch ads without reloading, and pushState can't be hooked from the isolated world
setInterval(refresh, 500)
refresh()
