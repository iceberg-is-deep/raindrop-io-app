function getMeta() {
    const elem = [...document.querySelectorAll(
        [...arguments]
            .map(key => `meta[name="${key}"], meta[property="${key}"]`)
            .join(', ')
    )].at(-1) //last occurrence
    if (!elem) return null

    const value = elem.value || elem.content
    return String(value).trim().substr(0, 10000)
}

function getJsonLd() {
    let item = {}

    try {
        for (const elem of [...document.querySelectorAll('script[type="application/ld+json"]')]) {
            const json = JSON.parse(elem.innerText) || {}
            if (typeof json['@context'] != 'string' || !json['@context'].includes('schema.org')) continue
            if (json.url && !similarURL(json.url)) continue
            if (json['@id'] && URL.canParse(json['@id']) && !similarURL(json['@id'])) continue

            if (json.name || json.headline) {
                item = json
                break
            }
            else if (json['@graph']) {
                item = json['@graph'].find(graph => similarURL(graph.url))
                if (Object.keys(item).length) break
            }
        }
    } catch (e) { console.log(e) }

    if (Array.isArray(item.image) && item.image.length)
        item.image = { url: item.image[0] }
    else if (!item.image || !item.image.url)
        if (Array.isArray(item.thumbnailUrl) && item.thumbnailUrl.length)
            item.image = { url: item.thumbnailUrl[0] }

    return item
}

function grabImages() {
    let candidates = []

    try {
        const viewportTop = window.scrollY
        const viewportBottom = viewportTop + window.innerHeight

        // Helper to compute viewport overlap score
        function viewportOverlap(el) {
            const rect = el.getBoundingClientRect()
            const elTop = rect.top + viewportTop
            const elBottom = rect.bottom + viewportTop
            return Math.max(0, Math.min(elBottom, viewportBottom) - Math.max(elTop, viewportTop))
        }

        // Prefer searching inside the topmost visible dialog/modal if one is open
        // (e.g. Facebook post popup) to avoid picking up background images
        let scope = document
        const dialogs = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')]
            .filter(el => {
                const rect = el.getBoundingClientRect()
                return rect.width > 100 && rect.height > 100 && el.offsetParent !== null
            })
        if (dialogs.length > 0) {
            // Use the last (topmost) visible dialog
            scope = dialogs[dialogs.length - 1]
        }

        // 1. Collect from <img> tags
        for (const img of scope.querySelectorAll('img')) {
            if (!img.complete || !img.src || img.src.includes('.svg')) continue
            if (!img.offsetParent) continue //is hidden
            if (img.closest('header, footer, aside')) continue //minor image

            const width = Math.min(img.naturalWidth, img.width)
            const height = Math.min(img.naturalHeight, img.height)

            if (width > 100 && height > 100) {
                let url
                try { url = new URL(img.currentSrc || img.src, location.href).href } catch (e) { }
                if (!url) continue
                candidates.push({ url, overlap: viewportOverlap(img) })
            }
        }

        // 2. Collect from elements with inline background-image: url(...)
        const bgUrlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i
        for (const el of scope.querySelectorAll('[style*="background-image"]')) {
            if (!el.offsetParent) continue //is hidden
            if (el.closest('header, footer, aside')) continue //minor element

            const match = bgUrlRe.exec(el.style.backgroundImage || el.getAttribute('style') || '')
            if (!match) continue

            const rawUrl = match[1].trim()
            if (!rawUrl || rawUrl.includes('.svg')) continue

            let url
            try { url = new URL(rawUrl, location.href).href } catch (e) { continue }

            const rect = el.getBoundingClientRect()
            if (rect.width < 100 || rect.height < 100) continue

            candidates.push({ url, overlap: viewportOverlap(el) })
        }
    } catch (e) { console.log(e) }

    // Sort by viewport overlap descending (visible images first), deduplicate
    candidates.sort((a, b) => b.overlap - a.overlap)
    const seen = new Set()
    return candidates.filter(c => seen.has(c.url) ? false : (seen.add(c.url), true)).slice(0, 9).map(c => c.url)
}


function similarURL(url) {
    if (!url)
        return false
    const { pathname, search } = new URL(url, location.href)
    if (search && search != location.search)
        return false
    if (pathname != location.pathname)
        return false
    return true
}

