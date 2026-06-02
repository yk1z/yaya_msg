(function () {
    const INVOICE_FORM_KEY = 'yaya_invoice_form_v1';
    const INVOICE_HISTORY_START_MONTH = '2021-01';

    const state = {
        initialized: false,
        loading: false,
        applying: false,
        orders: [],
        nextTime: '',
        selectedIds: new Set(),
        tips: '',
        configs: [],
        monthPickerYear: new Date().getFullYear(),
        statusMessage: '',
        statusType: 'muted',
        statusTimer: null
    };

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function readStoredJson(key, fallbackValue = {}) {
        try {
            if (typeof window.readStoredJsonSetting === 'function') {
                return window.readStoredJsonSetting(key, fallbackValue);
            }
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            return parsed && typeof parsed === 'object' ? parsed : fallbackValue;
        } catch (_) {
            return fallbackValue;
        }
    }

    function writeStoredJson(key, value) {
        if (typeof window.writeStoredJsonSetting === 'function') {
            return window.writeStoredJsonSetting(key, value);
        }
        localStorage.setItem(key, JSON.stringify(value || {}));
        return value;
    }

    function getDefaultYearMonth() {
        return '';
    }

    function getCurrentYearMonth() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function getInvoiceHistoryMonths() {
        const [startYear, startMonth] = INVOICE_HISTORY_START_MONTH.split('-').map(Number);
        const [endYear, endMonth] = getCurrentYearMonth().split('-').map(Number);
        const months = [];
        let year = endYear;
        let month = endMonth;

        while (year > startYear || (year === startYear && month >= startMonth)) {
            months.push(`${year}-${String(month).padStart(2, '0')}`);
            month -= 1;
            if (month === 0) {
                month = 12;
                year -= 1;
            }
        }

        return months;
    }

    function normalizeSavedBuyerType(savedForm) {
        if (savedForm && Number(savedForm.version) >= 2) {
            return String(savedForm.buyerType) === '1' ? '1' : '0';
        }
        const value = savedForm ? savedForm.buyerType : '';
        const rawValue = String(value ?? '').trim();
        if (rawValue === '2') return '1';
        if (rawValue === '1') return '0';
        return rawValue === '0' ? '0' : '0';
    }

    function normalizeInvoiceSortMode(savedForm = {}) {
        const mode = String(savedForm.sortMode || '').trim();
        if (mode === 'month-latest') return 'latest';
        if (mode === 'month-earliest') return 'earliest';
        if (['latest', 'earliest'].includes(mode)) {
            return mode;
        }
        const sortOrder = String(savedForm.sortOrder || 'latest') === 'earliest' ? 'earliest' : 'latest';
        return sortOrder;
    }

    function getSortOrderFromMode(sortMode = 'latest') {
        return String(sortMode) === 'earliest' ? 'earliest' : 'latest';
    }

    function getCurrentFormValues() {
        const savedForm = readStoredJson(INVOICE_FORM_KEY, {});
        const buyerTypeEl = $('invoice-buyer-type');
        const invoiceableOnlyEl = $('invoice-invoiceable-only');
        return {
            yearMonth: $('invoice-year-month')?.value || savedForm.yearMonth || getDefaultYearMonth(),
            buyerType: buyerTypeEl ? buyerTypeEl.value : normalizeSavedBuyerType(savedForm),
            buyerName: $('invoice-buyer-name')?.value ?? savedForm.buyerName ?? '',
            notifyEmail: $('invoice-email')?.value ?? savedForm.notifyEmail ?? '',
            notifyMobile: $('invoice-mobile')?.value ?? savedForm.notifyMobile ?? '',
            buyerTaxNo: $('invoice-tax-no')?.value ?? savedForm.buyerTaxNo ?? '',
            buyerAddress: $('invoice-address')?.value ?? savedForm.buyerAddress ?? '',
            buyerPhone: $('invoice-phone')?.value ?? savedForm.buyerPhone ?? '',
            buyerBankName: $('invoice-bank-name')?.value ?? savedForm.buyerBankName ?? '',
            buyerBankAccount: $('invoice-bank-account')?.value ?? savedForm.buyerBankAccount ?? '',
            sortMode: $('invoice-sort-order')?.value || normalizeInvoiceSortMode(savedForm),
            invoiceableOnly: invoiceableOnlyEl ? invoiceableOnlyEl.checked : savedForm.invoiceableOnly === true
        };
    }

    function getMonthDisplayText(yearMonth) {
        return yearMonth ? yearMonth.replace('-', '年') + '月' : '最近一个月';
    }

    function getSortDisplayText(sortMode) {
        return sortMode === 'earliest' ? '最早在前' : '最新在前';
    }

    function getBuyerTypeDisplayText(buyerType) {
        return String(buyerType) === '1' ? '企业' : '个人';
    }

    function getInvoiceToken() {
        return typeof window.getAppToken === 'function' ? String(window.getAppToken() || '').trim() : '';
    }

    function getInvoicePa() {
        return typeof window.getPA === 'function' ? window.getPA() : null;
    }

    function getInvoicePayload(extra = {}) {
        return {
            token: getInvoiceToken(),
            pa: getInvoicePa(),
            ...extra
        };
    }

    function normalizeOrder(item = {}) {
        return {
            dataId: String(item.dataId || ''),
            goodsName: String(item.goodsName || ''),
            summary: String(item.summary || ''),
            invoiceStatus: Number(item.invoiceStatus || 0),
            invoiceNo: String(item.invoiceNo || ''),
            totalFee: String(item.totalFee || ''),
            tradeTime: String(item.tradeTime || ''),
            tradeTimeLong: String(item.tradeTimeLong || ''),
            companyId: Number(item.companyId || 0)
        };
    }

    function getOrderStatus(order) {
        if (order.invoiceNo) return '已开票';
        if (order.invoiceStatus === 0) return '可开票';
        if (order.invoiceStatus === 1) return '开票中';
        if (order.invoiceStatus === 2) return '已开票';
        return `状态 ${order.invoiceStatus}`;
    }

    function canSelectOrder(order) {
        return Boolean(order.dataId && !order.invoiceNo && order.invoiceStatus === 0);
    }

    function getOrderMetaText(order) {
        const summary = String(order.summary || '').trim();
        const tradeTime = String(order.tradeTime || order.tradeTimeLong || '').trim();
        return [summary, tradeTime].filter(Boolean).join(' · ');
    }

    function getOrderSortTime(order) {
        const tradeTimeLong = Number(order.tradeTimeLong);
        if (Number.isFinite(tradeTimeLong) && tradeTimeLong > 0) return tradeTimeLong;
        const parsedTime = Date.parse(String(order.tradeTime || '').replace(/-/g, '/'));
        return Number.isFinite(parsedTime) ? parsedTime : 0;
    }

    function getOrderMonthText(order) {
        const tradeTime = String(order.tradeTime || '').trim();
        if (/^\d{4}-\d{2}/.test(tradeTime)) return tradeTime.slice(0, 7);
        const sortTime = getOrderSortTime(order);
        if (!sortTime) return '未知月份';
        const date = new Date(sortTime);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function getSortedOrders(orders, sortOrder = 'latest') {
        return [...orders].sort((a, b) => {
            const diff = getOrderSortTime(a) - getOrderSortTime(b);
            return sortOrder === 'earliest' ? diff : -diff;
        });
    }

    function renderInvoiceOrderRow(order) {
        const selectable = canSelectOrder(order);
        const config = getOrderConfig(order);
        const sourceText = config?.saleName || (order.companyId ? `主体 ${order.companyId}` : '');
        const metaText = [getOrderMetaText(order), sourceText].filter(Boolean).join(' · ');
        return `
            <label class="invoice-order-row${state.selectedIds.has(order.dataId) ? ' is-selected' : ''}${!selectable ? ' is-disabled' : ''}">
                <span class="invoice-order-check">
                    <input type="checkbox" ${state.selectedIds.has(order.dataId) ? 'checked' : ''} ${selectable ? '' : 'disabled'}
                        onchange="toggleInvoiceOrder('${escapeHtml(order.dataId)}', this.checked)">
                </span>
                <span class="invoice-order-main">
                    <span class="invoice-order-name">${escapeHtml(order.goodsName || order.summary || '未命名订单')}</span>
                    <span class="invoice-order-meta">${escapeHtml(metaText || '-')}</span>
                </span>
                <span class="invoice-order-fee">${escapeHtml(order.totalFee || '0')}</span>
                <span class="invoice-order-status">${escapeHtml(getOrderStatus(order))}</span>
            </label>
        `;
    }

    function renderInvoiceOrderRows(sortedOrders, formValues) {
        if (!sortedOrders.length) {
            return `<div class="invoice-empty">${formValues.invoiceableOnly ? '暂无可开票订单' : '暂无可显示订单'}</div>`;
        }

        const groupMap = new Map();
        sortedOrders.forEach(order => {
            const month = getOrderMonthText(order);
            if (!groupMap.has(month)) groupMap.set(month, []);
            groupMap.get(month).push(order);
        });

        return Array.from(groupMap.entries()).map(([month, orders]) => `
            <div class="invoice-month-group">
                <div class="invoice-month-header">
                    <span>${escapeHtml(month)}</span>
                    <strong>${orders.length} 笔</strong>
                </div>
                ${orders.map(renderInvoiceOrderRow).join('')}
            </div>
        `).join('');
    }

    function getSelectedOrders() {
        return state.orders.filter(order => state.selectedIds.has(order.dataId));
    }

    function getSelectedTotal() {
        return getSelectedOrders().reduce((sum, order) => sum + (Number(order.totalFee) || 0), 0);
    }

    function getOrderAmount(order) {
        const amount = Number(order?.totalFee);
        return Number.isFinite(amount) ? amount : 0;
    }

    function summarizeInvoiceOrders(orders) {
        const list = Array.isArray(orders) ? orders : [];
        return {
            count: list.length,
            total: list.reduce((sum, order) => sum + getOrderAmount(order), 0)
        };
    }

    function getInvoiceStats(visibleOrders) {
        const invoiceableOrders = state.orders.filter(canSelectOrder);
        const processedOrders = state.orders.filter(order => !canSelectOrder(order));
        return {
            loaded: summarizeInvoiceOrders(state.orders),
            visible: summarizeInvoiceOrders(visibleOrders),
            invoiceable: summarizeInvoiceOrders(invoiceableOrders),
            processed: summarizeInvoiceOrders(processedOrders),
            selected: summarizeInvoiceOrders(getSelectedOrders())
        };
    }

    function formatInvoiceAmount(amount) {
        return (Number(amount) || 0).toFixed(2);
    }

    function getOrderConfig(order) {
        if (!order || !Array.isArray(state.configs)) return null;
        return state.configs.find(config => Number(config.companyId) === Number(order.companyId))
            || state.configs.find(config => Number(config.defaultFlag) === 1)
            || null;
    }

    function getSelectedConfig() {
        const selectedOrder = getSelectedOrders()[0];
        return getOrderConfig(selectedOrder);
    }

    function setInvoiceStatus(message, type = 'muted') {
        if (state.statusTimer) {
            clearTimeout(state.statusTimer);
            state.statusTimer = null;
        }
        state.statusMessage = message || '';
        state.statusType = type;
        const statusEl = $('invoice-status');
        if (statusEl) {
            statusEl.textContent = message || '';
            statusEl.dataset.type = type;
        }
        if (message && !String(message).startsWith('正在')) {
            state.statusTimer = setTimeout(() => {
                state.statusMessage = '';
                state.statusType = 'muted';
                const latestStatusEl = $('invoice-status');
                if (latestStatusEl) {
                    latestStatusEl.textContent = '';
                    latestStatusEl.dataset.type = 'muted';
                }
                state.statusTimer = null;
            }, 5000);
        }
    }

    function renderInvoicePage() {
        const root = $('invoice-root');
        if (!root) return;
        const orderListEl = $('invoice-order-list');
        const previousOrderScrollTop = orderListEl ? orderListEl.scrollTop : 0;
        const formValues = getCurrentFormValues();
        const yearMonth = formValues.yearMonth;
        const selectedTotal = getSelectedTotal();
        const selectedConfig = getSelectedConfig();
        const isCompanyBuyer = String(formValues.buyerType || '0') === '1';
        const visibleOrders = formValues.invoiceableOnly
            ? state.orders.filter(canSelectOrder)
            : state.orders;
        const sortedOrders = getSortedOrders(visibleOrders, getSortOrderFromMode(formValues.sortMode));
        const orderRows = renderInvoiceOrderRows(sortedOrders, formValues);
        const monthPickerYear = Number(state.monthPickerYear) || new Date().getFullYear();
        const monthOptions = Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            const value = `${monthPickerYear}-${String(month).padStart(2, '0')}`;
            return `
                <button type="button" class="flip-calendar-day invoice-month-option${formValues.yearMonth === value ? ' is-selected' : ''}"
                    onclick="selectInvoiceMonth('${value}')">${month}</button>
            `;
        }).join('');

        root.innerHTML = `
            <div class="invoice-grid">
                <section class="invoice-panel invoice-orders-panel">
                    <div class="invoice-toolbar">
                        <div class="invoice-month-picker">
                            <input type="hidden" id="invoice-year-month" value="${escapeHtml(yearMonth)}">
                            <button type="button" class="input-control invoice-month-trigger" onclick="toggleInvoiceMonthDropdown()">
                                <span>${escapeHtml(getMonthDisplayText(yearMonth))}</span>
                                <span class="invoice-control-arrow">▼</span>
                            </button>
                            <div id="invoice-month-dropdown" class="suggestion-box flip-date-dropdown invoice-month-dropdown">
                                <div class="flip-date-panel invoice-month-panel">
                                    <div class="flip-calendar-shell">
                                        <div class="flip-calendar-header">
                                            <button type="button" class="flip-calendar-nav flip-calendar-nav-year" onclick="changeInvoiceMonthYear(-1)">‹</button>
                                            <div class="flip-calendar-title">${monthPickerYear}年</div>
                                            <button type="button" class="flip-calendar-nav flip-calendar-nav-year" onclick="changeInvoiceMonthYear(1)">›</button>
                                        </div>
                                        <div class="invoice-month-grid">${monthOptions}</div>
                                        <div class="flip-calendar-footer">
                                            <button type="button" class="flip-date-clear" onclick="selectInvoiceMonth('')">最近一个月</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="invoice-dropdown-wrap">
                            <input type="hidden" id="invoice-sort-order" value="${escapeHtml(formValues.sortMode)}">
                            <input type="text" id="invoice-sort-display" class="input-control invoice-dropdown-input"
                                value="${escapeHtml(getSortDisplayText(formValues.sortMode))}" readonly onclick="toggleInvoiceSortDropdown()">
                            <div class="invoice-dropdown-arrow">▼</div>
                            <div id="invoice-sort-dropdown" class="suggestion-box invoice-sort-dropdown">
                                <div class="suggestion-item" onclick="selectInvoiceSortOrder('latest', '最新在前')">最新在前</div>
                                <div class="suggestion-item" onclick="selectInvoiceSortOrder('earliest', '最早在前')">最早在前</div>
                            </div>
                        </div>
                        <button class="btn btn-secondary" onclick="refreshInvoicePage(true, true)" ${state.loading ? 'disabled' : ''}>加载全部</button>
                        <label class="invoice-inline-check">
                            <input id="invoice-invoiceable-only" type="checkbox" ${formValues.invoiceableOnly ? 'checked' : ''}
                                onchange="setInvoiceInvoiceableOnly(this.checked)">
                            <span>只显示可开票</span>
                        </label>
                        <button class="btn btn-secondary invoice-stats-btn" type="button" onclick="openInvoiceStatsModal()">统计</button>
                        <button class="btn btn-secondary" onclick="refreshInvoicePage(true)" ${state.loading ? 'disabled' : ''}>查询</button>
                    </div>
                    <div id="invoice-order-list" class="invoice-order-list">${orderRows}</div>
                </section>
                <section class="invoice-panel invoice-apply-panel">
                    <div class="invoice-summary">
                        <div class="invoice-summary-main">
                            <span>已选 ${state.selectedIds.size} 笔</span>
                            <strong>${selectedTotal.toFixed(2)}</strong>
                        </div>
                        ${selectedConfig ? `<div class="invoice-summary-source">${escapeHtml(selectedConfig.saleName || '')}</div>` : ''}
                    </div>
                    <label class="invoice-field">
                        <span>抬头类型</span>
                        <div class="invoice-dropdown-wrap invoice-field-dropdown">
                            <input type="hidden" id="invoice-buyer-type" value="${escapeHtml(formValues.buyerType || '0')}">
                            <input type="text" id="invoice-buyer-type-display" class="input-control invoice-dropdown-input"
                                value="${escapeHtml(getBuyerTypeDisplayText(formValues.buyerType))}" readonly onclick="toggleInvoiceBuyerTypeDropdown()">
                            <div class="invoice-dropdown-arrow">▼</div>
                            <div id="invoice-buyer-type-dropdown" class="suggestion-box invoice-sort-dropdown">
                                <div class="suggestion-item" onclick="selectInvoiceBuyerType('0', '个人')">个人</div>
                                <div class="suggestion-item" onclick="selectInvoiceBuyerType('1', '企业')">企业</div>
                            </div>
                        </div>
                    </label>
                    <label class="invoice-field">
                        <span>发票抬头</span>
                        <input id="invoice-buyer-name" class="input-control" value="${escapeHtml(formValues.buyerName || '')}" placeholder="姓名或公司名称">
                    </label>
                    ${isCompanyBuyer ? `
                        <label class="invoice-field">
                            <span>纳税人识别号</span>
                            <input id="invoice-tax-no" class="input-control" value="${escapeHtml(formValues.buyerTaxNo || '')}" placeholder="6-20 位大写字母或数字">
                        </label>
                        <label class="invoice-field">
                            <span>单位地址</span>
                            <input id="invoice-address" class="input-control" value="${escapeHtml(formValues.buyerAddress || '')}" placeholder="公司地址">
                        </label>
                        <label class="invoice-field">
                            <span>单位电话</span>
                            <input id="invoice-phone" class="input-control" value="${escapeHtml(formValues.buyerPhone || '')}" placeholder="公司电话">
                        </label>
                        <label class="invoice-field">
                            <span>开户银行</span>
                            <input id="invoice-bank-name" class="input-control" value="${escapeHtml(formValues.buyerBankName || '')}" placeholder="开户银行">
                        </label>
                        <label class="invoice-field">
                            <span>银行账号</span>
                            <input id="invoice-bank-account" class="input-control" value="${escapeHtml(formValues.buyerBankAccount || '')}" placeholder="银行账号">
                        </label>
                    ` : ''}
                    <label class="invoice-field">
                        <span>接收邮箱</span>
                        <input id="invoice-email" class="input-control" value="${escapeHtml(formValues.notifyEmail || '')}" placeholder="用于接收电子发票">
                    </label>
                    <label class="invoice-field">
                        <span>手机号</span>
                        <input id="invoice-mobile" class="input-control" value="${escapeHtml(formValues.notifyMobile || '')}" placeholder="开票成功后通知手机号">
                    </label>
                    <button class="btn btn-primary btn-full invoice-submit-btn" onclick="submitElectronicInvoice()" ${state.applying ? 'disabled' : ''}>提交开票</button>
                    <div id="invoice-status" class="invoice-status" data-type="${escapeHtml(state.statusType)}">${escapeHtml(state.statusMessage)}</div>
                </section>
            </div>
        `;
        const nextOrderListEl = $('invoice-order-list');
        if (nextOrderListEl && previousOrderScrollTop > 0) {
            nextOrderListEl.scrollTop = previousOrderScrollTop;
        }
    }

    async function invoiceInvoke(channel, payload = {}) {
        if (!window.ipcRenderer || typeof window.ipcRenderer.invoke !== 'function') {
            return { success: false, msg: '当前环境不支持请求接口' };
        }
        return window.ipcRenderer.invoke(channel, getInvoicePayload(payload));
    }

    function mergeInvoiceOrders(nextOrders, reset = false) {
        const byId = new Map((reset ? [] : state.orders).map(order => [order.dataId, order]));
        nextOrders.forEach(order => {
            if (order.dataId) byId.set(order.dataId, order);
        });
        state.orders = Array.from(byId.values());
    }

    function markInvoiceOrdersApplying(orderIds) {
        const idSet = new Set((orderIds || []).map(id => String(id || '')));
        state.orders = state.orders.map(order => {
            if (!idSet.has(order.dataId)) return order;
            return {
                ...order,
                invoiceStatus: 1,
                invoiceNo: order.invoiceNo || '开票申请已提交'
            };
        });
    }

    async function fetchAllInvoiceOrders(yearMonth, nextTime = '0', options = {}) {
        let page = 0;
        let cursor = String(nextTime || '0');
        const seenCursors = new Set();
        const label = options.label ? `${options.label} ` : '';

        while (cursor && !seenCursors.has(cursor) && page < 200) {
            page += 1;
            seenCursors.add(cursor);
            setInvoiceStatus(`正在加载${label}第 ${page} 页...`, 'muted');

            const orderResult = await invoiceInvoke('fetch-invoice-order-list', { yearMonth, nextTime: cursor });
            if (!orderResult?.success) throw new Error(orderResult?.msg || '订单加载失败');

            const nextOrders = Array.isArray(orderResult.content?.data)
                ? orderResult.content.data.map(normalizeOrder)
                : [];
            mergeInvoiceOrders(nextOrders, false);

            const nextCursor = String(orderResult.content?.nextTime || '');
            if (!nextCursor || nextCursor === cursor || nextOrders.length === 0) {
                cursor = '';
            } else {
                cursor = nextCursor;
            }
        }

        state.nextTime = cursor;
        if (page >= 200 && cursor) {
            setInvoiceStatus(`已加载 ${state.orders.length} 笔订单，页数较多已暂停`, 'error');
            return;
        }
        if (!options.skipFinalStatus) {
            setInvoiceStatus(`已加载全部 ${state.orders.length} 笔订单`, 'success');
        }
    }

    async function fetchAllInvoiceHistoryOrders() {
        const months = getInvoiceHistoryMonths();
        for (let index = 0; index < months.length; index += 1) {
            const month = months[index];
            setInvoiceStatus(`正在加载全部历史 ${index + 1}/${months.length}：${month}`, 'muted');
            await fetchAllInvoiceOrders(month, '0', {
                label: `${month}`,
                skipFinalStatus: true
            });
        }
        state.nextTime = '';
        setInvoiceStatus(`已加载全部历史 ${state.orders.length} 笔订单`, 'success');
    }

    async function refreshInvoicePage(reset = false, allHistory = false) {
        if (state.loading) return;
        if (!getInvoiceToken()) {
            if (typeof window.showToast === 'function') window.showToast('请先登录口袋账号');
            if (typeof window.switchView === 'function') window.switchView('login');
            return;
        }

        const yearMonth = $('invoice-year-month')?.value || getDefaultYearMonth();
        state.loading = true;
        if (reset) {
            state.orders = [];
            state.nextTime = '';
            state.selectedIds.clear();
        }
        renderInvoicePage();
        setInvoiceStatus('正在加载...', 'muted');
        try {
            const [configResult] = await Promise.all([
                invoiceInvoke('fetch-invoice-config')
            ]);
            if (configResult?.success && Array.isArray(configResult.content)) state.configs = configResult.content;
            if (allHistory) {
                await fetchAllInvoiceHistoryOrders();
            } else {
                await fetchAllInvoiceOrders(yearMonth, reset ? '0' : state.nextTime || '0');
            }
        } catch (error) {
            setInvoiceStatus(error.message || '加载失败', 'error');
        } finally {
            state.loading = false;
            renderInvoicePage();
        }
    }

    function loadMoreInvoiceOrders() {
        return refreshInvoicePage(false);
    }

    function closeInvoiceDropdowns(exceptId = '') {
        ['invoice-month-dropdown', 'invoice-sort-dropdown', 'invoice-buyer-type-dropdown'].forEach(id => {
            if (id === exceptId) return;
            const el = $(id);
            if (el) el.style.display = 'none';
        });
    }

    function toggleInvoiceMonthDropdown() {
        const dropdown = $('invoice-month-dropdown');
        if (!dropdown) return;
        const shouldShow = dropdown.style.display !== 'block';
        closeInvoiceDropdowns('invoice-month-dropdown');
        dropdown.style.display = shouldShow ? 'block' : 'none';
    }

    function changeInvoiceMonthYear(delta) {
        state.monthPickerYear = (Number(state.monthPickerYear) || new Date().getFullYear()) + Number(delta || 0);
        renderInvoicePage();
        const dropdown = $('invoice-month-dropdown');
        if (dropdown) dropdown.style.display = 'block';
    }

    function selectInvoiceMonth(yearMonth) {
        const input = $('invoice-year-month');
        if (input) input.value = String(yearMonth || '');
        closeInvoiceDropdowns();
        renderInvoicePage();
        setTimeout(() => closeInvoiceDropdowns(), 0);
    }

    function toggleInvoiceSortDropdown() {
        const dropdown = $('invoice-sort-dropdown');
        if (!dropdown) return;
        const shouldShow = dropdown.style.display !== 'block';
        closeInvoiceDropdowns('invoice-sort-dropdown');
        dropdown.style.display = shouldShow ? 'block' : 'none';
    }

    function selectInvoiceSortOrder(value, text) {
        const input = $('invoice-sort-order');
        const display = $('invoice-sort-display');
        if (input) input.value = value;
        if (display) display.value = text || getSortDisplayText(value);
        closeInvoiceDropdowns();
        setInvoiceSortOrder(value);
        setTimeout(() => closeInvoiceDropdowns(), 0);
    }

    function toggleInvoiceBuyerTypeDropdown() {
        const dropdown = $('invoice-buyer-type-dropdown');
        if (!dropdown) return;
        const shouldShow = dropdown.style.display !== 'block';
        closeInvoiceDropdowns('invoice-buyer-type-dropdown');
        dropdown.style.display = shouldShow ? 'block' : 'none';
    }

    function selectInvoiceBuyerType(value, text) {
        const input = $('invoice-buyer-type');
        const display = $('invoice-buyer-type-display');
        if (input) input.value = value === '1' ? '1' : '0';
        if (display) display.value = text || getBuyerTypeDisplayText(value);
        closeInvoiceDropdowns();
        renderInvoicePage();
        setTimeout(() => closeInvoiceDropdowns(), 0);
    }

    function ensureInvoiceStatsModal() {
        let modal = $('invoiceStatsModal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'invoiceStatsModal';
        modal.className = 'modal-overlay';
        modal.onclick = (event) => {
            if (event.target === modal) closeInvoiceStatsModal();
        };
        modal.innerHTML = `
            <div class="modal-content invoice-stats-modal">
                <div class="modal-header">
                    <span class="modal-title">发票金额统计</span>
                    <span class="close-btn" onclick="closeInvoiceStatsModal()">×</span>
                </div>
                <div class="modal-body" id="invoiceStatsContainer" style="padding: 0;"></div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    function renderInvoiceStatsModal() {
        const container = $('invoiceStatsContainer');
        if (!container) return;
        const formValues = getCurrentFormValues();
        const visibleOrders = formValues.invoiceableOnly
            ? state.orders.filter(canSelectOrder)
            : state.orders;
        const stats = getInvoiceStats(visibleOrders);
        const rows = [
            ['已加载', stats.loaded],
            ['可开票', stats.invoiceable],
            ['已开票/开票中', stats.processed],
            ['当前显示', stats.visible],
            ['已选', stats.selected]
        ];
        container.innerHTML = `
            <div class="invoice-stats-modal-summary">
                <span>总金额</span>
                <strong>${formatInvoiceAmount(stats.loaded.total)}</strong>
            </div>
            <div class="invoice-stats-modal-list">
                ${rows.map(([label, item]) => `
                    <div class="invoice-stats-modal-row">
                        <span>${escapeHtml(label)}</span>
                        <strong>${item.count} 笔</strong>
                        <b>${formatInvoiceAmount(item.total)}</b>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function openInvoiceStatsModal() {
        closeInvoiceDropdowns();
        const modal = ensureInvoiceStatsModal();
        modal.style.display = 'flex';
        renderInvoiceStatsModal();
    }

    function closeInvoiceStatsModal() {
        const modal = $('invoiceStatsModal');
        if (modal) modal.style.display = 'none';
    }

    function setInvoiceSortOrder(sortOrder) {
        const normalizedMode = sortOrder === 'earliest'
            ? 'earliest'
            : 'latest';
        const savedForm = readStoredJson(INVOICE_FORM_KEY, {});
        writeStoredJson(INVOICE_FORM_KEY, {
            ...savedForm,
            sortMode: normalizedMode,
            sortOrder: getSortOrderFromMode(normalizedMode),
            groupMode: 'month'
        });
        renderInvoicePage();
    }

    function setInvoiceInvoiceableOnly(checked) {
        const savedForm = readStoredJson(INVOICE_FORM_KEY, {});
        writeStoredJson(INVOICE_FORM_KEY, {
            ...savedForm,
            invoiceableOnly: checked === true
        });
        renderInvoicePage();
    }

    function toggleInvoiceOrder(dataId, checked) {
        const id = String(dataId || '');
        if (!id) return;
        if (checked) {
            const nextOrder = state.orders.find(order => order.dataId === id);
            const nextConfig = getOrderConfig(nextOrder);
            const selectedOrders = getSelectedOrders();
            const hasDifferentSource = selectedOrders.some(order => {
                const config = getOrderConfig(order);
                return (config?.saleName || '') !== (nextConfig?.saleName || '');
            });
            if (hasDifferentSource) {
                setInvoiceStatus('订单来源不一致，无法一起开票', 'error');
                renderInvoicePage();
                return;
            }
            const nextTotal = getSelectedTotal() + (Number(nextOrder?.totalFee) || 0);
            const maxFee = Number(nextConfig?.maxFee) || 0;
            if (maxFee > 0 && nextTotal > maxFee) {
                setInvoiceStatus(`单张发票最大可开票金额 ${nextConfig.maxFee}`, 'error');
                renderInvoicePage();
                return;
            }
            state.selectedIds.add(id);
        } else {
            state.selectedIds.delete(id);
        }
        renderInvoicePage();
    }

    async function submitElectronicInvoice() {
        if (state.applying) return;
        const selectedIds = Array.from(state.selectedIds);
        if (!selectedIds.length) {
            setInvoiceStatus('请选择要开票的订单', 'error');
            return;
        }
        const payload = {
            buyerType: Number($('invoice-buyer-type')?.value || 0),
            buyerName: $('invoice-buyer-name')?.value?.trim() || '',
            notifyEmail: $('invoice-email')?.value?.trim() || '',
            notifyMobile: $('invoice-mobile')?.value?.trim() || '',
            buyerTaxNo: $('invoice-tax-no')?.value?.trim() || '',
            buyerAddress: $('invoice-address')?.value?.trim() || '',
            buyerPhone: $('invoice-phone')?.value?.trim() || '',
            buyerBankName: $('invoice-bank-name')?.value?.trim() || '',
            buyerBankAccount: $('invoice-bank-account')?.value?.trim() || '',
            orderDataId: selectedIds
        };
        if (!payload.buyerName) {
            setInvoiceStatus('请填写发票抬头', 'error');
            return;
        }
        if (!payload.notifyEmail) {
            setInvoiceStatus('请填写接收邮箱', 'error');
            return;
        }
        if (!payload.notifyMobile) {
            setInvoiceStatus('请填写手机号', 'error');
            return;
        }
        if (payload.buyerType === 1) {
            const taxNoPattern = /^[A-Z0-9]{6,20}$/;
            if (!taxNoPattern.test(payload.buyerTaxNo)) {
                setInvoiceStatus('请填写正确的纳税人识别号', 'error');
                return;
            }
            if (!payload.buyerAddress || !payload.buyerPhone || !payload.buyerBankName || !payload.buyerBankAccount) {
                setInvoiceStatus('请填写完整的企业开票信息', 'error');
                return;
            }
        }
        writeStoredJson(INVOICE_FORM_KEY, {
            version: 2,
            buyerType: payload.buyerType,
            buyerName: payload.buyerName,
            notifyEmail: payload.notifyEmail,
            notifyMobile: payload.notifyMobile,
            buyerTaxNo: payload.buyerTaxNo,
            buyerAddress: payload.buyerAddress,
            buyerPhone: payload.buyerPhone,
            buyerBankName: payload.buyerBankName,
            buyerBankAccount: payload.buyerBankAccount,
            sortMode: $('invoice-sort-order')?.value || 'latest',
            sortOrder: getSortOrderFromMode($('invoice-sort-order')?.value || 'latest'),
            groupMode: 'month',
            invoiceableOnly: $('invoice-invoiceable-only')?.checked === true,
            yearMonth: $('invoice-year-month')?.value || getDefaultYearMonth()
        });

        state.applying = true;
        renderInvoicePage();
        setInvoiceStatus('正在提交...', 'muted');
        try {
            const result = await invoiceInvoke('apply-electronic-invoice', payload);
            if (!result?.success) throw new Error(result?.msg || '提交失败');
            markInvoiceOrdersApplying(selectedIds);
            state.selectedIds.clear();
            setInvoiceStatus(result.msg || '提交成功', 'success');
            if (typeof window.showToast === 'function') window.showToast('开票申请已提交');
            renderInvoicePage();
            setTimeout(() => {
                refreshInvoicePage(false);
            }, 800);
        } catch (error) {
            setInvoiceStatus(error.message || '提交失败', 'error');
        } finally {
            state.applying = false;
            renderInvoicePage();
        }
    }

    function enterInvoiceView() {
        if (!state.initialized) {
            state.initialized = true;
            renderInvoicePage();
            refreshInvoicePage(true);
            return;
        }
        renderInvoicePage();
    }

    window.enterInvoiceView = enterInvoiceView;
    window.renderInvoicePage = renderInvoicePage;
    window.refreshInvoicePage = refreshInvoicePage;
    window.loadMoreInvoiceOrders = loadMoreInvoiceOrders;
    window.toggleInvoiceMonthDropdown = toggleInvoiceMonthDropdown;
    window.changeInvoiceMonthYear = changeInvoiceMonthYear;
    window.selectInvoiceMonth = selectInvoiceMonth;
    window.toggleInvoiceSortDropdown = toggleInvoiceSortDropdown;
    window.selectInvoiceSortOrder = selectInvoiceSortOrder;
    window.toggleInvoiceBuyerTypeDropdown = toggleInvoiceBuyerTypeDropdown;
    window.selectInvoiceBuyerType = selectInvoiceBuyerType;
    window.openInvoiceStatsModal = openInvoiceStatsModal;
    window.closeInvoiceStatsModal = closeInvoiceStatsModal;
    window.setInvoiceSortOrder = setInvoiceSortOrder;
    window.setInvoiceInvoiceableOnly = setInvoiceInvoiceableOnly;
    window.toggleInvoiceOrder = toggleInvoiceOrder;
    window.submitElectronicInvoice = submitElectronicInvoice;

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (target && target.closest && target.closest('.invoice-toolbar')) return;
        if (target && target.closest && target.closest('.invoice-field-dropdown')) return;
        closeInvoiceDropdowns();
    });
})();
