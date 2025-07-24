// 大学教室予約システム
document.addEventListener('DOMContentLoaded', () => {
    // グローバル変数
    let token = null;
    let allClassroomsData = [];
    let closureData = {};
    let currentCalendarDate = new Date();
    let currentState = { view: 'login' };
    let inactivityTimer;
    const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15分
    
    // DOM要素の参照
    const elements = {
        loginView: document.getElementById('login-view'),
        loginForm: document.getElementById('login-form'),
        loginGroupSelect: document.getElementById('login-group-select'),
        userInfo: document.getElementById('user-info'),
        userNameSpan: document.getElementById('user-name'),
        logoutButton: document.getElementById('logout-button'),
        adminPanelButton: document.getElementById('admin-panel-button'),
        profileButton: document.getElementById('profile-button'),
        logo: document.querySelector('.logo'),
        mainContent: document.getElementById('main-content'),
        homeView: document.getElementById('home-view'),
        navigateToReservation: document.getElementById('navigate-to-reservation'),
        navigateToCalendar: document.getElementById('navigate-to-calendar'),
        navigateToHistory: document.getElementById('navigate-to-history'),
        reservationView: document.getElementById('reservation-view'),
        calendarView: document.getElementById('calendar-view'),
        historyView: document.getElementById('history-view'),
        profileView: document.getElementById('profile-view'),
        adminView: document.getElementById('admin-view'),
        firstLoginSetupView: document.getElementById('first-login-setup-view'),
        requestsList: document.getElementById('requests-list'),
        reservationsList: document.getElementById('reservations-list'),
        adminClassroomList: document.getElementById('admin-classroom-list'),
        reservationModal: document.getElementById('reservation-modal'),
        closeModalButton: document.getElementById('close-modal-button'),
        modalClassroomName: document.getElementById('modal-classroom-name'),
        modalClassroomCapacity: document.getElementById('modal-classroom-capacity'),
        modalClassroomIdInput: document.getElementById('modal-classroom-id'),
        reservationForm: document.getElementById('reservation-form'),
        mapDatePicker: document.getElementById('map-date-picker'),
        floorSelector: document.getElementById('floor-selector'),
        floorMapContainer: document.getElementById('floor-map-container'),
        floorMapSvg: document.getElementById('floor-map-svg'),
    };
    
    // ユーティリティ関数
    const parseJwt = (token) => {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error("JWTの解析に失敗しました:", e);
            return null;
        }
    };
    
    const formatDateForAPI = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const toYYYYMMDD = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // 状態管理
    const pushState = (newState, title = '') => {
        currentState = { ...currentState, ...newState };
        const url = new URL(window.location);
        url.searchParams.set('view', currentState.view);
        history.pushState(currentState, title, url.toString());
    };
    
    const replaceState = (newState, title = '') => {
        currentState = { ...currentState, ...newState };
        const url = new URL(window.location);
        url.searchParams.set('view', currentState.view);
        history.replaceState(currentState, title, url.toString());
    };
    
    // ビュー管理
    const showView = (viewId) => {
        const views = document.querySelectorAll('#main-content > div[id$="-view"]');
        views.forEach(view => view.classList.add('hidden'));
        const viewToShow = document.getElementById(viewId);
        if (viewToShow) {
            viewToShow.classList.remove('hidden');
        }
    };
    
    const showViewWithHistory = (viewId, pushToHistory = true) => {
        showView(viewId);
        if (pushToHistory) {
            pushState({ view: viewId });
        } else {
            replaceState({ view: viewId });
        }
        
        if (viewId === 'home-view' && token) {
            setTimeout(() => loadSystemNotice(), 100);
        }
    };
    
    // UI更新
    const updateUI = async () => {
        token = localStorage.getItem('authToken');
        const payload = token ? parseJwt(token) : null;
        
        if (payload) {
            elements.userInfo.classList.remove('hidden');
            elements.userNameSpan.textContent = payload.name;
            elements.adminPanelButton.classList.toggle('hidden', payload.role !== 'admin');
            await loadSystemNotice();
            await fetchAllClassrooms();
        } else {
            localStorage.removeItem('authToken');
            token = null;
            allClassroomsData = [];
            elements.userInfo.classList.add('hidden');
        }
    };

    // セッションタイムアウト管理
    const resetInactivityTimer = () => {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
        }
        
        if (token) {
            inactivityTimer = setTimeout(() => {
                alert('セッションがタイムアウトしました。安全のため自動的にログアウトします。');
                handleLogout();
            }, INACTIVITY_TIMEOUT);
        }
    };

    const setupActivityMonitoring = () => {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        events.forEach(event => {
            document.addEventListener(event, resetInactivityTimer, true);
        });
    };
    
    // 予約期間計算
    const getReservationPeriod = () => {
        const getWeekNumber = (date) => {
            const baseDate = new Date('2024-01-01');
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
            const diffTime = targetDate.getTime() - baseDate.getTime();
            const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
            return diffWeeks + 1;
        };
        
        const getMonday = (date) => {
            const d = new Date(date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            monday.setHours(0, 0, 0, 0);
            return monday;
        };
        
        const now = new Date();
        const currentWeekNumber = getWeekNumber(now);
        const currentMonday = getMonday(now);
        
        let reservationStartMonday;
        
        if (currentWeekNumber % 2 === 1) {
            reservationStartMonday = currentMonday;
        } else {
            reservationStartMonday = new Date(currentMonday);
            reservationStartMonday.setDate(currentMonday.getDate() - 7);
        }
        
        const reservationEndDate = new Date(reservationStartMonday);
        reservationEndDate.setDate(reservationStartMonday.getDate() + 13);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (reservationEndDate < today) {
            let nextOddMonday = new Date(currentMonday);
            if (currentWeekNumber % 2 === 0) {
                nextOddMonday.setDate(currentMonday.getDate() + 7);
            } else {
                nextOddMonday.setDate(currentMonday.getDate() + 14);
            }
            
            return { 
                isReservable: false, 
                start: null, 
                end: null,
                nextOpenDate: nextOddMonday
            };
        }
        
        const effectiveStartDate = reservationStartMonday < today ? today : reservationStartMonday;
        
        return {
            isReservable: true,
            start: effectiveStartDate,
            end: reservationEndDate
        };
    };
    
    // API通信
    const apiCall = async (url, options = {}, isPublic = false) => {
        const defaultHeaders = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
    
        if (!isPublic) {
            const currentToken = localStorage.getItem('authToken');
            if (!currentToken) {
                handleLogout();
                throw new Error('認証エラー。再度ログインしてください。');
            }
            defaultHeaders['Authorization'] = `Bearer ${currentToken}`;
        }
    
        const config = { ...options, headers: defaultHeaders };
        const response = await fetch(url, config);
    
        if (!response.ok) {
            let errorMessage = `APIエラー: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (e) {
                console.error("エラー応答はJSON形式ではありませんでした:", e);
            }
            throw new Error(errorMessage);
        }
        
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    };
    
    // ログイン関連
    const populateGroupDropdown = async () => {
        try {
            const organizations = await apiCall('/api/organizations', {}, true);
            
            elements.loginGroupSelect.innerHTML = '<option value="">団体を選択してください</option>';
            organizations.forEach(org => {
                const option = document.createElement('option');
                option.value = org.login_id;
                option.textContent = org.name;
                elements.loginGroupSelect.appendChild(option);
            });
        } catch (error) {
            console.error('団体リストの取得エラー:', error);
            elements.loginGroupSelect.innerHTML = '<option value="">団体の取得に失敗</option>';
        }
    };
    
    const handleLogin = async (event) => {
        event.preventDefault();
        const form = event.target;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'ログイン中...';
        
        try {
            const formData = new FormData(form);
            const loginId = (formData.get('login-id') || '').trim();
            const password = (formData.get('login-pass') || '').trim();
            if (!loginId || !password) throw new Error('団体名とパスワードを入力してください。');
            
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loginId, password })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'ログインに失敗しました');
            
            localStorage.setItem('authToken', data.token);
            await updateUI();
            resetInactivityTimer();
            
            if (data.organization && data.organization.isFirstLogin) {
                showViewWithHistory('first-login-setup-view', false);
            } else {
                showViewWithHistory('home-view', false);
            }
        } catch (error) {
            alert('ログインエラー: ' + error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'ログイン';
        }
    };

    const handleLogout = () => {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
        localStorage.removeItem('authToken');
        token = null;
        allClassroomsData = [];
        elements.userInfo.classList.add('hidden');
        showViewWithHistory('login-view', false);
    };
    
    // 教室データ管理
    const fetchAllClassrooms = async () => {
        try {
            if (!token) return;
            
            const data = await apiCall('/api/classrooms/all');
            if (!Array.isArray(data)) {
                throw new Error('サーバーからの応答が不正です');
            }
            
            allClassroomsData = data;
        } catch (error) {
            console.error('教室データの取得に失敗:', error.message);
            allClassroomsData = [];
        }
    };
    
    const updateFloorMap = async () => {
        const selectedDate = elements.mapDatePicker.value;
        const selectedFloor = elements.floorSelector.value;
        
        if (!selectedDate) {
            elements.floorMapSvg.innerHTML = `<text x="20" y="40" font-size="24">日付を選択してください</text>`;
            return;
        }
        
        if (allClassroomsData.length === 0) {
            await fetchAllClassrooms();
            if (allClassroomsData.length === 0) {
                elements.floorMapSvg.innerHTML = `<text x="20" y="40" font-size="24">教室データの取得に失敗しました</text>`;
                return;
            }
        }
        
        const floorSvgs = {
            '1': `<image href="./images/floor1.png" width="800" height="600" />
                <rect class="classroom-shape" data-classroom-id="1" x="82" y="319" width="66" height="82"><title>C101</title></rect>
                <rect class="classroom-shape" data-classroom-id="2" x="275" y="104" width="68" height="46"><title>C104</title></rect>
                <rect class="classroom-shape" data-classroom-id="3" x="378" y="198" width="64" height="82"><title>C105</title></rect>
                <rect class="classroom-shape" data-classroom-id="4" x="378" y="282" width="64" height="119"><title>C106</title></rect>`,
            '2': `<image href="./images/floor2.png" width="800" height="600" />
                <rect class="classroom-shape" data-classroom-id="5" x="110" y="141" width="83" height="179"><title>C202</title></rect>
                <rect class="classroom-shape" data-classroom-id="6" x="214" y="52" width="122" height="56"><title>C203</title></rect>
                <rect class="classroom-shape" data-classroom-id="7" x="336" y="52" width="92" height="56"><title>C204</title></rect>
                <rect class="classroom-shape" data-classroom-id="8" x="469" y="170" width="83" height="104"><title>C205</title></rect>
                <rect class="classroom-shape" data-classroom-id="9" x="469" y="275" width="83" height="150"><title>C208</title></rect>`,
            '3': `<image href="./images/floor3.png" width="800" height="600" />
                <rect class="classroom-shape" data-classroom-id="10" x="80" y="356" width="87" height="109"><title>C301</title></rect>
                <rect class="classroom-shape" data-classroom-id="11" x="80" y="168" width="87" height="187"><title>C302</title></rect>
                <rect class="classroom-shape" data-classroom-id="12" x="190" y="76" width="126" height="58"><title>C303</title></rect>
                <rect class="classroom-shape" data-classroom-id="13" x="318" y="76" width="94" height="58"><title>C304</title></rect>
                <rect class="classroom-shape" data-classroom-id="14" x="455" y="199" width="87" height="108"><title>C305</title></rect>
                <rect class="classroom-shape" data-classroom-id="15" x="455" y="309" width="87" height="156"><title>C306</title></rect>
                <rect class="classroom-shape" data-classroom-id="16" x="198" y="505" width="159" height="72"><title>C307</title></rect>
                <rect class="classroom-shape" data-classroom-id="17" x="358" y="505" width="165" height="72"><title>C308</title></rect>`,
            '4': `<image href="./images/floor4.png" width="800" height="600" />
                <rect class="classroom-shape" data-classroom-id="18" x="196" y="327" width="83" height="104"><title>C401</title></rect>
                <rect class="classroom-shape" data-classroom-id="19" x="196" y="146" width="83" height="180"><title>C402</title></rect>
                <rect class="classroom-shape" data-classroom-id="20" x="301" y="57" width="121" height="56"><title>C403</title></rect>
                <rect class="classroom-shape" data-classroom-id="21" x="424" y="57" width="90" height="56"><title>C404</title></rect>
                <rect class="classroom-shape" data-classroom-id="22" x="555" y="175" width="83" height="105"><title>C405</title></rect>
                <rect class="classroom-shape" data-classroom-id="23" x="555" y="281" width="83" height="150"><title>C406</title></rect>
                <rect class="classroom-shape" data-classroom-id="24" x="493" y="470" width="128" height="69"><title>C407</title></rect>
                <rect class="classroom-shape" data-classroom-id="25" x="398" y="432" width="94" height="107"><title>C408</title></rect>
                <rect class="classroom-shape" data-classroom-id="26" x="310" y="432" width="86" height="107"><title>C409</title></rect>`,
        };
        
        elements.floorMapSvg.innerHTML = floorSvgs[selectedFloor] || `<text x="20" y="40" font-size="24">平面図が見つかりません</text>`;
        
        try {
            const reservationData = await apiCall(`/api/reservations/status?date=${selectedDate}`);
            const reservedIds = new Set(reservationData.reservedClassroomIds);
            
            const closures = await apiCall(`/api/classroom-closures?date=${selectedDate}`);
            const noSoundIds = new Set(
                closures
                    .filter(c => c.restriction_type === 'no-sound')
                    .map(c => c.classroom_id)
            );
            const closedIds = new Set(
                closures
                    .filter(c => c.restriction_type === 'closed')
                    .map(c => c.classroom_id)
            );
            
            const classroomMap = new Map(allClassroomsData.map(c => [c.id, c]));
            
            document.querySelectorAll('.classroom-shape').forEach(roomElement => {
                const classroomId = parseInt(roomElement.dataset.classroomId, 10);
                const classroomData = classroomMap.get(classroomId);
                
                if (classroomData && classroomData.is_usable && !closedIds.has(classroomId)) {
                    roomElement.style.display = '';
                    roomElement.classList.remove('available', 'reserved', 'no-sound');
                    
                    if (reservedIds.has(classroomId)) {
                        roomElement.classList.add('reserved');
                    } else if (noSoundIds.has(classroomId)) {
                        roomElement.classList.add('no-sound');
                    } else {
                        roomElement.classList.add('available');
                    }
                } else {
                    roomElement.style.display = 'none';
                }
            });
        } catch (error) {
            console.error('平面図の更新エラー:', error);
        }
    };
    
    // 予約モーダル
    const openReservationModal = async (classroomId) => {
        try {
            const period = getReservationPeriod();
            if (!period.isReservable) {
                alert('現在予約可能な期間はありません。');
                return;
            }
            
            const room = await apiCall(`/api/classrooms/details/${classroomId}`);
            
            elements.modalClassroomIdInput.value = room.id;
            elements.modalClassroomName.textContent = `${room.building_name} ${room.room_number} (${room.room_name || ''})`;
            elements.modalClassroomCapacity.textContent = room.capacity + '名';
            
            const dateInput = document.getElementById('reservation-date');
            dateInput.min = toYYYYMMDD(period.start);
            dateInput.max = toYYYYMMDD(period.end);
            dateInput.value = elements.mapDatePicker.value;
            
            if (dateInput.value) {
                await checkSoundRestriction(classroomId, dateInput.value);
            }
            
            dateInput.onchange = async () => {
                if (dateInput.value) {
                    await checkSoundRestriction(classroomId, dateInput.value);
                }
            };
            
            elements.reservationModal.classList.remove('hidden');
        } catch(error) {
            alert(error.message);
        }
    };
    
    const closeReservationModal = () => {
        elements.reservationModal.classList.add('hidden');
        elements.reservationForm.reset();
    };
    
    const checkSoundRestriction = async (classroomId, date) => {
        try {
            const closures = await apiCall(`/api/classroom-closures?date=${date}`);
            const restriction = closures.find(c => 
                c.classroom_id === parseInt(classroomId) && 
                c.closure_date === date && 
                c.restriction_type === 'no-sound'
            );
            
            const warningBox = document.getElementById('sound-restriction-warning');
            const warningText = document.getElementById('sound-restriction-text');
            
            if (warningBox && warningText) {
                if (restriction) {
                    warningText.textContent = 'この日は音出し禁止です。';
                    warningBox.classList.remove('hidden');
                } else {
                    warningBox.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('音出し制限チェックエラー:', error);
        }
    };
    
    // カレンダー機能
    const renderCalendar = async () => {
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();
        
        document.getElementById('current-month-year').textContent = `${year}年${month + 1}月`;
        
        const calendarContainer = document.getElementById('calendar-container');
        calendarContainer.innerHTML = '';
        
        const calendarGrid = document.createElement('div');
        calendarGrid.className = 'calendar-grid';
        
        const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
        weekDays.forEach((day, index) => {
            const header = document.createElement('div');
            header.className = 'calendar-header';
            if (index === 0) header.classList.add('sunday');
            if (index === 6) header.classList.add('saturday');
            header.textContent = day;
            calendarGrid.appendChild(header);
        });
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const firstDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const monthReservations = await fetchMonthReservations(year, month);
        
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const dayDiv = createDayElement(year, month - 1, prevMonthLastDay - i, true);
            calendarGrid.appendChild(dayDiv);
        }
        
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const dateStr = formatDateForAPI(currentDate);
            const reservations = monthReservations[dateStr] || [];
            
            const dayDiv = createDayElement(year, month, day, false, currentDate < today, reservations);
            calendarGrid.appendChild(dayDiv);
        }
        
        const remainingDays = 42 - (firstDayOfWeek + daysInMonth);
        for (let day = 1; day <= remainingDays; day++) {
            const dayDiv = createDayElement(year, month + 1, day, true);
            calendarGrid.appendChild(dayDiv);
        }
        
        calendarContainer.appendChild(calendarGrid);
    };
    
    const createDayElement = (year, month, day, isOtherMonth, isPast = false, reservations = []) => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        
        if (isOtherMonth) dayDiv.classList.add('other-month');
        if (isPast) dayDiv.classList.add('past');
        
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        
        if (dayOfWeek === 0) dayDiv.classList.add('sunday');
        if (dayOfWeek === 6) dayDiv.classList.add('saturday');
        
        const period = getReservationPeriod();
        if (period.isReservable && date >= period.start && date <= period.end && !isPast && dayOfWeek !== 0) {
            dayDiv.classList.add('available');
        }
        
        if (reservations.length > 0) {
            dayDiv.classList.add('has-reservation');
            const countSpan = document.createElement('span');
            countSpan.className = 'reservation-count';
            countSpan.textContent = `${reservations.length}件`;
            dayDiv.appendChild(countSpan);
        }
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayDiv.appendChild(dayNumber);
        
        if (!isPast && !isOtherMonth) {
            dayDiv.addEventListener('click', () => showDayReservations(date, reservations));
        }
        
        return dayDiv;
    };
    
    const fetchMonthReservations = async (year, month) => {
        try {
            const allReservations = await apiCall('/api/my-reservations');
            
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);
            
            const reservationsByDate = {};
            allReservations.forEach(res => {
                const resDate = new Date(res.reservation_date);
                if (resDate >= startDate && resDate <= endDate) {
                    const dateStr = res.reservation_date;
                    if (!reservationsByDate[dateStr]) {
                        reservationsByDate[dateStr] = [];
                    }
                    reservationsByDate[dateStr].push(res);
                }
            });
            
            return reservationsByDate;
        } catch (error) {
            console.error('予約情報取得エラー:', error);
            return {};
        }
    };
    
    const showDayReservations = (date, reservations) => {
        const container = document.getElementById('day-reservations');
        const titleElement = document.getElementById('selected-date-title');
        const listElement = document.getElementById('day-reservations-list');
        
        const dateStr = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        
        titleElement.textContent = `${dateStr}の予約`;
        
        listElement.innerHTML = '';
        if (reservations.length === 0) {
            listElement.innerHTML = '<li>この日の予約はありません</li>';
        } else {
            reservations.forEach(res => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <strong>${res.building_name} ${res.room_number}</strong><br>
                    目的: ${res.purpose}<br>
                    参加人数: ${res.participants}名
                `;
                listElement.appendChild(li);
            });
        }
        
        container.classList.remove('hidden');
    };
    
    // 管理画面
    const initializeAdminPanel = async () => {
        await loadExistingClosures();
        renderClassroomMatrix();
        loadNoticeForAdmin();
        await populatePasswordResetDropdown();
    };
    
    const loadExistingClosures = async () => {
        try {
            const closures = await apiCall('/api/admin/classroom-closures');
            closureData = {};
            
            closures.forEach(closure => {
                const key = `${closure.classroom_id}_${closure.closure_date}`;
                closureData[key] = closure.restriction_type || 'closed';
            });
        } catch (error) {
            console.error('使用制限データ読み込みエラー:', error);
        }
    };
    
    const renderClassroomMatrix = async () => {
        const container = document.getElementById('classroom-matrix-container');
        container.innerHTML = '';
        
        try {
            const allClassrooms = await apiCall('/api/classrooms/all');
            
            const dates = [];
            const startDate = new Date();
            for (let i = 0; i < 30; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);
                dates.push(date);
            }
            
            const table = document.createElement('table');
            table.className = 'classroom-matrix';
            
            const headerRow = document.createElement('tr');
            headerRow.innerHTML = '<th>教室</th>';
            
            dates.forEach(date => {
                const th = document.createElement('th');
                th.className = 'date-header';
                const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
                const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
                th.innerHTML = `${dateStr}<span class="date-num">${dayOfWeek}</span>`;
                headerRow.appendChild(th);
            });
           
            table.appendChild(headerRow);
           
           const cBuildingClassrooms = allClassrooms
               .filter(c => c.room_number && c.room_number.startsWith('C'))
               .sort((a, b) => a.room_number.localeCompare(b.room_number));
           
           cBuildingClassrooms.forEach(classroom => {
               const row = document.createElement('tr');
               
               const nameCell = document.createElement('td');
               nameCell.textContent = classroom.room_number;
               row.appendChild(nameCell);
               
               dates.forEach(date => {
                   const cell = document.createElement('td');
                   const dateStr = formatDateForAPI(date);
                   const key = `${classroom.id}_${dateStr}`;
                   
                   const select = document.createElement('select');
                   select.className = 'restriction-select';
                   select.dataset.classroomId = classroom.id;
                   select.dataset.date = dateStr;
                   
                   const currentValue = closureData[key] || 'available';
                   select.innerHTML = `
                       <option value="available" ${currentValue === 'available' ? 'selected' : ''}>使用可</option>
                       <option value="closed" ${currentValue === 'closed' ? 'selected' : ''}>使用不可</option>
                       <option value="no-sound" ${currentValue === 'no-sound' ? 'selected' : ''}>音出し禁止</option>
                   `;
                   
                   select.addEventListener('change', (e) => {
                       const value = e.target.value;
                       if (value === 'available') {
                           delete closureData[key];
                       } else {
                           closureData[key] = value;
                       }
                   });
                   
                   cell.appendChild(select);
                   row.appendChild(cell);
               });
               
               table.appendChild(row);
           });
           
           container.appendChild(table);
           
       } catch (error) {
           console.error('マトリックス描画エラー:', error);
           container.innerHTML = '<p>エラーが発生しました。</p>';
       }
   };
   
   const loadSystemNotice = async () => {
        try {
            if (!token) return;
            
            const data = await apiCall('/api/system-notice');
            
            const noticeContent = document.getElementById('notice-content');
            const noticeBox = document.getElementById('student-notice');
            
            if (noticeContent && noticeBox) {
                if (data.notice && data.notice.trim()) {
                    noticeContent.textContent = data.notice;
                    noticeBox.classList.remove('hidden');
                } else {
                    noticeBox.classList.add('hidden');
                }
            } else {
                console.error('お知らせ要素が見つかりません');
            }
        } catch (error) {
            console.error('お知らせ読み込みエラー:', error);
        }
    };
   
   const loadNoticeForAdmin = async () => {
       try {
           const data = await apiCall('/api/system-notice', {
               headers: { 'Content-Type': 'application/json' }
           });
           
           const noticeTextarea = document.getElementById('admin-notice-text');
           if (noticeTextarea) {
               noticeTextarea.value = data.notice || '';
           }
       } catch (error) {
           console.error('お知らせ読み込みエラー:', error);
       }
   };

   const populatePasswordResetDropdown = async () => {
       try {
           const organizations = await apiCall('/api/organizations', {}, true);
           const select = document.getElementById('reset-target-organization');
           
           if (select) {
               select.innerHTML = '<option value="">団体を選択してください</option>';
               organizations.forEach(org => {
                   if (org.login_id !== 'admin') {
                       const option = document.createElement('option');
                       option.value = org.login_id;
                       option.textContent = org.name;
                       select.appendChild(option);
                   }
               });
           }
       } catch (error) {
           console.error('団体リスト取得エラー:', error);
       }
   };
   
   // 履歴関連
   const fetchHistory = async () => {
       showView('history-view');
       elements.requestsList.innerHTML = '<li>読み込み中...</li>';
       elements.reservationsList.innerHTML = '<li>読み込み中...</li>';
       
       try {
           const [requests, reservations] = await Promise.all([
               apiCall('/api/my-requests'),
               apiCall('/api/my-reservations')
           ]);
           
           renderRequests(requests);
           renderReservations(reservations);
       } catch (error) {
           console.error('履歴取得エラー:', error);
           elements.requestsList.innerHTML = '<li>履歴の取得に失敗しました。</li>';
           elements.reservationsList.innerHTML = '';
       }
   };
   
   const renderRequests = (requests) => {
       elements.requestsList.innerHTML = requests.length === 0 ? '<li>申請中のリクエストはありません。</li>' : '';
       
       requests.forEach(req => {
           const li = document.createElement('li');
           let statusText = { 
               pending: '申請中', 
               approved: '承認済', 
               rejected: '却下' 
           }[req.status] || req.status;
           
           if (req.is_cancelled) statusText = 'キャンセル済み';
           
           const requestedRooms = req.requested_classrooms_details.map(r => r.room_number).join(', ');

           const submittedAtJST = new Date(req.submitted_at).toLocaleString('ja-JP', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
           
           li.innerHTML = `
               <p><strong>申請日時:</strong> ${new Date(req.submitted_at).toLocaleString('ja-JP')}</p>
               <p><strong>利用希望日:</strong> ${req.request_date}</p>
               <p><strong>希望教室:</strong> ${requestedRooms}</p>
               <p><strong>利用目的:</strong> ${req.purpose}</p>
               <p><strong>状況:</strong> <span class="status status-${req.is_cancelled ? 'cancelled' : req.status}">${statusText}</span></p>
               ${req.status === 'approved' && !req.is_cancelled ? `<p><strong>割当教室:</strong> ${req.building_name} ${req.room_number}</p>` : ''}
           `;
           
           if (req.status === 'pending' && !req.is_cancelled) {
               const cancelButton = document.createElement('button');
               cancelButton.textContent = 'キャンセル';
               cancelButton.className = 'cancel-button';
               cancelButton.onclick = () => handleCancelRequest(req.id);
               li.appendChild(cancelButton);
           }
           
           elements.requestsList.appendChild(li);
       });
   };
   
   const renderReservations = (reservations) => {
       elements.reservationsList.innerHTML = reservations.length === 0 ? '<li>確定済みの予約はありません。</li>' : '';
       
       reservations.forEach(res => {
           const li = document.createElement('li');
           li.innerHTML = `
               <p><strong>利用日:</strong> ${res.reservation_date}</p>
               <p><strong>利用教室:</strong> ${res.building_name} ${res.room_number} (${res.room_name || ''})</p>
               <p><strong>利用目的:</strong> ${res.purpose}</p>
               <p><strong>参加人数:</strong> ${res.participants}名</p>
           `;
           elements.reservationsList.appendChild(li);
       });
   };
   
   const handleCancelRequest = async (requestId) => {
       if (!confirm('この予約リクエストをキャンセルしますか？')) return;
       
       try {
           await apiCall(`/api/cancel-request/${requestId}`, { method: 'POST' });
           alert('予約リクエストをキャンセルしました。');
           fetchHistory();
       } catch (error) {
           alert(error.message);
       }
   };
   
   // イベントリスナー設定
   const setupEventListeners = () => {
       // ログイン関連
       elements.loginForm?.addEventListener('submit', handleLogin);
       
       // 初回ログイン設定
        const firstLoginForm = document.getElementById('first-login-form');
            if (firstLoginForm && !firstLoginForm.hasAttribute('data-listener-added')) {
                firstLoginForm.setAttribute('data-listener-added', 'true');
                firstLoginForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const newPassword = document.getElementById('first-login-new-password').value;
                    const confirmPassword = document.getElementById('first-login-confirm-password').value;
                    
                    if (newPassword !== confirmPassword) {
                        alert('パスワードが一致しません。');
                        return;
                    }
                    
                    const submitButton = e.target.querySelector('button[type="submit"]');
                    submitButton.disabled = true;
                    submitButton.textContent = '設定中...';
                    
                    try {
                        const response = await apiCall('/api/complete-first-login', {
                            method: 'POST',
                            body: JSON.stringify({ newPassword })
                        });
                        
                        if (response.token) {
                            localStorage.setItem('authToken', response.token);
                        }
                        
                        alert('初回ログイン設定が完了しました！');
                        await updateUI();
                        showViewWithHistory('home-view', false);
                        
                    } catch (error) {
                        alert('設定エラー: ' + error.message);
                    } finally {
                        submitButton.disabled = false;
                        submitButton.textContent = '設定を完了する';
                    }
                });
            }

       // パスワード変更
       const passwordChangeForm = document.getElementById('password-change-form');
       if (passwordChangeForm && !passwordChangeForm.hasAttribute('data-listener-added')) {
           passwordChangeForm.setAttribute('data-listener-added', 'true');
           passwordChangeForm.addEventListener('submit', async (e) => {
               e.preventDefault();
               
               const currentPassword = document.getElementById('current-password').value;
               const newPassword = document.getElementById('new-password').value;
               const confirmNewPassword = document.getElementById('confirm-new-password').value;
               
               if (newPassword !== confirmNewPassword) {
                   alert('新しいパスワードが一致しません。');
                   return;
               }
               
               const submitButton = e.target.querySelector('button[type="submit"]');
               submitButton.disabled = true;
               submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 変更中...';
               
               try {
                   await apiCall('/api/change-password', {
                       method: 'POST',
                       body: JSON.stringify({ currentPassword, newPassword })
                   });
                   
                   alert('パスワードを変更しました。');
                   e.target.reset();
               } catch (error) {
                   alert('エラー: ' + error.message);
               } finally {
                   submitButton.disabled = false;
                   submitButton.innerHTML = '<i class="fas fa-key"></i> パスワードを変更';
               }
           });
       }

       // ヘッダー
       elements.logoutButton?.addEventListener('click', () => {
            handleLogout();
        });
       elements.profileButton?.addEventListener('click', async () => {
            showViewWithHistory('profile-view');
            
            try {
                const userInfo = await apiCall('/api/user-info');
                document.getElementById('display-name').textContent = userInfo.name;
                document.getElementById('display-login-id').textContent = userInfo.login_id;
            } catch (error) {
                console.error('ユーザー情報取得エラー:', error);
            }
        });
       elements.logo?.addEventListener('click', () => {
           if (token) showViewWithHistory('home-view');
       });
       
       // ナビゲーション
       elements.navigateToReservation?.addEventListener('click', async () => {
           if (allClassroomsData.length === 0) {
               await fetchAllClassrooms();
           }
           
           const period = getReservationPeriod();
           if (!period.isReservable) {
               alert('現在予約可能な期間はありません。');
               return;
           }
           
           showViewWithHistory('reservation-view');
           
           if (elements.mapDatePicker) {
               elements.mapDatePicker.min = toYYYYMMDD(period.start);
               elements.mapDatePicker.max = toYYYYMMDD(period.end);
               elements.mapDatePicker.value = toYYYYMMDD(period.start);
           }
           
           setTimeout(() => updateFloorMap(), 100);
       });
       
       elements.navigateToCalendar?.addEventListener('click', () => {
           showViewWithHistory('calendar-view');
           currentCalendarDate = new Date();
           renderCalendar();
       });
       
       elements.navigateToHistory?.addEventListener('click', () => {
           showViewWithHistory('history-view');
           fetchHistory();
       });
       
       // 管理者パネル
       elements.adminPanelButton?.addEventListener('click', async () => {
           showViewWithHistory('admin-view');
           
           document.querySelectorAll('.admin-tab').forEach(tab => {
               tab.addEventListener('click', (e) => {
                   document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                   e.target.classList.add('active');
                   
                   document.querySelectorAll('.admin-tab-content').forEach(content => {
                       content.classList.add('hidden');
                   });
                   
                   const tabName = e.target.dataset.tab;
                   const targetContent = document.getElementById(`${tabName}-tab`);
                   if (targetContent) {
                       targetContent.classList.remove('hidden');
                   }
                   
                   if (tabName === 'permanent-closure') {
                       fetchAdminClassroomList();
                   } else if (tabName === 'notice-management') {
                       loadNoticeForAdmin();
                   } else if (tabName === 'closure-matrix') {
                       initializeAdminPanel();
                   } else if (tabName === 'password-reset') {
                       populatePasswordResetDropdown();
                   }
               });
           });
           
            const saveClosuresBtn = document.getElementById('save-closures');
            if (saveClosuresBtn && !saveClosuresBtn.hasAttribute('data-listener-added')) {
                saveClosuresBtn.setAttribute('data-listener-added', 'true');
                saveClosuresBtn.addEventListener('click', async () => {
                    saveClosuresBtn.disabled = true;
                    saveClosuresBtn.textContent = '保存中...';
                    
                    try {
                        const promises = Object.keys(closureData).map(key => {
                            const [classroomId, date] = key.split('_');
                            return apiCall('/api/admin/classroom-closures', {
                                method: 'POST',
                                body: JSON.stringify({
                                    classroomId: parseInt(classroomId),
                                    closureDate: date,
                                    restrictionType: closureData[key]
                                })
                            });
                        });
                        
                        await Promise.all(promises);
                        alert('変更を保存しました。');
                    } catch (error) {
                        alert('保存中にエラーが発生しました。');
                        console.error('保存エラー:', error);
                    } finally {
                        saveClosuresBtn.disabled = false;
                        saveClosuresBtn.textContent = '変更を保存';
                    }
                });
            }
           
           const saveNoticeBtn = document.getElementById('save-notice');
           if (saveNoticeBtn && !saveNoticeBtn.hasAttribute('data-listener-added')) {
               saveNoticeBtn.setAttribute('data-listener-added', 'true');
               saveNoticeBtn.addEventListener('click', async () => {
                   const noticeText = document.getElementById('admin-notice-text').value;
                   
                   try {
                       await apiCall('/api/admin/system-notice', {
                           method: 'POST',
                           body: JSON.stringify({ noticeText })
                       });
                       alert('お知らせを更新しました。');
                   } catch (error) {
                       alert('お知らせの保存に失敗しました。');
                       console.error('お知らせ保存エラー:', error);
                   }
               });
           }

           // 管理者用パスワードリセット
           const adminPasswordResetForm = document.getElementById('admin-password-reset-form');
           if (adminPasswordResetForm && !adminPasswordResetForm.hasAttribute('data-listener-added')) {
               adminPasswordResetForm.setAttribute('data-listener-added', 'true');
               adminPasswordResetForm.addEventListener('submit', async (e) => {
                   e.preventDefault();
                   
                   const loginId = document.getElementById('reset-target-organization').value;
                   if (!loginId) {
                       alert('団体を選択してください。');
                       return;
                   }
                   
                   if (!confirm(`「${document.getElementById('reset-target-organization').selectedOptions[0].textContent}」のパスワードをリセットしますか？`)) {
                       return;
                   }
                   
                   const submitButton = e.target.querySelector('button[type="submit"]');
                   submitButton.disabled = true;
                   submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> リセット中...';
                   
                   try {
                       const response = await apiCall('/api/admin/reset-password', {
                           method: 'POST',
                           body: JSON.stringify({ loginId })
                       });
                       
                       document.getElementById('reset-org-name').textContent = document.getElementById('reset-target-organization').selectedOptions[0].textContent;
                       document.getElementById('new-password-display').textContent = response.newPassword;
                       document.getElementById('reset-result').classList.remove('hidden');
                       
                       e.target.reset();
                       
                   } catch (error) {
                       alert('エラー: ' + error.message);
                   } finally {
                       submitButton.disabled = false;
                       submitButton.innerHTML = '<i class="fas fa-refresh"></i> パスワードをリセット';
                   }
               });
           }

           const copyPasswordBtn = document.getElementById('copy-password');
           if (copyPasswordBtn && !copyPasswordBtn.hasAttribute('data-listener-added')) {
               copyPasswordBtn.setAttribute('data-listener-added', 'true');
               copyPasswordBtn.addEventListener('click', async () => {
                   const password = document.getElementById('new-password-display').textContent;
                   try {
                       await navigator.clipboard.writeText(password);
                       copyPasswordBtn.innerHTML = '<i class="fas fa-check"></i> コピー済み';
                       setTimeout(() => {
                           copyPasswordBtn.innerHTML = '<i class="fas fa-copy"></i> パスワードをコピー';
                       }, 2000);
                   } catch (error) {
                       alert('コピーに失敗しました。手動でコピーしてください。');
                   }
               });
           }
           
           await initializeAdminPanel();
           fetchAdminClassroomList();
       });
       
       // 恒久的使用禁止の管理
       elements.adminClassroomList?.addEventListener('change', async (event) => {
           if (event.target.type !== 'checkbox') return;
           
           const classroomId = event.target.dataset.classroomId;
           const is_usable = event.target.checked;
           
           try {
               await apiCall(`/api/admin/classrooms/${classroomId}/toggle_usability`, {
                   method: 'PUT',
                   body: JSON.stringify({ is_usable })
               });
               fetchAdminClassroomList();
           } catch (error) {
               alert(error.message);
               event.target.checked = !is_usable;
           }
       });
       
       // 予約モーダル
       elements.closeModalButton?.addEventListener('click', closeReservationModal);
       elements.reservationModal?.addEventListener('click', (e) => {
           if (e.target === elements.reservationModal) closeReservationModal();
       });
       
       document.addEventListener('keydown', (e) => {
           if (e.key === 'Escape' && !elements.reservationModal.classList.contains('hidden')) {
               closeReservationModal();
           }
       });
       
       elements.reservationForm?.addEventListener('submit', async (event) => {
           event.preventDefault();
           const submitButton = event.target.querySelector('button[type="submit"]');
           submitButton.disabled = true;
           submitButton.textContent = '送信中...';
           
           const requestBody = {
               requestDate: document.getElementById('reservation-date').value,
               classroomIds: [parseInt(elements.modalClassroomIdInput.value)],
               purpose: document.getElementById('reservation-purpose').value,
               expectedParticipants: parseInt(document.getElementById('reservation-participants').value)
           };
           
           try {
               await apiCall('/api/reservation-request', {
                   method: 'POST',
                   body: JSON.stringify(requestBody)
               });
               
               alert('予約リクエストを送信しました！\n結果は5分ごとに処理されます。');
               closeReservationModal();
               updateFloorMap();
           } catch(error) {
               alert(error.message);
           } finally {
               submitButton.disabled = false;
               submitButton.textContent = '予約申請を送信';
           }
       });
       
       // フロアマップ
       elements.mapDatePicker?.addEventListener('change', () => {
           const date = new Date(elements.mapDatePicker.value);
           const day = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).getDay();
           if (day === 0) {
               alert("日曜日は予約できません。別の日付を選択してください。");
               elements.mapDatePicker.value = "";
           } else {
               updateFloorMap();
           }
       });
       
       elements.floorSelector?.addEventListener('change', updateFloorMap);
       
       elements.floorMapSvg?.addEventListener('click', (event) => {
            const target = event.target.closest('.classroom-shape');
            if (target && (target.classList.contains('available') || target.classList.contains('no-sound'))) {
                openReservationModal(target.dataset.classroomId);
            } else if (target && target.classList.contains('reserved')) {
                alert('この教室は既に予約済みです。');
            }
        });
       
       // カレンダー
       setTimeout(() => {
           document.getElementById('prev-month-btn')?.addEventListener('click', () => {
               currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
               renderCalendar();
           });
           
           document.getElementById('next-month-btn')?.addEventListener('click', () => {
               currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
               renderCalendar();
           });
       }, 100);
       
       // 戻るボタン
       document.querySelectorAll('.back-to-home-button').forEach(button => {
           button.addEventListener('click', (e) => {
               e.preventDefault();
               showViewWithHistory('home-view');
           });
       });
       
       document.querySelectorAll('.back-to-login-button').forEach(button => {
           button.addEventListener('click', (e) => {
               e.preventDefault();
               showViewWithHistory('login-view');
           });
       });
   };
   
   // 教室リスト取得（管理者用）
   const fetchAdminClassroomList = async () => {
       elements.adminClassroomList.innerHTML = '<li>読み込み中...</li>';
       try {
           const classrooms = await apiCall('/api/admin/classrooms');
           renderAdminClassroomList(classrooms);
       } catch (error) {
           elements.adminClassroomList.innerHTML = `<li>エラー: ${error.message}</li>`;
       }
   };
   
   const renderAdminClassroomList = (classrooms) => {
       elements.adminClassroomList.innerHTML = '';
       classrooms.forEach(c => {
           const li = document.createElement('li');
           li.innerHTML = `
               <label>
                   <input type="checkbox" data-classroom-id="${c.id}" ${c.is_usable ? 'checked' : ''}>
                   【${c.room_number}】${c.room_name || ''} - 現在の状態: ${c.is_usable ? '使用可' : '使用禁止'}
               </label>
           `;
           elements.adminClassroomList.appendChild(li);
       });
   };
   
   // 初期化処理
   const initializeApp = async () => {
        setupEventListeners();
        setupActivityMonitoring();
        await populateGroupDropdown();
        
        const token = localStorage.getItem('authToken');
        if (token) {
            await updateUI();
            showViewWithHistory('home-view', false);
        } else {
            showViewWithHistory('login-view', false);
        }
    };
   
   // アプリケーション開始
   initializeApp();
});
