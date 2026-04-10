async function loadJSON(path) {
    try {
        const ts = Date.now();
        const sep = path.indexOf('?') === -1 ? '?' : '&';
        const res = await fetch(path + sep + '_t=' + ts);
        if (!res.ok) {
            console.warn('Failed to load', path, 'status:', res.status);
            return null;
        }
        return await res.json();
    } catch (e) {
        console.warn('Error loading', path, e);
        return null;
    }
}

function formatNewsDate(isoDate) {
    // "2026-02-27" -> "2-27 Wed"
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    // Use UTC to avoid timezone shifting the day
    const dt = new Date(Date.UTC(y, m - 1, d));
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return `${m}-${String(d).padStart(2,'0')} ${days[dt.getUTCDay()]}`;
}

function categoryClass(cat) {
    const c = (cat || '').toLowerCase();
    if (c.includes('platform'))   return 'cat-platform';
    if (c.includes('used'))       return 'cat-used-evs';
    if (c.includes('lending'))    return 'cat-lending';
    if (c.includes('showroom'))   return 'cat-showroom';
    if (c.includes('sentiment'))  return 'cat-sentiment';
    if (c.includes('narrative'))  return 'cat-narrative';
    if (c.includes('fuel'))       return 'cat-fuel-price';
    if (c.includes('market'))     return 'cat-market-data';
    if (c.includes('policy'))     return 'cat-policy';
    if (c.includes('macro'))      return 'cat-macro';
    return '';
}

function renderMeta(meta, articleCount) {
    document.getElementById('brent-badge').textContent = `${meta.brent}`;
    document.getElementById('date-badge').textContent = meta.date;
    document.getElementById('footer-date').textContent = `· ${meta.last_updated}`;
    if (articleCount) document.getElementById('article-count').textContent = articleCount;

    // Fetch live Brent price
    fetch('/api/brent')
        .then(r => r.json())
        .then(d => {
            if (d.price) {
                document.getElementById('brent-badge').textContent = `$${parseFloat(d.price).toFixed(0)}/bbl`;
            }
        })
        .catch(() => {}); // keep static fallback
}

function renderCommentary(commentary) {
    const ul = document.getElementById('commentary-list');
    ul.innerHTML = '';
    commentary.bullets.forEach(b => {
        const li = document.createElement('li');
        li.textContent = b;
        ul.appendChild(li);
    });
}

function renderHighlights(highlights) {
    const ul = document.getElementById('highlights-list');
    if (!ul) return;
    ul.innerHTML = '';
    if (highlights.week) {
        const weekSpan = document.getElementById('highlights-week');
        if (weekSpan) weekSpan.textContent = '— ' + highlights.week;
    }
    highlights.bullets.forEach(b => {
        const li = document.createElement('li');
        li.textContent = b;
        ul.appendChild(li);
    });
}

