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

        for (const img of document.querySelectorAll('img')) {
            if (!img.complete || !img.src || img.src.includes('.svg')) continue
            if (!img.offsetParent) continue //is hidden
            if (img.closest('header, footer, aside')) continue //minor image

            const width = Math.min(img.naturalWidth, img.width)
            const height = Math.min(img.naturalHeight, img.height)

            if (width > 100 && height > 100) {
                let url
                try { url = new URL(img.currentSrc || img.src, location.href).href } catch (e) { }
                if (!url) continue

                // Score by how much of the image overlaps with the viewport
                const rect = img.getBoundingClientRect()
                const imgTop = rect.top + viewportTop
                const imgBottom = rect.bottom + viewportTop
                const overlapTop = Math.max(imgTop, viewportTop)
                const overlapBottom = Math.min(imgBottom, viewportBottom)
                const overlap = Math.max(0, overlapBottom - overlapTop)

                candidates.push({ url, overlap })
            }
        }
    } catch (e) { console.log(e) }

    // Sort by viewport overlap descending (visible images first)
    candidates.sort((a, b) => b.overlap - a.overlap)

    return candidates.slice(0, 9).map(c => c.url)
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
            const sMobileView = 'div.bg-s7.m:nth-of-type(4) > .m';
            const sDesktopView = 'div[data-ad-rendering-role="story_message"]';
            const elMobile = document.querySelector(sMobileView);
            const elDesktops = document.querySelectorAll(sDesktopView);

            if (elDesktops.length > 0) {
                res.push(elDesktops[elDesktops.length - 1].innerText);
            }

            if (elMobile) {
                res.push(elMobile.innerText);
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