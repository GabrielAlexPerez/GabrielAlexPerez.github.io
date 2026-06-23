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
    renderBucket();
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

    document.getElementById('add-btn').addEventListener('click', toggleForm);
    document.getElementById('cancel-add').addEventListener('click', toggleForm);
    document.getElementById('activity-form').addEventListener('submit', addActivity);

    document.getElementById('share-btn').addEventListener('click', shareLink);
    document.getElementById('clear-btn').addEventListener('click', clearAll);
    document.getElementById('export-btn').addEventListener('click', exportData);
}

function toggleForm() {
    const form = document.getElementById('activity-form');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
        document.getElementById('activity-name').focus();
    }
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

        if (hasActivity(key)) {
            cell.classList.add('has-activity');
        }

        if (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day) {
            cell.classList.add('today');
        }

        cell.addEventListener('click', () => toggleAvailability(key, cell));

        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            cell.classList.add('drop-hover');
        });
        cell.addEventListener('dragleave', () => {
            cell.classList.remove('drop-hover');
        });
        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.classList.remove('drop-hover');
            handleDrop(e, key);
        });

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
    return activities.some(a => a.scheduledDate === dateKey);
}

function addActivity(e) {
    e.preventDefault();
    const name = document.getElementById('activity-name').value.trim();
    const priority = document.getElementById('activity-priority').value;

    if (!name) return;

    activities.push({
        id: Date.now(),
        name,
        priority,
        scheduledDate: null
    });

    document.getElementById('activity-form').reset();
    document.getElementById('activity-form').classList.add('hidden');
    renderBucket();
    saveToStorage();
    showToast('Tossed in the bucket!');
}

function renderBucket() {
    const container = document.getElementById('bucket-list');
    container.innerHTML = '';

    if (activities.length === 0) {
        container.innerHTML = '<p class="bucket-empty">Bucket\'s empty!<br>Hit + to toss something in.</p>';
        return;
    }

    const unscheduled = activities.filter(a => !a.scheduledDate);
    const scheduled = activities.filter(a => a.scheduledDate);

    unscheduled.forEach(a => container.appendChild(createBucketItem(a)));

    if (scheduled.length > 0 && unscheduled.length > 0) {
        const divider = document.createElement('div');
        divider.style.cssText = 'border-top:1px dashed rgba(255,255,255,0.3);margin:0.3rem 0;';
        container.appendChild(divider);
    }

    scheduled.forEach(a => container.appendChild(createBucketItem(a)));
}

function createBucketItem(activity) {
    const div = document.createElement('div');
    div.className = `bucket-item ${activity.priority}${activity.scheduledDate ? ' scheduled-item' : ''}`;
    div.draggable = true;
    div.dataset.id = activity.id;

    let dateLabel = '';
    if (activity.scheduledDate) {
        dateLabel = `<span class="item-date">${formatDate(activity.scheduledDate)}</span>`;
    }

    div.innerHTML = `
        <span class="item-name">${escapeHtml(activity.name)}</span>
        ${dateLabel}
        <button class="item-delete" data-id="${activity.id}" title="Remove">&times;</button>
    `;

    div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', activity.id.toString());
        div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    div.querySelector('.item-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        activities = activities.filter(a => a.id !== activity.id);
        renderBucket();
        renderCalendar();
        saveToStorage();
    });

    return div;
}

function handleDrop(e, dateKey) {
    const id = Number(e.dataTransfer.getData('text/plain'));
    const activity = activities.find(a => a.id === id);
    if (!activity) return;

    activity.scheduledDate = dateKey;
    renderBucket();
    renderCalendar();
    saveToStorage();
    showToast(`${activity.name} scheduled!`);
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
    if (!confirm('Empty the whole bucket and clear the calendar?')) return;
    availability = {};
    activities = [];
    renderCalendar();
    renderBucket();
    saveToStorage();
    showToast('Fresh start!');
}

function exportData() {
    let text = 'THE BUCKET LIST\n===============\n\n';

    text += 'AVAILABILITY:\n';
    const sortedDates = Object.keys(availability).sort();
    sortedDates.forEach(d => {
        text += `  ${formatDate(d)}: ${availability[d]}\n`;
    });

    text += '\nBUCKET LIST ITEMS:\n';
    const unscheduled = activities.filter(a => !a.scheduledDate);
    const scheduled = activities.filter(a => a.scheduledDate);

    if (unscheduled.length) {
        text += '  Unscheduled:\n';
        unscheduled.forEach(a => {
            text += `    - ${a.name} [${a.priority}]\n`;
        });
    }
    if (scheduled.length) {
        text += '  Scheduled:\n';
        scheduled.forEach(a => {
            text += `    - ${a.name} => ${formatDate(a.scheduledDate)} [${a.priority}]\n`;
        });
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bucket-list.txt';
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
    return `${MONTH_NAMES[parseInt(m) - 1].slice(0, 3)} ${parseInt(d)}`;
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
