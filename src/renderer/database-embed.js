(function initDatabaseEmbed() {
    const DATABASE_TEMPLATE_PATH = 'src/renderer/database/index.html';
    const TAILWIND_URL = 'https://cdn.tailwindcss.com';
    const BABEL_URL = 'https://unpkg.com/@babel/standalone/babel.min.js';
    const REACT_URL = 'https://esm.sh/react@18.2.0';
    const REACT_DOM_URL = 'https://esm.sh/react-dom@18.2.0/client';
    const LUCIDE_URL = 'https://esm.sh/lucide-react@0.292.0';

    let runtimePromise = null;
    let mountPromise = null;

    function getDatabaseHost() {
        return document.getElementById('database-root');
    }

    function setDatabaseState(html, className) {
        const host = getDatabaseHost();
        if (!host) return;
        host.innerHTML = `<div class="${className}">${html}</div>`;
    }

    function loadExternalScript(src, id) {
        const existing = id ? document.getElementById(id) : null;
        if (existing) return Promise.resolve(existing);

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            if (id) script.id = id;
            script.onload = () => resolve(script);
            script.onerror = () => reject(new Error(`加载脚本失败: ${src}`));
            document.head.appendChild(script);
        });
    }

    function ensureTailwindConfig() {
        if (document.getElementById('database-tailwind-config')) return;
        const script = document.createElement('script');
        script.id = 'database-tailwind-config';
        script.textContent = `
            window.tailwind = window.tailwind || {};
            window.tailwind.config = {
                darkMode: 'class',
                theme: {
                    extend: {
                        colors: {
                            gray: {
                                750: '#2d3748',
                                850: '#1a202c',
                                950: '#0d1117'
                            },
                            gold: {
                                500: '#EAB308',
                                100: '#FEF9C3'
                            },
                            silver: {
                                500: '#94A3B8',
                                100: '#F1F5F9'
                            },
                            bronze: {
                                500: '#B45309',
                                100: '#FFEDD5'
                            }
                        }
                    }
                }
            };
        `;
        document.head.appendChild(script);
    }

    async function ensureRuntime() {
        if (runtimePromise) return runtimePromise;

        runtimePromise = (async () => {
            ensureTailwindConfig();
            if (!document.getElementById('database-tailwind-runtime')) {
                await loadExternalScript(TAILWIND_URL, 'database-tailwind-runtime');
            }
            if (!window.Babel && !document.getElementById('database-babel-runtime')) {
                await loadExternalScript(BABEL_URL, 'database-babel-runtime');
            }
        })();

        return runtimePromise;
    }

    function readDatabaseTemplate() {
        const desktop = window.desktop;
        if (!desktop || !desktop.fs || !desktop.path || !desktop.appDir) {
            throw new Error('数据库运行环境未准备好');
        }

        const templatePath = desktop.path.join(desktop.appDir, DATABASE_TEMPLATE_PATH);
        return desktop.fs.readFileSync(templatePath, 'utf8');
    }

    function injectDatabaseStyles(doc) {
        if (document.getElementById('database-embed-style')) return;

        const styles = Array.from(doc.querySelectorAll('style'))
            .map((node) => node.textContent || '')
            .join('\n')
            .replace(/html\s*,\s*body\s*\{[\s\S]*?\}\s*/g, '')
            .replace(/body\s*\{[\s\S]*?\}\s*/g, '');

        const style = document.createElement('style');
        style.id = 'database-embed-style';
        style.textContent = styles;
        document.head.appendChild(style);
    }

    function rewriteImports(source) {
        return source
            .replace(/from\s+['"]react['"]/g, `from '${REACT_URL}'`)
            .replace(/from\s+['"]react-dom\/client['"]/g, `from '${REACT_DOM_URL}'`)
            .replace(/from\s+['"]lucide-react['"]/g, `from '${LUCIDE_URL}'`);
    }

    function rewriteDatabaseSource(source) {
        return rewriteImports(source).replace(
            /document\.getElementById\('root'\)/g,
            "document.getElementById('database-root')"
        );
    }

    async function mountDatabaseView() {
        const host = getDatabaseHost();
        if (!host) return;
        if (host.dataset.databaseMounted === 'true') return;
        if (mountPromise) return mountPromise;

        mountPromise = (async () => {
            try {
                const template = readDatabaseTemplate();
                const doc = new DOMParser().parseFromString(template, 'text/html');
                const appScript = doc.querySelector('script[type="text/babel"]');

                if (!appScript) {
                    throw new Error('数据库脚本不存在');
                }

                injectDatabaseStyles(doc);
                await ensureRuntime();

                const transformed = window.Babel.transform(
                    rewriteDatabaseSource(appScript.textContent || ''),
                    {
                        presets: ['react'],
                        sourceType: 'module'
                    }
                ).code;

                host.innerHTML = '';
                const blob = new Blob(
                    [`${transformed}\n//# sourceURL=database-embed-runtime.js`],
                    { type: 'text/javascript' }
                );
                const blobUrl = URL.createObjectURL(blob);

                try {
                    await import(blobUrl);
                    host.dataset.databaseMounted = 'true';
                } finally {
                    URL.revokeObjectURL(blobUrl);
                }
            } catch (error) {
                console.error('数据库页面挂载失败:', error);
                setDatabaseState(`数据库加载失败<br>${error.message || error}`, 'database-error');
            } finally {
                mountPromise = null;
            }
        })();

        return mountPromise;
    }

    window.mountDatabaseView = mountDatabaseView;
})();