function htmlDecode(input) {
    try {
        var doc = new DOMParser().parseFromString(input || '', 'text/html');
        return doc.documentElement.textContent;
    } catch (e) {
        console.error(e)
        return input
    }
}

function getItem() {
    let item = {
        link: location.href
    }

    const canonical = getMeta('twitter:url', 'og:url')
    const ld = getJsonLd()

    //use open-graph or twitter cards (if page is not spa)
    if (
        location.pathname == '/' ||
        similarURL(canonical) ||
        !window.history.state
    )
        item = {
            ...item,
            title: getMeta('twitter:title', 'og:title') || getMeta('title') || document.title,
            excerpt: getMeta('twitter:description', 'og:description') || getMeta('description'),
            cover: getMeta('twitter:image', 'twitter:image:src', 'og:image', 'og:image:src'),
        }
    //use json ld schema
    else if (ld.name || ld.headline)
        item = {
            ...item,
            title: htmlDecode(ld.name || ld.headline),
            excerpt: htmlDecode(ld.description),
            cover: ld.image && ld.image.url
        }
    //fallback. do not set any data from meta tags here!!
    else
        item = {
            ...item,
            title: document.title.replace(new RegExp(`^${location.hostname.replace('www.', '')}.`, 'i'), '').trim() //remove domain name from title (hi amazon!)
        }

    //validate title
    if (!item.title || /^home$/i.test(item.title))
        item.title = document.title

    //validate excerpt
    if (item.excerpt == item.title)
        item.excerpt = ''

    //fallback to body text if it's more comprehensive than the meta description
    try {
        let fallbackText = '';
        let res = [];

        if (location.hostname.includes('facebook.com')) {
            // Desktop view
            const sDesktopView = 'div[data-ad-rendering-role="story_message"]';
            const elDesktops = document.querySelectorAll(sDesktopView);
            if (elDesktops.length > 0) {
                res.push(elDesktops[elDesktops.length - 1].innerText);
            }

            // Mobile web view (light mode and dark mode on m.facebook.com) — post body is the
            // tallest ServerTextArea that is outside comment containers
            if (res.length === 0) {
                const elPostBody = [...document.querySelectorAll('[data-mcomponent="ServerTextArea"][data-type="text"]')]
                    .filter(el => {
                        if (el.closest('[data-tracking-duration-id]')) return false // skip comments
                        return parseFloat(el.style.height || '0') > 100 // must have real height
                    })
                    .sort((a, b) => parseFloat(b.style.height || '0') - parseFloat(a.style.height || '0'))[0]

                if (elPostBody) {
                    const spans = [...elPostBody.querySelectorAll('.f1')]
                    if (spans.length > 0)
                        res.push(spans.map(s => s.innerText).join('\n'))
                }
            }
        } else {
            res = [...document.querySelectorAll('p')]
                .map(el => el.innerText.trim())
                .filter(text => text.length > 40);
        }

        fallbackText = res.join('\n\n').trim();

        // If the parsed page text provides significantly more context than the metadata 
        // description (or if metadata was completely missing/truncated), we use it.
        const excerptLength = item.excerpt ? item.excerpt.length : 0;
        if (fallbackText && fallbackText.length > excerptLength) {
            item.excerpt = fallbackText;
        }
    } catch (e) { }

    //validate cover url
    if (item.cover)
        try {
            item.cover = new URL(item.cover, location.href).href
        } catch (e) {
            delete item.cover
        }

    //grab images
    let images = [
        ...(item.cover ? [item.cover] : []),
        ...grabImages()
    ].filter((value, index, self) => self.indexOf(value) === index)

    if (images.length) {
        item.media = images.map(link => ({
            type: 'image',
            link
        }))

        if (!item.cover)
            item.cover = images[0]
    }

    //limit length
    if (item.title && item.title.length)
        item.title = item.title.substr(0, 1000)

    if (item.excerpt && item.excerpt.length)
        item.excerpt = item.excerpt.substr(0, 10000)

    //highlights
    try {
        const selectedText = window.getSelection().getRangeAt(0).toString().trim()
        if (selectedText != '')
            item.highlights = [{ _id: String(new Date().getTime()), text: selectedText }]
    } catch (e) { }

    //remove empty keys
    for (const i in item)
        if (!item[i])
            delete item[i]

    return item
}

function parse() {
    try {
        return getItem()
    }
    catch (e) {
        console.log(e)
        return {
            link: location.href,
            title: document.title
        }
    }
}

parse();