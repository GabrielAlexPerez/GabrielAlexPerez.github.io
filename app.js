const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let currentYear, currentMonth;
let activities = [];
let unavailabilities = [];
let roomRef = null;

function init() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();

    bindEvents();
    renderCalendar();
    renderKanban();
    renderUnavailList();
    initFirebase();
}

function initFirebase() {
    try {
        const db = firebase.database();
        roomRef = db.ref('bucket-list');
        roomRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                activities = data.activities || [];
                unavailabilities = data.unavailabilities || [];
            } else {
                activities = [];
                unavailabilities = [];
            }
            renderCalendar();
            renderKanban();
            renderUnavailList();
        });
    } catch (e) {
        console.error('Firebase init failed:', e);
    }
}

function saveToFirebase() {
    if (roomRef) {
        roomRef.set({ activities, unavailabilities });
    }
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

    document.querySelectorAll('.kanban-items').forEach(col => {
        col.addEventListener('dragover', (e) => {
            e.preventDefault();
            col.classList.add('drop-hover');
        });
        col.addEventListener('dragleave', () => {
            col.classList.remove('drop-hover');
        });
        col.addEventListener('drop', (e) => {
            e.preventDefault();
            col.classList.remove('drop-hover');
            handleColumnDrop(e, col.dataset.column);
        });
    });
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
}

function isUnavailable(key) {
    const d = new Date(key + 'T00:00:00');
    return unavailabilities.some(u => {
        const start = new Date(u.start + 'T00:00:00');
        const end = new Date(u.end + 'T00:00:00');
        return d >= start && d <= end;
    });
}

function getUnavailReasons(key) {
    const d = new Date(key + 'T00:00:00');
    return unavailabilities.filter(u => {
        const start = new Date(u.start + 'T00:00:00');
        const end = new Date(u.end + 'T00:00:00');
        return d >= start && d <= end;
    }).map(u => u.reason || 'Unavailable');
}

function getActivitiesForDay(key) {
    return activities.filter(a => a.status === 'yuh' && a.scheduledDate === key);
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
                handleCalendarDrop(e, key);
            });
        }

        if (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day) {
            cell.classList.add('today');
        }

        cell.addEventListener('mouseenter', () => showDayTooltip(cell, key, dayUnavailable));
        cell.addEventListener('mouseleave', () => hideDayTooltip(cell));

        container.appendChild(cell);
    }
}

function showDayTooltip(cell, key, dayUnavailable) {
    let text = '';

    if (dayUnavailable) {
        const reasons = getUnavailReasons(key);
        text = reasons.join(', ');
    } else {
        const dayActivities = getActivitiesForDay(key);
        if (dayActivities.length > 0) {
            text = dayActivities.map(a => a.name).join(', ');
        }
    }

    if (!text) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'day-tooltip';
    tooltip.textContent = text;
    cell.style.position = 'relative';
    cell.appendChild(tooltip);
}

function hideDayTooltip(cell) {
    const tooltip = cell.querySelector('.day-tooltip');
    if (tooltip) tooltip.remove();
}

function hasActivity(dateKey) {
    return activities.some(a => a.status === 'yuh' && a.scheduledDate === dateKey);
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
        status: 'thoughts',
        scheduledDate: null
    });

    document.getElementById('activity-form').reset();
    document.getElementById('activity-form').classList.add('hidden');
    renderKanban();
    saveToFirebase();
    showToast('Tossed in the bucket!');
}

function renderKanban() {
    const columns = {
        thoughts: document.getElementById('col-thoughts'),
        yuh: document.getElementById('col-yuh'),
        nah: document.getElementById('col-nah')
    };

    const emptyMessages = {
        thoughts: 'No thoughts yet...<br>Hit + to think of something',
        yuh: 'Drag items here or onto<br>a calendar day to lock them in',
        nah: 'Drag here the ideas<br>that ain\'t it'
    };

    Object.keys(columns).forEach(status => {
        const col = columns[status];
        col.innerHTML = '';
        const items = activities.filter(a => a.status === status);

        if (items.length === 0) {
            col.innerHTML = `<p class="kanban-empty">${emptyMessages[status]}</p>`;
        } else {
            items.forEach(a => col.appendChild(createKanbanItem(a)));
        }
    });
}

