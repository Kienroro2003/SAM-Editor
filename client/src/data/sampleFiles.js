/**
 * Sample files to pre-populate the virtual file system.
 */
export const sampleFiles = [
    {
        name: 'src',
        type: 'directory',
        children: [
            {
                name: 'components',
                type: 'directory',
                children: [
                    {
                        name: 'App.jsx',
                        type: 'file',
                        content: `import React, { useState } from 'react';
import Header from './Header';
import Footer from './Footer';
import './App.css';

function App() {
  const [count, setCount] = useState(0);
  const [theme, setTheme] = useState('dark');

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className={\`app \${theme}\`}>
      <Header
        title="My Application"
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="main-content">
        <section className="hero">
          <h1>Welcome to React</h1>
          <p>Build amazing user interfaces</p>
          <div className="counter">
            <button onClick={() => setCount(c => c - 1)}>-</button>
            <span className="count">{count}</span>
            <button onClick={() => setCount(c => c + 1)}>+</button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default App;`
                    },
                    {
                        name: 'Header.jsx',
                        type: 'file',
                        content: `import React from 'react';

function Header({ title, theme, onToggleTheme }) {
  return (
    <header className="header">
      <div className="logo">
        <svg width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="#61dafb" />
        </svg>
        <h2>{title}</h2>
      </div>
      <nav className="navigation">
        <a href="#home">Home</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
        <button className="theme-toggle" onClick={onToggleTheme}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </nav>
    </header>
  );
}

export default Header;`
                    },
                    {
                        name: 'Footer.jsx',
                        type: 'file',
                        content: `import React from 'react';

function Footer() {
  return (
    <footer className="footer">
      <p>&copy; 2026 My Application. All rights reserved.</p>
      <div className="footer-links">
        <a href="#privacy">Privacy Policy</a>
        <a href="#terms">Terms of Service</a>
      </div>
    </footer>
  );
}

export default Footer;`
                    }
                ]
            },
            {
                name: 'styles',
                type: 'directory',
                children: [
                    {
                        name: 'App.css',
                        type: 'file',
                        content: `/* Application Styles */
:root {
  --primary: #61dafb;
  --bg-dark: #1a1a2e;
  --bg-light: #ffffff;
  --text-dark: #e0e0e0;
  --text-light: #333333;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}

.app.dark {
  background: var(--bg-dark);
  color: var(--text-dark);
}

.app.light {
  background: var(--bg-light);
  color: var(--text-light);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.navigation {
  display: flex;
  gap: 24px;
  align-items: center;
}

.navigation a {
  color: inherit;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.navigation a:hover {
  color: var(--primary);
}

.hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.hero h1 {
  font-size: 3.5rem;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #61dafb, #bb86fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.counter {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 2rem;
}

.counter button {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid var(--primary);
  background: transparent;
  color: var(--primary);
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.counter button:hover {
  background: var(--primary);
  color: #1a1a2e;
}

.count {
  font-size: 2rem;
  font-weight: 700;
  min-width: 60px;
}

.footer {
  padding: 1.5rem 2rem;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}`
                    },
                    {
                        name: 'variables.css',
                        type: 'file',
                        content: `/* CSS Custom Properties */
:root {
  /* Colors */
  --color-primary: #61dafb;
  --color-secondary: #bb86fc;
  --color-accent: #03dac6;
  --color-error: #cf6679;
  --color-warning: #ffb74d;
  --color-success: #81c784;

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'Fira Code', 'Cascadia Code', monospace;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;

  /* Borders */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.2);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;
  --transition-slow: 500ms ease;
}`
                    }
                ]
            },
            {
                name: 'utils',
                type: 'directory',
                children: [
                    {
                        name: 'helpers.js',
                        type: 'file',
                        content: `/**
 * Utility helper functions
 */

/**
 * Debounce a function call.
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function call.
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function}
 */
export function throttle(fn, limit = 100) {
  let inThrottle = false;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

/**
 * Format a date to a readable string.
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * Generate a unique ID.
 * @returns {string}
 */
export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Deep clone an object.
 * @param {*} obj
 * @returns {*}
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Capitalize first letter.
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}`
                    },
                    {
                        name: 'api.js',
                        type: 'file',
                        content: `/**
 * API client for making HTTP requests
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.example.com';

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  setAuthToken(token) {
    this.headers['Authorization'] = \`Bearer \${token}\`;
  }

  async request(method, endpoint, data = null) {
    const config = {
      method,
      headers: { ...this.headers },
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, config);

      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
      }

      return await response.json();
    } catch (error) {
      console.error(\`API Error [\${method}] \${endpoint}:\`, error);
      throw error;
    }
  }

  get(endpoint) {
    return this.request('GET', endpoint);
  }

  post(endpoint, data) {
    return this.request('POST', endpoint, data);
  }

  put(endpoint, data) {
    return this.request('PUT', endpoint, data);
  }

  delete(endpoint) {
    return this.request('DELETE', endpoint);
  }
}

export const api = new ApiClient(BASE_URL);
export default api;`
                    }
                ]
            },
            {
                name: 'index.js',
                type: 'file',
                content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import './styles/variables.css';
import './styles/App.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('Application started successfully! 🚀');`
            }
        ]
    },
    {
        name: 'public',
        type: 'directory',
        children: [
            {
                name: 'index.html',
                type: 'file',
                content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Application</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/index.js"></script>
</body>
</html>`
            }
        ]
    },
    {
        name: 'package.json',
        type: 'file',
        content: `{
  "name": "my-application",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0",
    "eslint": "^8.56.0"
  }
}`
    },
    {
        name: 'README.md',
        type: 'file',
        content: `# My Application

A modern React application built with Vite.

## Features

- ⚡ Lightning fast development with Vite
- ⚛️  React 18 with hooks
- 🎨 CSS Custom Properties for theming
- 🌙 Dark/Light mode toggle
- 📱 Responsive design

## Getting Started

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
\`\`\`

## Project Structure

\`\`\`
src/
├── components/    # React components
├── styles/        # CSS stylesheets
├── utils/         # Utility functions
└── index.js       # Entry point
\`\`\`

## License

MIT © 2026`
    },
    {
        name: '.gitignore',
        type: 'file',
        content: `# Dependencies
node_modules/

# Build
dist/
build/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*`
    },
    {
        name: 'tsconfig.json',
        type: 'file',
        content: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}`
    }
];
