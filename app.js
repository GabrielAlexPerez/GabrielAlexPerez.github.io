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
    renderThoughts();
    renderNah();
    renderScheduledList();
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
            renderThoughts();
            renderNah();
            renderScheduledList();
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

    document.getElementById('nah-toggle').addEventListener('click', () => {
        document.querySelector('.nah-section').classList.toggle('collapsed');
    });

    document.getElementById('unavail-section-toggle').addEventListener('click', () => {
        document.querySelector('.unavailability-section').classList.toggle('collapsed');
    });
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

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.popover') && !e.target.closest('.day-cell')) {
            hidePopover();
        }
    });
}

function toggleActivityForm() {
    const form = document.getElementById('activity-form');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
        document.getElementById('activity-name').focus();
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
        const cellDate = new Date(currentYear, currentMonth, day);
        const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const dayUnavailable = isUnavailable(key);

        if (isPast) {
            cell.classList.add('past');
        } else if (dayUnavailable) {
            cell.classList.add('unavailable');
        } else {
            if (hasActivity(key)) {
                cell.classList.add('has-activity');
            }

            cell.addEventListener('click', (e) => {
                showDatePopover(e, key);
            });

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

function showDatePopover(e, dateKey) {
    const thoughts = activities.filter(a => a.status === 'thoughts');
    const popover = document.getElementById('date-picker-popover');

    if (thoughts.length === 0) {
        popover.innerHTML = '<p class="popover-empty">No thoughts to schedule</p>';
    } else {
        let html = `<h4>Schedule for ${formatDate(dateKey)}</h4>`;
        thoughts.forEach(a => {
            html += `<button class="popover-item" data-id="${a.id}">${escapeHtml(a.name)}</button>`;
        });
        popover.innerHTML = html;
    }

    const rect = e.target.getBoundingClientRect();
    popover.style.left = rect.left + 'px';
    popover.style.top = (rect.bottom + 8) + 'px';
    popover.classList.remove('hidden');

    popover.querySelectorAll('.popover-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = Number(btn.dataset.id);
            const activity = activities.find(a => a.id === id);
            if (activity) {
                activity.status = 'yuh';
                activity.scheduledDate = dateKey;
                renderCalendar();
                renderThoughts();
                renderScheduledList();
                saveToFirebase();
                showToast(`${activity.name} — yuh!`);
            }
            hidePopover();
        });
    });
}

function hidePopover() {
    document.getElementById('date-picker-popover').classList.add('hidden');
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
    const location = document.getElementById('activity-location').value.trim();
    const link = document.getElementById('activity-link').value.trim();

    if (!name) return;

    activities.push({
        id: Date.now(),
        name,
        location: location || null,
        link: link || null,
        status: 'thoughts',
        scheduledDate: null
    });

    document.getElementById('activity-form').reset();
    document.getElementById('activity-form').classList.add('hidden');
    renderThoughts();
    saveToFirebase();
    showToast('Tossed in the bucket!');
}

function renderThoughts() {
    const col = document.getElementById('col-thoughts');
    col.innerHTML = '';
    const items = activities.filter(a => a.status === 'thoughts');

    if (items.length === 0) {
        col.innerHTML = '<p class="kanban-empty">No thoughts yet...<br>Hit + to think of something</p>';
    } else {
        items.forEach(a => col.appendChild(createKanbanItem(a)));
    }
}

function renderNah() {
    const col = document.getElementById('col-nah');
    col.innerHTML = '';
    const items = activities.filter(a => a.status === 'nah');

    document.getElementById('nah-count').textContent = items.length;

    if (items.length === 0) {
        col.innerHTML = '<p class="kanban-empty">Nothing here yet</p>';
    } else {
        items.forEach(a => col.appendChild(createKanbanItem(a)));
    }
}

function renderScheduledList() {
    const container = document.getElementById('scheduled-list');
    const scheduled = activities.filter(a => a.status === 'yuh' && a.scheduledDate);
    scheduled.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

    if (scheduled.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '<h3>🤝 Scheduled</h3>';
    scheduled.forEach(a => {
        html += `
            <div class="scheduled-item">
                <span class="sched-date">${formatDate(a.scheduledDate)}</span>
                <span class="sched-name">${escapeHtml(a.name)}</span>
                <button class="sched-remove" data-id="${a.id}" title="Unschedule">✕</button>
            </div>
        `;
    });
    container.innerHTML = html;

    container.querySelectorAll('.sched-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = Number(btn.dataset.id);
            const activity = activities.find(a => a.id === id);
            if (activity) {
                activity.status = 'thoughts';
                activity.scheduledDate = null;
                renderCalendar();
                renderThoughts();
                renderScheduledList();
                saveToFirebase();
                showToast(`${activity.name} — back to thinking`);
            }
        });
    });
}