function renderTracker(tracker, indicatorLinks) {
    const table = document.getElementById('tracker-table');
    const countries = tracker.countries;
    indicatorLinks = indicatorLinks || {};

    // Default-visible Tier 1 markets (US-led, then Europe, then APAC core)
    const DEFAULT_VISIBLE = new Set(['US', 'Australia', 'UK', 'Germany', 'France', 'South Korea', 'Vietnam']);
    const isExtra = (c) => !DEFAULT_VISIBLE.has(c);

    // Header row — Source moved to last column
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `<th>Metric</th>`;
    countries.forEach((c, idx) => {
        const th = document.createElement('th');
        th.textContent = c;
        if (isExtra(c)) th.classList.add('extra-country-col');
        headerRow.appendChild(th);
    });
    const srcTh = document.createElement('th');
    srcTh.textContent = 'Source';
    headerRow.appendChild(srcTh);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // GT prefix detection helpers
    const GT_PREFIX = 'Google searches:';
    const GT_KEYWORD_MAP = {
        '"electric car"': 'electric cars',
        '"EV"': 'EV',
        '"used EV"': 'used EV',
    };

    // Body
    const tbody = document.createElement('tbody');

    tracker.sections.forEach(section => {
        // Section header row
        const sectionRow = document.createElement('tr');
        sectionRow.className = 'section-header';
        const sectionTd = document.createElement('td');
        sectionTd.colSpan = countries.length + 2;
        sectionTd.textContent = section.name;
        sectionRow.appendChild(sectionTd);
        tbody.appendChild(sectionRow);

        // Reorder metrics: move GT rows after apps row
        const gtMetrics = section.metrics.filter(m => m.label.startsWith(GT_PREFIX));
        const nonGtMetrics = section.metrics.filter(m => !m.label.startsWith(GT_PREFIX));
        const orderedMetrics = [...nonGtMetrics, ...gtMetrics];

        // Insert GT sub-header just before first GT row
        let gtGroupInserted = false;

        orderedMetrics.forEach(metric => {
            const isGT = metric.label.startsWith(GT_PREFIX);

            if (isGT && !gtGroupInserted) {
                gtGroupInserted = true;
                const subRow = document.createElement('tr');
                subRow.className = 'subgroup-header';
                const subTd = document.createElement('td');
                subTd.colSpan = countries.length + 2;
                subTd.textContent = 'Google Searches (% chg, Feb 25 → Mar 29)';
                subRow.appendChild(subTd);
                tbody.appendChild(subRow);
            }

            // Determine how many rows this metric needs (split by \n\n in any cell)
            const isGasRow = metric.label.toLowerCase().includes('fuel price') || metric.label.toLowerCase().includes('gasoline');
            const isGoogleRow = metric.label.toLowerCase().startsWith('google:');
            const splitParts = metric.values.map(v => {
                const txt = (v.value || '').trim();
                if (!txt || txt === '—') return [];
                // Don't split GT/gas rows — they have their own structured rendering
                if (isGT || isGasRow) return [txt];
                return txt.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
            });
            const maxParts = Math.max(1, ...splitParts.map(p => p.length || 1));
            const linkOverrides = indicatorLinks[metric.label] || {};

            for (let rowIdx = 0; rowIdx < maxParts; rowIdx++) {
                const row = document.createElement('tr');
                if (rowIdx > 0) row.className = 'metric-continuation';

                // Metric label (only on first row; continuation rows get empty cell)
                const labelTd = document.createElement('td');
                if (rowIdx === 0) {
                    if (isGT) {
                        let keyword = 'searches';
                        for (const [k, vv] of Object.entries(GT_KEYWORD_MAP)) {
                            if (metric.label.includes(k)) { keyword = vv; break; }
                        }
                        labelTd.innerHTML = `searches for <strong>${keyword}</strong>`;
                        labelTd.style.paddingLeft = '20px';
                    } else {
                        labelTd.textContent = metric.label;
                    }
                } else {
                    labelTd.className = 'metric-label-cont';
                }
                row.appendChild(labelTd);

                // Country cells for this sub-row
                metric.values.forEach((v, idx) => {
                    const countryName = countries[idx];
                    const parts = splitParts[idx];
                    const partText = parts[rowIdx] || '';
                    const overrides = linkOverrides[countryName];
                    let partLink = null;
                    if (overrides && overrides[rowIdx]) {
                        partLink = overrides[rowIdx].url;
                    } else if (rowIdx === 0 && (parts.length <= 1)) {
                        partLink = v.link;
                    }

                    const td = document.createElement('td');
                    if (isExtra(countryName)) td.classList.add('extra-country-col');

                    if (isGasRow && partText) {
                        // Gas rows: 3-line format
                        // Line 1 (bold): price + current % colored
                        // Line 2 (bold): Peak % colored, Avg % colored
                        // Line 3 (grey): weekly % history
                        const gasColorCls = (pStr) => {
                            if (!pStr) return '';
                            const n = parseInt(pStr, 10);
                            if (n >= 40) return 'heat-red-3';
                            if (n >= 25) return 'heat-red-2';
                            if (n >= 10) return 'heat-red-1';
                            return 'heat-neutral';
                        };
                        let weeklyPcts = [];
                        let currentPct = '';
                        let priceStr = '';
                        let peakPct = '';
                        const peakMatchG = partText.match(/\|\s*Peak\s*([+-]?\d+%)/i);
                        if (peakMatchG) peakPct = peakMatchG[1];
                        let mainText = partText.replace(/\s*\|\s*Peak\s*[+-]?\d+%\s*$/i, '');
                        if (mainText.includes('-->')) {
                            const [histPart, curPart] = mainText.split('-->');
                            weeklyPcts = histPart.trim().split(/\s+/).filter(s => /[+-]?\d+%/.test(s));
                            const curMatch = curPart.trim().match(/^([+-]?\d+%)\s*(.*)$/);
                            if (curMatch) { currentPct = curMatch[1]; priceStr = curMatch[2].replace(/[()]/g, '').trim(); }
                        } else {
                            const curMatch = mainText.trim().match(/^([+-]?\d+%)\s*(.*)$/);
                            if (curMatch) { currentPct = curMatch[1]; priceStr = curMatch[2].replace(/[()]/g, '').trim(); }
                        }
                        // Avg from weekly pcts
                        let avgPct = '';
                        const weekNums = weeklyPcts.map(p => parseInt(p, 10)).filter(n => !isNaN(n));
                        if (weekNums.length > 0) {
                            const avg = Math.round(weekNums.reduce((a, b) => a + b, 0) / weekNums.length);
                            avgPct = (avg >= 0 ? '+' : '') + avg + '%';
                        }
                        // Line 1: price + current %
                        const line1 = document.createElement('div');
                        line1.className = 'gas-line-current';
                        if (priceStr) {
                            const ps = document.createElement('strong');
                            ps.textContent = priceStr + ' ';
                            line1.appendChild(ps);
                        }
                        if (currentPct) {
                            const cs = document.createElement('strong');
                            cs.className = gasColorCls(currentPct);
                            cs.textContent = currentPct;
                            line1.appendChild(cs);
                        }
                        if (!priceStr && !currentPct) line1.textContent = partText;
                        td.appendChild(line1);
                        // Line 2: Peak, Avg
                        if (peakPct || avgPct) {
                            const line2 = document.createElement('div');
                            line2.className = 'gas-line-summary';
                            if (peakPct) {
                                const pl = document.createElement('strong');
                                pl.textContent = 'Peak ';
                                line2.appendChild(pl);
                                const ps2 = document.createElement('strong');
                                ps2.className = gasColorCls(peakPct);
                                ps2.textContent = peakPct;
                                line2.appendChild(ps2);
                            }
                            if (peakPct && avgPct) line2.appendChild(document.createTextNode(', '));
                            if (avgPct) {
                                const al = document.createElement('strong');
                                al.textContent = 'Avg ';
                                line2.appendChild(al);
                                const as2 = document.createElement('strong');
                                as2.className = gasColorCls(avgPct);
                                as2.textContent = avgPct;
                                line2.appendChild(as2);
                            }
                            td.appendChild(line2);
                        }
                        // Line 3: weekly history (grey)
                        if (weeklyPcts.length > 0) {
                            const line3 = document.createElement('div');
                            line3.className = 'gas-line-history';
                            line3.textContent = weeklyPcts.join(' ');
                            td.appendChild(line3);
                        }
                        if (partLink) {
                            const wrap = document.createElement('a');
                            wrap.href = partLink;
                            wrap.target = '_blank';
                            wrap.rel = 'noopener';
                            wrap.style.textDecoration = 'none';
                            wrap.style.color = 'inherit';
                            while (td.firstChild) wrap.appendChild(td.firstChild);
                            td.appendChild(wrap);
                        }
                    } else if (isGoogleRow && partText && /[+-]?\d+%/.test(partText)) {
                        // Google Trends rows: existing progression rendering
                        let beforeText = '';
                        let afterText = partText.trim();
                        let peakText = null;
                        let peakNum = null;
                        const peakMatch = partText.match(/\|\s*Peak\s*([+-]?\d+%)/i);
                        if (peakMatch) {
                            peakText = peakMatch[1];
                            peakNum = parseInt(peakMatch[1], 10);
                            afterText = partText.replace(/\s*\|\s*Peak\s*[+-]?\d+%\s*$/i, '');
                        }
                        if (afterText.indexOf('-->') !== -1) {
                            const ps = afterText.split('-->');
                            beforeText = ps[0].trim() + ' \u2192 ';
                            afterText = ps.slice(1).join('-->').trim();
                        }
                        const pctMatch = afterText.match(/([+-]?\d+)%/);
                        const pctNum = pctMatch ? parseInt(pctMatch[1], 10) : null;
                        let cls = '';
                        if (pctNum !== null) {
                            if (pctNum >= 100) cls = 'heat-green-3';
                            else if (pctNum >= 50) cls = 'heat-green-2';
                            else if (pctNum >= 15) cls = 'heat-green-1';
                            else if (pctNum < 0) cls = 'heat-red-2';
                            else cls = 'heat-neutral';
                        }
                        const beforeSpan = document.createElement('span');
                        beforeSpan.className = 'progression-history';
                        beforeSpan.textContent = beforeText;
                        td.appendChild(beforeSpan);
                        const currentMatch = afterText.match(/^([+-]?\d+%)(.*)$/);
                        if (currentMatch) {
                            const pctOnly = currentMatch[1];
                            const remainder = currentMatch[2];
                            const afterSpan = document.createElement('span');
                            afterSpan.className = 'progression-current ' + cls;
                            afterSpan.textContent = pctOnly;
                            td.appendChild(afterSpan);
                            if (remainder.trim()) {
                                const remainderSpan = document.createElement('span');
                                remainderSpan.className = 'progression-price';
                                remainderSpan.textContent = ' ' + remainder.trim();
                                td.appendChild(remainderSpan);
                            }
                        } else {
                            const afterSpan = document.createElement('span');
                            afterSpan.className = 'progression-current ' + cls;
                            afterSpan.textContent = afterText;
                            td.appendChild(afterSpan);
                        }
                        if (peakText && peakNum !== null) {
                            let peakCls = 'heat-neutral';
                            if (peakNum >= 100) peakCls = 'heat-green-3';
                            else if (peakNum >= 50) peakCls = 'heat-green-2';
                            else if (peakNum >= 15) peakCls = 'heat-green-1';
                            const peakLabel = document.createElement('span');
                            peakLabel.className = 'peak-label';
                            peakLabel.textContent = ' Peak ';
                            td.appendChild(peakLabel);
                            const peakSpan = document.createElement('span');
                            peakSpan.className = 'progression-peak ' + peakCls;
                            peakSpan.textContent = peakText;
                            td.appendChild(peakSpan);
                        }
                        if (partLink) {
                            const wrap = document.createElement('a');
                            wrap.href = partLink;
                            wrap.target = '_blank';
                            wrap.rel = 'noopener';
                            wrap.style.textDecoration = 'none';
                            wrap.style.color = 'inherit';
                            while (td.firstChild) wrap.appendChild(td.firstChild);
                            td.appendChild(wrap);
                        }
                    } else if (partLink && partText) {
                        const a = document.createElement('a');
                        a.href = partLink;
                        a.target = '_blank';
                        a.rel = 'noopener';
                        a.textContent = partText;
                        td.appendChild(a);
                    } else {
                        td.textContent = partText;
                    }
                    row.appendChild(td);
                });

                // Source — only on first row
                const sourceTd = document.createElement('td');
                if (rowIdx === 0) sourceTd.textContent = metric.source;
                sourceTd.className = 'source-col';
                row.appendChild(sourceTd);

                tbody.appendChild(row);
            }
        });
    });

    table.appendChild(tbody);

    // Toggle button for extra countries — small, top-right, no country list
    const extraCount = countries.filter(c => !DEFAULT_VISIBLE.has(c)).length;
    if (extraCount > 0) {
        const trackerSection = document.getElementById('tracker-section');
        const existing = document.getElementById('toggle-extra-countries');
        if (existing) existing.remove();
        const btn = document.createElement('button');
        btn.id = 'toggle-extra-countries';
        btn.className = 'toggle-btn-small';
        btn.textContent = 'Show more countries';
        btn.addEventListener('click', () => {
            const isShown = document.body.classList.toggle('show-extra-countries');
            btn.textContent = isShown ? 'Hide more countries' : 'Show more countries';
        });
        // Place inside the H2 of the section, floated right
        const h2 = trackerSection.querySelector('h2');
        if (h2) h2.appendChild(btn);
    }

    // Notes
    const notesDiv = document.getElementById('tracker-notes');
    tracker.notes.forEach(n => {
        const p = document.createElement('p');
        p.textContent = n;
        notesDiv.appendChild(p);
    });
}