function createKanbanItem(activity) {
    const wrapper = document.createElement('div');
    wrapper.className = 'kanban-item-wrapper';

    const div = document.createElement('div');
    div.className = `kanban-item ${activity.priority}`;
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

    const actions = document.createElement('div');
    actions.className = 'swipe-actions';

    if (activity.status === 'yuh') {
        const unschedBtn = document.createElement('button');
        unschedBtn.className = 'swipe-btn swipe-move';
        unschedBtn.textContent = '👀';
        unschedBtn.addEventListener('click', () => {
            activity.status = 'thoughts';
            activity.scheduledDate = null;
            renderKanban();
            renderCalendar();
            saveToFirebase();
            showToast(`${activity.name} — back to thinking`);
        });
        actions.appendChild(unschedBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'swipe-btn swipe-delete';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', () => {
        activities = activities.filter(a => a.id !== activity.id);
        renderKanban();
        renderCalendar();
        saveToFirebase();
        showToast('Gone for good');
    });
    actions.appendChild(deleteBtn);

    wrapper.appendChild(div);
    wrapper.appendChild(actions);

    // Swipe handling for touch
    let startX = 0;
    let currentX = 0;
    let swiping = false;

    div.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        currentX = startX;
        swiping = true;
        div.style.transition = 'none';
    });

    div.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (diff < 0) {
            div.style.transform = `translateX(${Math.max(diff, -100)}px)`;
        }
    });

    div.addEventListener('touchend', () => {
        if (!swiping) return;
        swiping = false;
        div.style.transition = 'transform 0.2s ease';
        const diff = currentX - startX;
        if (diff < -50) {
            div.style.transform = 'translateX(-80px)';
            wrapper.classList.add('swiped');
        } else {
            div.style.transform = 'translateX(0)';
            wrapper.classList.remove('swiped');
        }
    });

    document.addEventListener('touchstart', (e) => {
        if (!wrapper.contains(e.target) && wrapper.classList.contains('swiped')) {
            div.style.transition = 'transform 0.2s ease';
            div.style.transform = 'translateX(0)';
            wrapper.classList.remove('swiped');
        }
    });

    // Desktop drag
    div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', activity.id.toString());
        div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    // Desktop right-click
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.pageX, e.pageY, activity);
    });

    return wrapper;
}

function handleCalendarDrop(e, dateKey) {
    const id = Number(e.dataTransfer.getData('text/plain'));
    const activity = activities.find(a => a.id === id);
    if (!activity) return;
    if (isUnavailable(dateKey)) return;

    activity.status = 'yuh';
    activity.scheduledDate = dateKey;
    renderKanban();
    renderCalendar();
    saveToFirebase();
    showToast(`${activity.name} — yuh!`);
}

function handleColumnDrop(e, column) {
    const id = Number(e.dataTransfer.getData('text/plain'));
    const activity = activities.find(a => a.id === id);
    if (!activity) return;

    activity.status = column;
    if (column !== 'yuh') {
        activity.scheduledDate = null;
    }

    renderKanban();
    renderCalendar();
    saveToFirebase();

    const messages = {
        thoughts: `${activity.name} — back to thinking`,
        yuh: `${activity.name} — yuh!`,
        nah: `${activity.name} — nah`
    };
    showToast(messages[column]);
}

function showContextMenu(x, y, activity) {
    removeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    if (activity.status !== 'thoughts') {
        const thoughtsBtn = document.createElement('button');
        thoughtsBtn.textContent = '👀 Back to thoughts';
        thoughtsBtn.addEventListener('click', () => {
            activity.status = 'thoughts';
            activity.scheduledDate = null;
            renderKanban();
            renderCalendar();
            saveToFirebase();
            removeContextMenu();
            showToast(`${activity.name} — back to thinking`);
        });
        menu.appendChild(thoughtsBtn);
    }

    if (activity.status !== 'nah') {
        const nahBtn = document.createElement('button');
        nahBtn.textContent = '🚫 Nah';
        nahBtn.addEventListener('click', () => {
            activity.status = 'nah';
            activity.scheduledDate = null;
            renderKanban();
            renderCalendar();
            saveToFirebase();
            removeContextMenu();
            showToast(`${activity.name} — nah`);
        });
        menu.appendChild(nahBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger';
    deleteBtn.textContent = '🗑️ Delete forever';
    deleteBtn.addEventListener('click', () => {
        activities = activities.filter(a => a.id !== activity.id);
        renderKanban();
        renderCalendar();
        saveToFirebase();
        removeContextMenu();
        showToast('Gone for good');
    });
    menu.appendChild(deleteBtn);

    document.body.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('click', removeContextMenu, { once: true });
    }, 0);
}

function removeContextMenu() {
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();
}

function addUnavailability(e) {
    e.preventDefault();
    const start = document.getElementById('unavail-start').value;
    const end = document.getElementById('unavail-end').value;
    const reason = document.getElementById('unavail-reason').value.trim();

    if (!start || !end) return;

    unavailabilities.push({ id: Date.now(), reason, start, end });

    activities.forEach(a => {
        if (a.scheduledDate && isUnavailable(a.scheduledDate)) {
            a.status = 'thoughts';
            a.scheduledDate = null;
        }
    });

    document.getElementById('unavail-form').reset();
    document.getElementById('unavail-form').classList.add('hidden');
    renderUnavailList();
    renderCalendar();
    renderKanban();
    saveToFirebase();
    showToast('Blocked off!');
}

function renderUnavailList() {
    const list = document.getElementById('unavail-list');
    list.innerHTML = '';

    unavailabilities.forEach(u => {
        const li = document.createElement('li');
        li.className = 'unavail-item';
        const label = u.reason || 'Unavailable';
        li.innerHTML = `
            <div class="unavail-info">
                <span class="unavail-person">${escapeHtml(label)}</span>
                <span class="unavail-dates">${formatDate(u.start)} &ndash; ${formatDate(u.end)}</span>
            </div>
            <button class="unavail-delete" title="Remove">&times;</button>
        `;
        li.querySelector('.unavail-delete').addEventListener('click', () => {
            unavailabilities = unavailabilities.filter(x => x.id !== u.id);
            renderUnavailList();
            renderCalendar();
            saveToFirebase();
        });
        list.appendChild(li);
    });
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
