const STATES = ['', 'available', 'maybe', 'unavailable'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let currentYear, currentMonth;
let availability = {};
let activities = [];

function init() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();

    loadFromURL() || loadFromStorage();
    renderCalendar();
    renderActivities();
    bindEvents();
}

function bindEvents() {
    document.getElementById('prev-month').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        renderCalendar();
    });
    document.getElementById('next-month').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        renderCalendar();
    });
    document.getElementById('activity-form').addEventListener('submit', addActivity);
    document.getElementById('share-btn').addEventListener('click', shareLink);
    document.getElementById('clear-btn').addEventListener('click', clearAll);
    document.getElementById('export-btn').addEventListener('click', exportData);
}

function renderCalendar() {
    document.getElementById('month-label').textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

    const container = document.getElementById('calendar-days');
    container.innerHTML = '';

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        container.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.textContent = day;

        const key = dateKey(currentYear, currentMonth, day);

        if (availability[key]) {
            cell.classList.add(availability[key]);
        }

        if (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day) {
            cell.classList.add('today');
        }

        if (hasActivity(key)) {
            const dot = document.createElement('span');
            dot.className = 'activity-dot';
            cell.appendChild(dot);
        }

        cell.addEventListener('click', () => toggleAvailability(key, cell));
        container.appendChild(cell);
    }
}

function toggleAvailability(key, cell) {
    const current = availability[key] || '';
    const idx = STATES.indexOf(current);
    const next = STATES[(idx + 1) % STATES.length];

    if (next) {
        availability[key] = next;
    } else {
        delete availability[key];
    }

    cell.classList.remove(...STATES.filter(Boolean));
    if (next) cell.classList.add(next);

    saveToStorage();
}

function hasActivity(dateKey) {
    const d = new Date(dateKey + 'T00:00:00');
    return activities.some(a => {
        const start = new Date(a.start + 'T00:00:00');
        const end = new Date(a.end + 'T00:00:00');
        return d >= start && d <= end;
    });
}

function addActivity(e) {
    e.preventDefault();
    const name = document.getElementById('activity-name').value.trim();
    const start = document.getElementById('activity-start').value;
    const end = document.getElementById('activity-end').value;
    const priority = document.getElementById('activity-priority').value;

    if (!name || !start || !end) return;

    activities.push({ id: Date.now(), name, start, end, priority, completed: false });
    activities.sort((a, b) => new Date(a.start) - new Date(b.start));

    document.getElementById('activity-form').reset();
    renderActivities();
    renderCalendar();
    saveToStorage();
}

function renderActivities() {
    const list = document.getElementById('activity-list');
    list.innerHTML = '';

    if (activities.length === 0) {
        list.innerHTML = '<li style="color:var(--text-muted);text-align:center;padding:2rem;">No activities yet. Add one above!</li>';
        return;
    }

    activities.forEach(a => {
        const li = document.createElement('li');
        li.className = `activity-item ${a.priority}${a.completed ? ' completed' : ''}`;
        li.innerHTML = `
            <div class="activity-info">
                <div class="activity-name">${escapeHtml(a.name)}</div>
                <div class="activity-dates">${formatDate(a.start)} &ndash; ${formatDate(a.end)}</div>
            </div>
            <div class="activity-actions">
                <button title="Toggle complete" data-action="toggle" data-id="${a.id}">${a.completed ? '&#x21A9;' : '&#x2713;'}</button>
                <button title="Delete" data-action="delete" data-id="${a.id}">&times;</button>
            </div>
        `;
        list.appendChild(li);
    });

    list.addEventListener('click', handleActivityAction);
}

function handleActivityAction(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;

    if (action === 'toggle') {
        const activity = activities.find(a => a.id === id);
        if (activity) activity.completed = !activity.completed;
    } else if (action === 'delete') {
        activities = activities.filter(a => a.id !== id);
    }

    renderActivities();
    renderCalendar();
    saveToStorage();
}

function shareLink() {
    const data = { availability, activities };
    const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
    const url = window.location.origin + window.location.pathname + '?data=' + encoded;

    navigator.clipboard.writeText(url).then(() => {
        showToast('Share link copied to clipboard!');
    }).catch(() => {
        prompt('Copy this link:', url);
    });
}

function clearAll() {
    if (!confirm('Clear all availability and activities?')) return;
    availability = {};
    activities = [];
    renderCalendar();
    renderActivities();
    saveToStorage();
    showToast('All data cleared');
}

function exportData() {
    let text = 'BUCKET LIST CALENDAR\n====================\n\n';

    text += 'AVAILABILITY:\n';
    const sortedDates = Object.keys(availability).sort();
    sortedDates.forEach(d => {
        text += `  ${formatDate(d)}: ${availability[d]}\n`;
    });

    text += '\nACTIVITIES:\n';
    activities.forEach(a => {
        const status = a.completed ? '[DONE]' : '[    ]';
        text += `  ${status} ${a.name} (${formatDate(a.start)} - ${formatDate(a.end)}) [${a.priority}]\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bucket-list-calendar.txt';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exported!');
}

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const data = params.get('data');
    if (!data) return false;

    try {
        const parsed = JSON.parse(decodeURIComponent(atob(data)));
        availability = parsed.availability || {};
        activities = parsed.activities || [];
        window.history.replaceState({}, '', window.location.pathname);
        return true;
    } catch {
        return false;
    }
}

function saveToStorage() {
    localStorage.setItem('bucketListCalendar', JSON.stringify({ availability, activities }));
}

function loadFromStorage() {
    try {
        const saved = JSON.parse(localStorage.getItem('bucketListCalendar'));
        if (saved) {
            availability = saved.availability || {};
            activities = saved.activities || [];
        }
    } catch {}
}

function dateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDate(str) {
    const [y, m, d] = str.split('-');
    return `${MONTH_NAMES[parseInt(m) - 1].slice(0, 3)} ${parseInt(d)}, ${y}`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}

init();