let allNews = [];
let sortCol = 'date';
let sortDir = -1; // -1 = descending, 1 = ascending

function renderNews(news) {
    allNews = news;

    // Populate country filter
    const countryFilter = document.getElementById('country-filter');
    const countries = [...new Set(news.map(n => n.country))].sort();
    countries.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        countryFilter.appendChild(opt);
    });

    // Populate category filter
    const catFilter = document.getElementById('category-filter');
    const cats = [...new Set(news.map(n => n.category))].sort();
    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catFilter.appendChild(opt);
    });

    countryFilter.addEventListener('change', filterNews);
    catFilter.addEventListener('change', filterNews);

    // Column sorting
    const sortKeys = ['date', 'country', 'category', 'headline', 'data_point', 'source_name'];
    document.querySelectorAll('#news-table thead th').forEach((th, i) => {
        th.style.cursor = 'pointer';
        th.dataset.sortKey = sortKeys[i];
        th.addEventListener('click', () => {
            const key = sortKeys[i];
            if (sortCol === key) {
                sortDir *= -1;
            } else {
                sortCol = key;
                sortDir = key === 'date' ? -1 : 1;
            }
            updateSortIndicators();
            filterNews();
        });
    });
    updateSortIndicators();

    filterNews();
}

function updateSortIndicators() {
    document.querySelectorAll('#news-table thead th').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.remove();
        if (th.dataset.sortKey === sortCol) {
            const span = document.createElement('span');
            span.className = 'sort-arrow';
            span.textContent = sortDir === 1 ? ' \u25B2' : ' \u25BC';
            th.appendChild(span);
        }
    });
}

