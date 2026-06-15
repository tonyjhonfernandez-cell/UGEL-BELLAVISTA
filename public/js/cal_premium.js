// Mini calendar
let _miniCalDate = new Date();

function renderMiniCal() {
    const container = document.getElementById('miniCalDays');
    const titleEl = document.getElementById('miniCalTitle');
    if (!container) return;

    const d = new Date(_miniCalDate);
    const year = d.getFullYear();
    const month = d.getMonth();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    if (titleEl) titleEl.textContent = meses[month] + ' ' + year;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

    // Días con eventos (del calendar actual)
    const daysWithEvents = new Set();
    if (typeof todosLosEventosCalendario !== 'undefined') {
        todosLosEventosCalendario.forEach(ev => {
            const evD = new Date(ev.start);
            if (evD.getMonth() === month && evD.getFullYear() === year) {
                daysWithEvents.add(evD.getDate());
            }
        });
    }

    let html = '';
    // Días del mes anterior
    for (let i = 0; i < firstDay; i++) {
        const prevDate = new Date(year, month, -firstDay + i + 1);
        html += `<div class="mini-cal-day other-month">${prevDate.getDate()}</div>`;
    }
    // Días del mes actual
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
        let cls = 'mini-cal-day';
        if (dateStr === todayStr) cls += ' today';
        if (daysWithEvents.has(day)) cls += ' has-events';
        html += `<div class="${cls}" onclick="miniCalGoTo(${year}, ${month}, ${day})">${day}</div>`;
    }
    container.innerHTML = html;
}

function miniCalPrev() {
    _miniCalDate.setMonth(_miniCalDate.getMonth() - 1);
    renderMiniCal();
    if (calendar) {
        calendar.gotoDate(new Date(_miniCalDate.getFullYear(), _miniCalDate.getMonth(), 1));
    }
}

function miniCalNext() {
    _miniCalDate.setMonth(_miniCalDate.getMonth() + 1);
    renderMiniCal();
    if (calendar) {
        calendar.gotoDate(new Date(_miniCalDate.getFullYear(), _miniCalDate.getMonth(), 1));
    }
}

function miniCalGoTo(year, month, day) {
    _miniCalDate = new Date(year, month, day);
    renderMiniCal();
    if (calendar) calendar.gotoDate(_miniCalDate);
}

function calNavPrev() {
    if (calendar) calendar.prev();
}

function calNavNext() {
    if (calendar) calendar.next();
}

function calGoToday() {
    if (calendar) {
        calendar.today();
        _miniCalDate = new Date();
        renderMiniCal();
    }
}

function setCalView(viewName, btn) {
    if (calendar) calendar.changeView(viewName);
    document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

let _registrandoActividadCal = false;