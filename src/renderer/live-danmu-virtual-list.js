(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    class RowHeights {
        constructor() { this.values = []; this.tree = [0]; }
        offset(count) {
            let total = 0;
            for (let i = count; i > 0; i -= i & -i) total += this.tree[i];
            return total;
        }
        append(height) {
            const i = this.values.length + 1;
            this.tree[i] = height + this.offset(i - 1) - this.offset(i - (i & -i));
            this.values.push(height);
        }
        set(index, height) {
            const delta = height - this.values[index];
            if (Math.abs(delta) < 0.1) return;
            this.values[index] = height;
            for (let i = index + 1; i < this.tree.length; i += i & -i) this.tree[i] += delta;
        }
        at(offset) {
            let index = 0, total = 0;
            for (let step = 2 ** Math.floor(Math.log2(this.values.length || 1)); step; step >>= 1) {
                const next = index + step;
                if (next < this.tree.length && total + this.tree[next] <= offset) {
                    index = next; total += this.tree[next];
                }
            }
            return Math.min(index, Math.max(0, this.values.length - 1));
        }
        reset(count) {
            this.values = Array(count).fill(48);
            this.tree = [0, ...this.values];
            for (let i = 1; i < this.tree.length; i++) {
                const parent = i + (i & -i);
                if (parent < this.tree.length) this.tree[parent] += this.tree[i];
            }
        }
    }

    window.YayaRendererFeatures.createLiveDanmuVirtualList = function (root, createRow) {
        const items = [], heights = new RowHeights();
        let frame = 0, follow = true, invalid = false, mounted = false;
        let start = -1, end = -1, rows = new Map(), destroyed = false;
        let width = root.clientWidth, height = root.clientHeight;
        let renderedScrollTop = root.scrollTop, renderedScrollHeight = root.scrollHeight, renderedHeight = root.clientHeight;
        const top = document.createElement('div'), visible = document.createElement('div'), bottom = document.createElement('div');
        top.className = bottom.className = 'live-danmu-list-spacer';
        top.setAttribute('aria-hidden', 'true'); bottom.setAttribute('aria-hidden', 'true');
        visible.className = 'live-danmu-list-window';

        const rowObserver = new ResizeObserver(() => schedule());
        const sizeObserver = new ResizeObserver(() => {
            if (width !== root.clientWidth) invalid = true;
            if (width !== root.clientWidth || height !== root.clientHeight) schedule();
            width = root.clientWidth; height = root.clientHeight;
        });
        sizeObserver.observe(root);

        function schedule() {
            if (!destroyed && !frame) frame = requestAnimationFrame(render);
        }
        function range(scrollTop) {
            return [heights.at(Math.max(0, scrollTop - 240)),
                Math.min(items.length, heights.at(scrollTop + root.clientHeight + 240) + 1)];
        }
        function mount(from, to) {
            if (from === start && to === end) return;
            rowObserver.disconnect();
            const nextRows = new Map(), fragment = document.createDocumentFragment();
            const focused = document.activeElement;
            for (let i = from; i < to; i++) {
                const row = rows.get(i) || createRow(items[i]);
                row.dataset.messageIndex = String(i);
                nextRows.set(i, row); fragment.appendChild(row); rowObserver.observe(row);
            }
            visible.replaceChildren(fragment);
            if (focused && visible.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
            rows = nextRows; start = from; end = to;
        }
        function render() {
            frame = 0;
            if (destroyed || !items.length || !root.clientHeight) return;
            const anchor = heights.at(root.scrollTop);
            const within = root.scrollTop - heights.offset(anchor);
            if (invalid) { heights.reset(items.length); invalid = false; }
            if (!mounted) { root.replaceChildren(top, visible, bottom); mounted = true; }
            let target = root.scrollTop;
            for (let pass = 0; pass < 4; pass++) {
                target = follow ? Math.max(0, heights.offset(items.length) - root.clientHeight)
                    : heights.offset(anchor) + Math.min(within, heights.values[anchor] - 1);
                const [from, to] = range(target);
                mount(from, to);
                for (const [index, row] of rows) {
                    const measured = row.getBoundingClientRect().height;
                    if (measured > 0) heights.set(index, measured);
                }
                target = follow ? Math.max(0, heights.offset(items.length) - root.clientHeight)
                    : heights.offset(anchor) + Math.min(within, heights.values[anchor] - 1);
                const next = range(target);
                if (next[0] === start && next[1] === end) break;
            }
            top.style.height = heights.offset(start) + 'px';
            bottom.style.height = Math.max(0, heights.offset(items.length) - heights.offset(end)) + 'px';
            root.scrollTop = Math.max(0, target);
            renderedScrollTop = root.scrollTop;
            renderedScrollHeight = root.scrollHeight;
            renderedHeight = root.clientHeight;
            const next = range(target);
            if (next[0] !== start || next[1] !== end) schedule();
        }
        function onScroll() {
            if (root.clientHeight && root.scrollTop !== renderedScrollTop) {
                follow = root.scrollHeight - root.scrollTop - root.clientHeight <= 1;
            }
            schedule();
        }
        function onWheel(event) {
            if (event.deltaY < 0) follow = false;
        }
        root.addEventListener('scroll', onScroll, { passive: true });
        root.addEventListener('wheel', onWheel, { passive: true });

        return {
            root,
            append(item) {
                if (destroyed) return;
                if (!items.length) follow = true;
                else if (follow && root.clientHeight === renderedHeight && root.scrollHeight === renderedScrollHeight
                    && root.scrollTop < renderedScrollTop) follow = false;
                items.push(item); heights.append(48); schedule();
            },
            invalidateMeasurements() { invalid = true; schedule(); },
            clear(placeholder) {
                if (frame) cancelAnimationFrame(frame);
                frame = 0; items.length = 0; heights.reset(0); rows.clear(); rowObserver.disconnect();
                start = end = -1; follow = true; invalid = mounted = false;
                visible.replaceChildren(); root.replaceChildren(...(placeholder ? [placeholder] : [])); root.scrollTop = 0;
                renderedScrollTop = 0; renderedScrollHeight = root.scrollHeight; renderedHeight = root.clientHeight;
            },
            destroy() {
                this.clear(); destroyed = true; sizeObserver.disconnect();
                root.removeEventListener('scroll', onScroll);
                root.removeEventListener('wheel', onWheel);
            }
        };
    };
})();