function filterNews() {
    const countryVal = document.getElementById('country-filter').value;
    const catVal = document.getElementById('category-filter').value;

    let filtered = allNews;

    if (countryVal === 'key') {
        filtered = filtered.filter(n => n.key_country);
    } else if (countryVal !== 'all') {
        filtered = filtered.filter(n => n.country === countryVal);
    }

    if (catVal !== 'all') {
        filtered = filtered.filter(n => n.category === catVal);
    }

    // Sort
    filtered.sort((a, b) => {
        const va = (a[sortCol] || '').toLowerCase();
        const vb = (b[sortCol] || '').toLowerCase();
        if (va < vb) return -1 * sortDir;
        if (va > vb) return 1 * sortDir;
        return 0;
    });

    const tbody = document.getElementById('news-body');
    tbody.innerHTML = '';

    // Group by date only when sorting by date (otherwise grouping is meaningless)
    const groupByDate = sortCol === 'date';
    let prevDate = null;

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        const isNewDate = groupByDate && item.date !== prevDate;
        if (groupByDate && prevDate !== null && isNewDate) {
            tr.className = 'date-group-start';
        }

        // Date — show only on first row of each date group when sorted by date
        const dateTd = document.createElement('td');
        if (!groupByDate || isNewDate) {
            dateTd.textContent = formatNewsDate(item.date);
            if (groupByDate) dateTd.className = 'date-cell-first';
        } else {
            dateTd.textContent = '';
            dateTd.className = 'date-cell-cont';
        }
        tr.appendChild(dateTd);
        prevDate = item.date;

        // Country
        const countryTd = document.createElement('td');
        countryTd.textContent = item.country;
        tr.appendChild(countryTd);

        // Category
        const catTd = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `category-badge ${categoryClass(item.category)}`;
        badge.textContent = item.category;
        catTd.appendChild(badge);
        tr.appendChild(catTd);

        // Headline
        const headlineTd = document.createElement('td');
        headlineTd.textContent = item.headline;
        tr.appendChild(headlineTd);

        // Data point
        const dataTd = document.createElement('td');
        dataTd.textContent = item.data_point;
        tr.appendChild(dataTd);

        // Source
        const sourceTd = document.createElement('td');
        if (item.source_url && item.source_url.startsWith('http')) {
            const a = document.createElement('a');
            a.href = item.source_url;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = item.source_name || 'Link';
            sourceTd.appendChild(a);
        } else {
            sourceTd.textContent = item.source_name;
        }
        tr.appendChild(sourceTd);

        tbody.appendChild(tr);
    });

    document.getElementById('news-count').textContent = `${filtered.length} of ${allNews.length} articles`;
}

