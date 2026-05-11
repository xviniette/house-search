const DEV = false
const APP_URL = DEV ? "http://localhost:5500" : "https://xviniette.github.io/house-search"

function extractLeBonCoin() {
    const data = {}

    const nextData = document.querySelector("script#__NEXT_DATA__")
    if (nextData) {
        try {
            const json = JSON.parse(nextData.textContent)
            const ad = json?.props?.pageProps?.ad
            if (ad) {
                if (ad.location?.city) data.commune = ad.location.city
                if (ad.location?.zipcode) data.code_postal = ad.location.zipcode

                for (const attr of ad.attributes || []) {
                    const key = attr.key || attr.key_label || ""
                    const val = attr.value || attr.value_label || ""
                    if (key === "square") data.surface = parseInt(val, 10)
                    if (key === "real_estate_type") {
                        const m = { 1: "maison", 2: "appartement", 3: "terrain", 4: "parking", 5: "autre" }
                        data.type_batiment = m[val] || val
                    }
                    if (key === "energy_rate") data.etiquette_dpe = val.toUpperCase()
                    if (key.includes("date") && val.match(/^\d{4}-\d{2}-\d{2}/)) data.dpe_date = val.slice(0, 10)
                }

                if (!data.dpe_date && ad.body) {
                    const dates = [...ad.body.matchAll(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g)]
                    for (const d of dates) {
                        const year = parseInt(d[3])
                        const month = parseInt(d[2])
                        if (year >= 2020 && year <= 2030 && month >= 1 && month <= 12) {
                            data.dpe_date = `${d[3]}-${String(d[2]).padStart(2, "0")}-${String(d[1]).padStart(2, "0")}`
                            break
                        }
                    }
                }
            }
        } catch {}
    }

    if (!data.commune || !data.code_postal) {
        const loc = document.querySelector('[data-qa-id="adview_location_text"]')
        if (loc) {
            const t = loc.textContent.trim()
            const cp = t.match(/(\d{5})/)
            if (cp && !data.code_postal) data.code_postal = cp[1]
            const cm = t.match(/^([^0-9]+)/)
            if (cm && !data.commune) data.commune = cm[1].trim().replace(/,$/, "").trim()
        }
    }

    if (!data.surface) {
        const text = document.body.innerText
        const m = text.match(/Surface\s*(?:habitable\s*)?[:\s]*(\d+)\s*m²/i) || text.match(/(\d+)\s*m²/i)
        if (m) data.surface = parseInt(m[1], 10)
    }

    if (!data.conso) {
        const text = document.body.innerText
        const m = text.match(/(\d+)\s*kWh\s*(?:EP\s*)?\/\s*m[²2]/i)
        if (m) data.conso = parseInt(m[1], 10)
    }

    if (!data.ges) {
        const text = document.body.innerText
        const m = text.match(/(\d+)\s*kg\s*(?:ep\s*)?CO[₂2]\s*\/\s*m[²2]/i)
        if (m) data.ges = parseInt(m[1], 10)
    }

    if (!data.etiquette_dpe) {
        const el = document.querySelector('[data-qa-id="criteria_item_energy_rate"] .value')
        if (el) {
            const m = el.textContent.match(/([A-G])/i)
            if (m) data.etiquette_dpe = m[1].toUpperCase()
        }
    }

    const criteriaItems = document.querySelectorAll('[data-qa-id^="criteria_item_"]')
    for (const item of criteriaItems) {
        const label = (item.querySelector('[class*="Label"], .label, dt') || {}).textContent || ""
        const value = (item.querySelector('[class*="Value"], .value, dd') || {}).textContent || ""
        const lo = label.toLowerCase().trim()
        const v = value.trim()

        if (!data.surface && lo.includes("surface")) {
            const m = v.match(/(\d+)/)
            if (m) data.surface = parseInt(m[1], 10)
        }
        if (!data.type_batiment && lo.includes("type de bien")) {
            data.type_batiment = v.toLowerCase()
        }
        if (!data.etiquette_dpe && (lo.includes("classe énergie") || lo.includes("dpe"))) {
            const m = v.match(/([A-G])/i)
            if (m) data.etiquette_dpe = m[1].toUpperCase()
        }
    }

    if (!data.type_batiment) {
        const text = document.body.innerText
        const m = text.match(/Type de bien\s*[:\s]*(Maison|Appartement|Immeuble)/i)
        if (m) data.type_batiment = m[1].toLowerCase()
    }

    return data
}

