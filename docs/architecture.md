# SAM Editor — Architecture Document

> **Mục đích:** Mô tả cấu trúc kiến trúc sau khi tích hợp React, phân biệt rõ phần **giữ nguyên** (reuse) và phần **thêm mới** (new).

---

## 1. Tổng quan kiến trúc

### Trước khi tích hợp (Vanilla JS)

```
src/
├── main.js              ← Entry point, App class, khởi tạo mọi thứ
├── core/
│   ├── EditorManager.js
│   └── FileSystem.js
├── components/
│   ├── ActivityBar.js
│   ├── FileExplorer.js
│   ├── EditorTabs.js
│   ├── Terminal.js
│   ├── CommandPalette.js
│   └── ContextMenu.js
├── data/sampleFiles.js
└── styles/*.css
```

### Sau khi tích hợp (React + Vanilla JS hybrid)

```
src/
├── main.jsx              ← React entry point (thay main.js)
├── App.jsx               ← React root: routing + wiring vanilla modules
├── core/                 ← GIỮ NGUYÊN (reuse)
│   ├── EditorManager.js
│   └── FileSystem.js
├── components/           ← GIỮ NGUYÊN (reuse)
│   ├── ActivityBar.js
│   ├── FileExplorer.js
│   ├── EditorTabs.js
│   ├── Terminal.js
│   ├── CommandPalette.js
│   └── ContextMenu.js
├── components/common/    ← MỚI (new)
│   └── AsyncState.jsx    ← Task 4: Loading / Empty / Error wrapper
├── coverage/             ← MỚI (new) — Task 2, 3
│   ├── OverviewScreen.jsx
│   ├── UploadLcov.jsx
│   ├── CoverageDashboard.jsx
│   ├── PieChart.jsx
│   ├── RiskModules.jsx
│   └── api/coverageApi.js
├── styles/               ← GIỮ NGUYÊN (reuse)
└── data/                 ← GIỮ NGUYÊN (reuse)
```

---

## 2. Chi tiết mapping file cũ → mới

### 2.1 Reuse (Giữ nguyên, chỉ wrap React)

| File cũ | Vai trò mới | Ghi chú |
|---|---|---|
| `src/core/FileSystem.js` | Dùng trực tiếp trong React qua `useRef` | Không sửa logic |
| `src/core/EditorManager.js` | Dùng trực tiếp, expose qua `window._samEditorManager` | Không sửa logic |
| `src/components/ActivityBar.js` | Khởi tạo bằng `useRef` + `useEffect` trong React | Không sửa logic |
| `src/components/FileExplorer.js` | Khởi tạo bằng `useRef` + `useEffect`, event qua `.on()` | Không sửa logic |
| `src/components/EditorTabs.js` | Khởi tạo bằng `useRef` + `useEffect` | Không sửa logic |
| `src/components/Terminal.js` | Khởi tạo bằng `useRef` + `useEffect` | Không sửa logic |
| `src/components/CommandPalette.js` | Khởi tạo bằng `useRef` + `useEffect` | Không sửa logic |
| `src/components/ContextMenu.js` | Khởi tạo bằng `useRef` + `useEffect` | Không sửa logic |
| `src/styles/*.css` | Import trực tiếp vào `main.jsx` | CSS hoàn toàn tương thích |
| `src/data/sampleFiles.js` | Import trực tiếp, load vào FileSystem | Không sửa logic |
| `index.html` | Giữ nguyên cấu trúc DOM, chỉ đổi `src/main.js` → `src/main.jsx` | Layout không đổi |

**Nguyên tắc reuse:** Các module vanilla JS hoạt động độc lập, React chỉ quản lý **vòng đời** (lifecycle) và **state** của chúng. Logic bên trong giữ nguyên 100%.

### 2.2 New (Thêm mới)

| File mới | Mục đích |
|---|---|
| `src/main.jsx` | React entry point, thay thế `main.js` |
| `src/App.jsx` | React root component: routing, khởi tạo core modules, global shortcuts, resize |
| `src/components/common/AsyncState.jsx` | **Task 4:** Wrapper generic cho Loading / Empty / Error states |
| `src/coverage/api/coverageApi.js` | **Task 3:** Axios client, upload LCOV, retry logic |
| `src/coverage/UploadLcov.jsx` | **Task 3:** Form upload LCOV, drag-drop, validation |
| `src/coverage/OverviewScreen.jsx` | **Task 2:** Màn hình overview chính |
| `src/coverage/CoverageDashboard.jsx` | **Task 2:** 4 metric cards + progress bars |
| `src/coverage/PieChart.jsx` | **Task 2:** D3.js pie chart Covered/Uncovered |
| `src/coverage/RiskModules.jsx` | **Task 2:** Danh sách module có risk, click → navigateToFile |
| `docs/architecture.md` | Tài liệu này |