function renderSummary(summary) {
    document.getElementById('summary-text').textContent = summary.text;
}

function renderSales(sales) {
    const table = document.getElementById('sales-table');
    const swingMeta = {
        'up':    { label: 'Crisis-confirmed',   cls: 'flag-up',    rowCls: 'sales-up' },
        'up2':   { label: 'Likely crisis-driven', cls: 'flag-up2', rowCls: 'sales-up2' },
        'watch': { label: 'Watch',               cls: 'flag-watch', rowCls: 'sales-watch' },
        'decel': { label: 'Decelerating',        cls: 'flag-decel', rowCls: 'sales-decel' },
        'down':  { label: 'Declining',           cls: 'flag-down',  rowCls: 'sales-down' },
    };
    var h = '<thead><tr><th>Market</th><th>March BEV</th><th>Share</th><th>YoY</th><th>Swing Signal</th><th>Note</th></tr></thead><tbody>';
    sales.forEach(function(row) {
        var sm = swingMeta[row.swing] || { label: '\u2014', cls: '', rowCls: '' };
        var yoyClass = row.yoyDir === 'pos' ? 'yoy-pos' : row.yoyDir === 'neg' ? 'yoy-neg' : '';
        h += '<tr class="' + sm.rowCls + '">';
        h += '<td style="font-weight:500">' + row.market + '</td>';
        h += '<td style="text-align:center">' + row.bev + '</td>';
        h += '<td style="text-align:center">' + row.share + '</td>';
        h += '<td style="text-align:center" class="' + yoyClass + '">' + row.yoy + '</td>';
        h += '<td><span class="flag-badge ' + sm.cls + '">' + sm.label + '</span></td>';
        h += '<td style="color:#666;font-size:11.5px">' + row.note + '</td>';
        h += '</tr>';
    });
    h += '</tbody>';
    table.innerHTML = h;
}