function extractSeLoger() {
    const data = {}
    const text = document.body.innerText
    const raw = document.documentElement.innerHTML

    const cityM = raw.match(/av_city[\\"]+"?\s*[:,]\s*[\\"]+"?([^"\\]+)/)
    if (cityM) data.commune = cityM[1]

    const zipM = raw.match(/av_zip_code[\\"]+"?\s*[:,]\s*[\\"]+"?(\d{5})/)
    if (zipM) data.code_postal = zipM[1]

    const dpeM = raw.match(/av_energy_certificate[\\"]+"?\s*[:,]\s*[\\"]+"?([A-G])/i)
    if (dpeM) data.etiquette_dpe = dpeM[1].toUpperCase()

    const yearM = raw.match(/Année de construction[\\",]*[\\",]*value[\\",]*[\\",]*(\d{4})/i) || text.match(/Année de construction\s*(\d{4})/i)
    if (yearM) data.annee_construction = yearM[1]

    const consoM = text.match(/(\d+)\s*kWh\/m[²2][\.\s]*an/i) || raw.match(/(\d+)\s*kWh\/m/)
    if (consoM) data.conso = parseInt(consoM[1], 10)

    const gesM = text.match(/(\d+)\s*kg\s*CO[₂2]\/m[²2]/i) || raw.match(/(\d+)\s*kg\s*CO/)
    if (gesM) data.ges = parseInt(gesM[1], 10)

    const url = location.pathname
    if (!data.type_batiment) {
        if (url.includes("/maison/")) data.type_batiment = "maison"
        else if (url.includes("/appartement/")) data.type_batiment = "appartement"
    }

    if (!data.commune) {
        const m = url.match(/\/([\w-]+)-(\d{2})\//)
        if (m) data.commune = m[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    }

    const surfM = text.match(/(\d+)\s*m²/)
    if (surfM) data.surface = parseInt(surfM[1], 10)

    const title = document.querySelector("title")
    if (title) {
        const tm = title.textContent.match(/(\d+)\s*m²/)
        if (tm && !data.surface) data.surface = parseInt(tm[1], 10)
        if (!data.type_batiment) {
            const tt = title.textContent.match(/^(Maison|Appartement)/i)
            if (tt) data.type_batiment = tt[1].toLowerCase()
        }
    }

    return data
}

function extractJinka() {
    const data = {}
    const raw = document.documentElement.innerHTML
    const text = document.body.innerText

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

    const yearM = raw.match(/\\"construction_year\\":(\d{4})/) || raw.match(/\\"year\\":(\d{4})/)
    if (yearM) data.annee_construction = yearM[1]

    if (!data.etiquette_dpe) {
        const m = raw.match(/bg-dpe-([a-g])"><span[^>]*>([A-G])</)
        if (m) data.etiquette_dpe = m[2].toUpperCase()
    }

    if (!data.surface) {
        const m = text.match(/(\d+)\s*m[²2]/)
        if (m) data.surface = parseInt(m[1], 10)
    }

    if (!data.commune || !data.code_postal) {
        const og = document.querySelector('meta[property="og:title"]')
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

    const consoM = text.match(/(\d+)\s*kWh\/m[²2]/i)
    if (consoM) data.conso = parseInt(consoM[1], 10)

    const gesM = text.match(/(\d+)\s*kg\s*CO[₂2]\/m[²2]/i)
    if (gesM) data.ges = parseInt(gesM[1], 10)

    return data
}

function extractListingData() {
    const host = location.hostname
    if (host.includes("leboncoin")) return extractLeBonCoin()
    if (host.includes("seloger")) return extractSeLoger()
    if (host.includes("jinka")) return extractJinka()
    return {}
}

function buildAppUrl(data) {
    const params = new URLSearchParams()
    if (data.commune) params.set("commune", data.commune)
    if (data.surface) params.set("surface", data.surface)
    if (data.type_batiment) params.set("type_batiment", data.type_batiment)
    if (data.etiquette_dpe) params.set("etiquette_dpe", data.etiquette_dpe)
    if (data.annee_construction) params.set("annee_construction", data.annee_construction)
    if (data.conso) params.set("conso", data.conso)
    if (data.ges) params.set("ges", data.ges)
    if (data.dpe_date) params.set("dpe_date", data.dpe_date)
    params.set("from", "extension")
    return `${APP_URL}?${params}`
}

function injectPanel(data) {
    const existing = document.getElementById("dpe-finder-panel")
    if (existing) {
        const iframe = existing.querySelector("#dpe-finder-iframe")
        iframe.src = buildAppUrl(data)
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

function run() {
    const data = extractListingData()
    if (data.commune || data.code_postal) {
        injectPanel(data)
    }
}

let lastUrl = location.href

function watchNavigation() {
    const check = () => {
        if (location.href !== lastUrl) {
            lastUrl = location.href
            setTimeout(run, 2000)
        }
    }

    new MutationObserver(check).observe(document.body, { childList: true, subtree: true })

    const wrap = method => {
        const orig = history[method]
        history[method] = function () {
            const result = orig.apply(this, arguments)
            check()
            return result
        }
    }
    wrap("pushState")
    wrap("replaceState")
    window.addEventListener("popstate", check)
}

setTimeout(run, 2000)
watchNavigation()