function createKanbanItem(activity) {
    const wrapper = document.createElement('div');
    wrapper.className = 'kanban-item-wrapper';

    const div = document.createElement('div');
    div.className = 'kanban-item';
    div.draggable = true;
    div.dataset.id = activity.id;

    div.innerHTML = `
        <div class="item-content">
            <span class="item-name">${escapeHtml(activity.name)}</span>
        </div>
        <span class="item-expand">▸</span>
    `;

    div.addEventListener('click', (e) => {
        if (e.target.closest('.item-edit-form')) return;
        if (e.target.closest('.item-link-preview')) return;
        const isExpanded = div.classList.toggle('expanded');
        const existing = div.querySelector('.item-edit-form');
        if (isExpanded && !existing) {
            div.appendChild(createEditForm(activity));
        } else if (!isExpanded && existing) {
            existing.remove();
        }
    });

    const actions = document.createElement('div');
    actions.className = 'swipe-actions';

    if (activity.status === 'yuh') {
        const unschedBtn = document.createElement('button');
        unschedBtn.className = 'swipe-btn swipe-move';
        unschedBtn.textContent = '👀';
        unschedBtn.addEventListener('click', () => {
            activity.status = 'thoughts';
            activity.scheduledDate = null;
            renderThoughts();
            renderScheduledList();
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
        renderThoughts();
        renderNah();
        renderScheduledList();
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

function createEditForm(activity) {
    const form = document.createElement('div');
    form.className = 'item-edit-form';
    form.innerHTML = `
        <input type="text" class="edit-name" value="${escapeHtml(activity.name)}" placeholder="Activity name">
        <input type="text" class="edit-location" value="${escapeHtml(activity.location || '')}" placeholder="📍 Location">
        <input type="url" class="edit-link" value="${escapeHtml(activity.link || '')}" placeholder="🔗 Link">
        <input type="date" class="edit-date" value="${activity.scheduledDate || ''}">
        ${activity.link ? `<a class="item-link-preview" href="${escapeHtml(activity.link)}" target="_blank" rel="noopener">Open link ↗</a>` : ''}
    `;

    const saveChanges = () => {
        const newName = form.querySelector('.edit-name').value.trim();
        const newLocation = form.querySelector('.edit-location').value.trim();
        const newLink = form.querySelector('.edit-link').value.trim();
        const newDate = form.querySelector('.edit-date').value;

        if (newName) activity.name = newName;
        activity.location = newLocation || null;
        activity.link = newLink || null;

        if (newDate && newDate !== activity.scheduledDate) {
            activity.scheduledDate = newDate;
            activity.status = 'yuh';
        } else if (!newDate && activity.scheduledDate) {
            activity.scheduledDate = null;
            activity.status = 'thoughts';
        }

        renderThoughts();
        renderNah();
        renderScheduledList();
        renderCalendar();
        saveToFirebase();
    };

    form.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', saveChanges);
        input.addEventListener('blur', saveChanges);
    });

    return form;
}

function handleCalendarDrop(e, dateKey) {
    const id = Number(e.dataTransfer.getData('text/plain'));
    const activity = activities.find(a => a.id === id);
    if (!activity) return;
    if (isUnavailable(dateKey)) return;

    activity.status = 'yuh';
    activity.scheduledDate = dateKey;
    renderThoughts();
    renderScheduledList();
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

    renderThoughts();
    renderNah();
    renderScheduledList();
    renderCalendar();
    saveToFirebase();

    const messages = {
        thoughts: `${activity.name} — back to thinking`,
        nah: `${activity.name} — nah`
    };
    showToast(messages[column] || `${activity.name} moved`);
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
            renderThoughts();
            renderNah();
            renderScheduledList();
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
            renderThoughts();
            renderNah();
            renderScheduledList();
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
        renderThoughts();
        renderNah();
        renderScheduledList();
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
    renderUnavailList();
    renderCalendar();
    renderThoughts();
    renderScheduledList();
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
