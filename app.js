const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let currentYear, currentMonth;
let activities = [];
let unavailabilities = [];

function init() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();

    loadFromStorage();
    renderCalendar();
    renderBucket();
    renderUnavailList();
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

    document.getElementById('add-btn').addEventListener('click', toggleActivityForm);
    document.getElementById('cancel-add').addEventListener('click', toggleActivityForm);
    document.getElementById('activity-form').addEventListener('submit', addActivity);

    document.getElementById('toggle-unavail').addEventListener('click', toggleUnavailForm);
    document.getElementById('unavail-form').addEventListener('submit', addUnavailability);
}

function toggleActivityForm() {
    const form = document.getElementById('activity-form');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
        document.getElementById('activity-name').focus();
    }
}

function toggleUnavailForm() {
    const form = document.getElementById('unavail-form');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
        document.getElementById('unavail-person').focus();
    }
}

function isUnavailable(key) {
    const d = new Date(key + 'T00:00:00');
    return unavailabilities.some(u => {
        const start = new Date(u.start + 'T00:00:00');
        const end = new Date(u.end + 'T00:00:00');
        return d >= start && d <= end;
    });
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
        const dayUnavailable = isUnavailable(key);

        if (dayUnavailable) {
            cell.classList.add('unavailable');
        } else {
            if (hasActivity(key)) {
                cell.classList.add('has-activity');
            }

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
        }

        if (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day) {
            cell.classList.add('today');
        }

        container.appendChild(cell);
    }
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
    `;

    div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', activity.id.toString());
        div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    div.addEventListener('click', () => {
        activities = activities.filter(a => a.id !== activity.id);
        renderBucket();
        renderCalendar();
        saveToStorage();
        showToast('Removed from the bucket');
    });

    return div;
}

function handleDrop(e, dateKey) {
    const id = Number(e.dataTransfer.getData('text/plain'));
    const activity = activities.find(a => a.id === id);
    if (!activity) return;

    if (isUnavailable(dateKey)) return;

    activity.scheduledDate = dateKey;
    renderBucket();
    renderCalendar();
    saveToStorage();
    showToast(`${activity.name} scheduled!`);
}

function addUnavailability(e) {
    e.preventDefault();
    const person = document.getElementById('unavail-person').value.trim();
    const start = document.getElementById('unavail-start').value;
    const end = document.getElementById('unavail-end').value;

    if (!person || !start || !end) return;

    unavailabilities.push({ id: Date.now(), person, start, end });

    // unschedule any activities on now-blocked days
    activities.forEach(a => {
        if (a.scheduledDate && isUnavailable(a.scheduledDate)) {
            a.scheduledDate = null;
        }
    });

    document.getElementById('unavail-form').reset();
    document.getElementById('unavail-form').classList.add('hidden');
    renderUnavailList();
    renderCalendar();
    renderBucket();
    saveToStorage();
    showToast(`${person} blocked off`);
}

function renderUnavailList() {
    const list = document.getElementById('unavail-list');
    list.innerHTML = '';

    unavailabilities.forEach(u => {
        const li = document.createElement('li');
        li.className = 'unavail-item';
        li.innerHTML = `
            <div class="unavail-info">
                <span class="unavail-person">${escapeHtml(u.person)}</span>
                <span class="unavail-dates">${formatDate(u.start)} &ndash; ${formatDate(u.end)}</span>
            </div>
            <button class="unavail-delete" title="Remove">&times;</button>
        `;
        li.querySelector('.unavail-delete').addEventListener('click', () => {
            unavailabilities = unavailabilities.filter(x => x.id !== u.id);
            renderUnavailList();
            renderCalendar();
            saveToStorage();
        });
        list.appendChild(li);
    });
}

function saveToStorage() {
    localStorage.setItem('bucketListCalendar', JSON.stringify({ activities, unavailabilities }));
}

function loadFromStorage() {
    try {
        const saved = JSON.parse(localStorage.getItem('bucketListCalendar'));
        if (saved) {
            activities = saved.activities || [];
            unavailabilities = saved.unavailabilities || [];
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