function renderPolicy(policy) {
    var table = document.getElementById('policy-table');
    var h = '<thead><tr><th>Date</th><th>Country</th><th>Policy</th><th>Key Detail</th><th>Source</th></tr></thead><tbody>';
    policy.forEach(function(row) {
        h += '<tr>';
        h += '<td style="white-space:nowrap">' + row.date + '</td>';
        h += '<td style="font-weight:500">' + row.country + '</td>';
        h += '<td>' + row.policy + '</td>';
        h += '<td style="color:#666;font-size:12px">' + row.detail + '</td>';
        if (row.url) {
            h += '<td><a href="' + row.url + '" target="_blank" rel="noopener" style="color:#111;border-bottom:1px dotted #ccc;text-decoration:none;font-size:11px">' + (row.source || 'Source') + '</a></td>';
        } else {
            h += '<td></td>';
        }
        h += '</tr>';
    });
    h += '</tbody>';
    table.innerHTML = h;
}

function buildSideNav() {
    const items = [
        {id: 'summary-section', label: 'Executive Summary'},
        {id: 'commentary-section', label: 'Key Takeaways'},
        {id: 'highlights-section', label: 'Highlights This Week'},
        {id: 'tracker-section', label: 'Indicators'},
        {id: 'policy-section', label: 'Policy Timeline'},
        {id: 'sales-section', label: 'March BEV Sales'},
        {id: 'country-commentary-section', label: 'Country Commentary'},
        {id: 'news-section', label: 'Newsfeed'},
    ];
    const nav = document.createElement('nav');
    nav.id = 'side-nav';
    nav.innerHTML =
        '<button id="side-nav-close" title="Hide navigation" aria-label="Hide navigation">\u00D7</button>' +
        '<div class="side-nav-title">On this page</div>' +
        '<ul>' + items.map(it =>
            '<li><a href="#' + it.id + '" data-target="' + it.id + '">' + it.label + '</a></li>'
        ).join('') + '</ul>';
    document.body.appendChild(nav);

    // Toggle button (shown when nav is hidden)
    const showBtn = document.createElement('button');
    showBtn.id = 'side-nav-show';
    showBtn.title = 'Show navigation';
    showBtn.setAttribute('aria-label', 'Show navigation');
    showBtn.innerHTML = '&#9776;'; // hamburger
    document.body.appendChild(showBtn);

    // Restore prior state
    if (localStorage.getItem('sideNavHidden') === '1') {
        document.body.classList.add('side-nav-hidden');
    }

    document.getElementById('side-nav-close').addEventListener('click', function() {
        document.body.classList.add('side-nav-hidden');
        localStorage.setItem('sideNavHidden', '1');
    });
    showBtn.addEventListener('click', function() {
        document.body.classList.remove('side-nav-hidden');
        localStorage.setItem('sideNavHidden', '0');
    });

    // Smooth scroll on click
    nav.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', function(e) {
            e.preventDefault();
            const t = document.getElementById(this.dataset.target);
            if (t) t.scrollIntoView({behavior: 'smooth', block: 'start'});
        });
    });

    // Highlight active section on scroll
    const links = Array.from(nav.querySelectorAll('a'));
    function onScroll() {
        let current = items[0].id;
        const y = window.scrollY + 120;
        for (const it of items) {
            const el = document.getElementById(it.id);
            if (el && el.offsetTop <= y) current = it.id;
        }
        links.forEach(l => l.classList.toggle('active', l.dataset.target === current));
    }
    window.addEventListener('scroll', onScroll, {passive: true});
    onScroll();
}

