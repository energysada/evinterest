async function loadJSON(path) {
    const res = await fetch(path);
    return res.json();
}

function categoryClass(cat) {
    const c = (cat || '').toLowerCase();
    if (c.includes('ev interest') || c.includes('ev demand')) return 'cat-ev-interest';
    if (c.includes('fuel')) return 'cat-fuel-price';
    if (c.includes('policy')) return 'cat-policy';
    if (c.includes('ev sales')) return 'cat-ev-sales';
    if (c.includes('macro')) return 'cat-macro';
    if (c.includes('platform')) return 'cat-platform';
    return '';
}

function renderMeta(meta) {
    document.getElementById('edition-badge').textContent = `Edition #${meta.edition}`;
    document.getElementById('brent-badge').textContent = `Brent: ${meta.brent} (${meta.brent_change})`;
    document.getElementById('date-badge').textContent = `Week of ${meta.date}`;
    document.getElementById('footer-date').textContent = meta.last_updated;
}

function renderCommentary(commentary) {
    const ul = document.getElementById('commentary-list');
    commentary.bullets.forEach(b => {
        const li = document.createElement('li');
        li.textContent = b;
        ul.appendChild(li);
    });
}

function renderTracker(tracker) {
    const table = document.getElementById('tracker-table');
    const countries = tracker.countries;

    // Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `<th>Metric</th><th>Source</th>`;
    countries.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

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

        // Metric rows
        section.metrics.forEach(metric => {
            const row = document.createElement('tr');

            // Metric label
            const labelTd = document.createElement('td');
            labelTd.textContent = metric.label;
            row.appendChild(labelTd);

            // Source
            const sourceTd = document.createElement('td');
            sourceTd.textContent = metric.source;
            row.appendChild(sourceTd);

            // Country values
            metric.values.forEach(v => {
                const td = document.createElement('td');
                if (v.link && v.value) {
                    const a = document.createElement('a');
                    a.href = v.link;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    a.textContent = v.value;
                    td.appendChild(a);
                } else {
                    td.textContent = v.value;
                }
                row.appendChild(td);
            });

            tbody.appendChild(row);
        });
    });

    table.appendChild(tbody);

    // Notes
    const notesDiv = document.getElementById('tracker-notes');
    tracker.notes.forEach(n => {
        const p = document.createElement('p');
        p.textContent = n;
        notesDiv.appendChild(p);
    });
}

let allNews = [];

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

    filterNews();
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

    // Sort by date descending
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    const tbody = document.getElementById('news-body');
    tbody.innerHTML = '';

    filtered.forEach(item => {
        const tr = document.createElement('tr');

        // Date
        const dateTd = document.createElement('td');
        dateTd.textContent = item.date.replace('2026-', '');
        tr.appendChild(dateTd);

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

async function init() {
    const [meta, commentary, tracker, news] = await Promise.all([
        loadJSON('data/meta.json'),
        loadJSON('data/commentary.json'),
        loadJSON('data/tracker.json'),
        loadJSON('data/news.json'),
    ]);

    renderMeta(meta);
    renderCommentary(commentary);
    renderTracker(tracker);
    renderNews(news);
}

init();