---

## 3. Routing

```
/              → redirect to /editor
/editor        → Editor chính (Monaco, file explorer, terminal)
/coverage      → Coverage Overview screen
```

Chuyển đổi giữa `/editor` và `/coverage` hoàn toàn độc lập, không ảnh hưởng đến trạng thái Monaco Editor đang mở.

---

## 4. Cơ chế navigateToFile (Coverage → Editor)

```
Coverage screen (React)
  └── onRiskItemClick(filePath, lineNumber)
        └── navigateToFile(filePath, lineNumber)  ← exported from App.jsx
              └── navigate('/editor')
                    └── mở file trong Monaco + highlight dòng
```

Hàm `navigateToFile` được export từ `App.jsx` và đăng ký thông qua `registerNavigateCallback`. Coverage panel không cần import trực tiếp Monaco.

---

## 5. State management

| State | Nơi quản lý | Cách truy cập |
|---|---|---|
| Files, directories | `FileSystem` (vanilla) | qua `fsRef.current` |
| Monaco models | `EditorManager` (vanilla) | qua `editorManagerRef.current` |
| Open tabs | `EditorTabs` (vanilla) | qua `editorTabsRef.current` |
| Sidebar visibility | React `useState` | `sidebarVisible` / `setSidebarVisible` |
| Panel visibility | React `useState` | `panelVisible` / `setPanelVisible` |
| Coverage data | React `useState` trong Coverage screen | local state |
| Async state (loading/error) | `AsyncState` component | props |

---

## 6. Dependency overview

```
index.html
  └── main.jsx (React entry)
        ├── App.jsx (React root)
        │     ├── react-router-dom → Routes
        │     ├── core/FileSystem.js (vanilla)
        │     ├── core/EditorManager.js (vanilla)
        │     ├── components/*.js (vanilla, wrapped in useEffect)
        │     └── components/common/AsyncState.jsx (React)
        │
        ├── styles/*.css (imported here)
        └── BrowserRouter (in main.jsx)
```

---

## 7. Smoke Test Checklist

Chạy `npm run dev`, mở trình duyệt tại `http://localhost:5173`.

### Editor (mọi thứ trước đây hoạt động)
- [ ] Trang load, không có lỗi console đỏ
- [ ] Welcome screen hiển thị đúng
- [ ] Activity bar hiển thị với icon Explorer, Search, Git, Debug, Extensions
- [ ] Click icon Explorer → Sidebar hiển thị cây thư mục `sam-project`
- [ ] Double-click file → Monaco Editor mở file với syntax highlighting đúng
- [ ] Mở nhiều file → tab bar hiển thị đúng, click tab chuyển file
- [ ] Sidebar collapse/expand: Ctrl+B toggle sidebar
- [ ] Terminal: Ctrl+` toggle terminal panel
- [ ] Terminal: gõ `help` → hiển thị danh sách lệnh
- [ ] Command Palette: Ctrl+Shift+P → hiển thị danh sách commands
- [ ] Status bar: cursor position thay đổi khi di chuyển trong editor
- [ ] Ctrl+S → save file (không crash)
- [ ] Resize sidebar: kéo resize handle
- [ ] Resize panel: kéo resize handle

### Coverage Screen (màn mới)
- [ ] `/coverage` route hoạt động
- [ ] Empty state hiển thị với icon 📊 và message "No coverage report uploaded"
- [ ] Coverage screen không crash khi không có data

### Routing
- [ ] `/` redirect → `/editor`
- [ ] `/editor` → Editor chính
- [ ] `/coverage` → Coverage screen
- [ ] Coverage → Editor (sau này khi click risk item) hoạt động qua `navigateToFile`

### AsyncState Component
- [ ] `status: 'idle'` → render children
- [ ] `status: 'loading'` → render spinner
- [ ] `status: 'empty'` → render EmptyState với icon mặc định
- [ ] `status: 'error'` → render ErrorState với message + nút Try Again
- [ ] `emptyProps` truyền được icon, title, description tùy chỉnh

### Build
- [ ] `npm run build` thành công không lỗi
- [ ] Không có TypeError hoặc SyntaxError trong console

---

## 8. Các bước tiếp theo (Task 2, 3)

- **Task 2 (Overview screen):** Thêm component vào `src/coverage/`, mount vào route `/coverage`
- **Task 3 (Upload LCOV + API):** Tạo `src/coverage/api/coverageApi.js`, gắn vào `UploadLcov.jsx`
- **AsyncState** đã hoàn thành — reuse trong mọi API call ở Task 2, 3