async function init() {
    buildSideNav();
    let meta, commentary, tracker, news, indicatorLinks;
    try {
        [meta, commentary, tracker, news, indicatorLinks] = await Promise.all([
            loadJSON('data/meta.json'),
            loadJSON('data/commentary.json'),
            loadJSON('data/tracker.json'),
            loadJSON('data/news.json'),
            loadJSON('data/indicator_links.json'),
        ]);
    } catch (e) {
        console.error('init Promise.all error:', e);
    }

    if (meta) {
        try { renderMeta(meta, news ? news.length : 0); } catch(e) { console.error('renderMeta:', e); }
    }
    if (commentary) {
        try { renderCommentary(commentary); } catch(e) { console.error('renderCommentary:', e); }
    }
    if (tracker) {
        try { renderTracker(tracker, indicatorLinks); } catch(e) { console.error('renderTracker:', e); }
    }
    if (news) {
        try { renderNews(news); } catch(e) { console.error('renderNews:', e); }
    }

    // Load and render additional sections
    try {
        const summary = await loadJSON('data/summary.json');
        if (summary && summary.text) {
            document.getElementById('summary-text').textContent = summary.text;
        }
    } catch(e) { console.warn('summary.json:', e); }

    try {
        const sales = await loadJSON('data/sales.json');
        if (sales && sales.length) renderSales(sales);
    } catch(e) { console.warn('sales.json:', e); }

    try {
        const policy = await loadJSON('data/policy.json');
        if (policy && policy.length) renderPolicy(policy);
    } catch(e) { console.warn('policy.json:', e); }

    try {
        const highlights = await loadJSON('data/highlights.json');
        if (highlights && highlights.bullets && highlights.bullets.length) renderHighlights(highlights);
    } catch(e) { console.warn('highlights.json:', e); }

    try {
        const cc = await loadJSON('data/country_commentary.json');
        if (cc && cc.countries && cc.countries.length) renderCountryCommentary(cc);
    } catch(e) { console.warn('country_commentary.json:', e); }
}

function renderCountryCommentary(cc) {
    var introEl = document.getElementById('country-commentary-intro');
    if (introEl && cc.intro) introEl.textContent = cc.intro;
    var listEl = document.getElementById('country-commentary-list');
    if (!listEl) return;

    var visible = cc.countries.filter(function(c) { return !c.hidden; });
    var hidden = cc.countries.filter(function(c) { return c.hidden; });

    function buildCard(country) {
        var html = '<div class="country-card">';
        html += '<h3>' + country.flag + ' ' + country.name + '</h3>';
        country.sections.forEach(function(s) {
            html += '<div class="country-section">';
            html += '<div class="country-section-label">' + s.label + '</div>';
            html += '<div class="country-section-text">' + s.text + '</div>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    var html = '';
    visible.forEach(function(country) { html += buildCard(country); });

    if (hidden.length > 0) {
        html += '<button id="toggle-hidden-countries" class="toggle-btn">Show ' + hidden.length + ' more countries (NZ, China, India, Pakistan, Cambodia, Canada)</button>';
        html += '<div id="hidden-countries" style="display:none;">';
        hidden.forEach(function(country) { html += buildCard(country); });
        html += '</div>';
    }

    listEl.innerHTML = html;

    var btn = document.getElementById('toggle-hidden-countries');
    if (btn) {
        btn.addEventListener('click', function() {
            var div = document.getElementById('hidden-countries');
            if (div.style.display === 'none') {
                div.style.display = 'flex';
                div.style.flexDirection = 'column';
                div.style.gap = '20px';
                div.style.marginTop = '20px';
                btn.textContent = 'Hide additional countries';
            } else {
                div.style.display = 'none';
                btn.textContent = 'Show ' + hidden.length + ' more countries (NZ, China, India, Pakistan, Cambodia, Canada)';
            }
        });
    }
}

init();
