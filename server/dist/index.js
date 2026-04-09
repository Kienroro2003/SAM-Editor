"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const errorHandler_1 = require("@/middleware/errorHandler");
const analyze_1 = __importDefault(require("@/routes/analyze"));
const history_1 = __importDefault(require("@/routes/history"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 3000;
const frontendUrl = process.env.FRONTEND_URL;
app.use((0, cors_1.default)({
    origin: frontendUrl || true,
}));
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests, please try again later.',
    },
});
app.use(limiter);
app.use('/api/analyze', analyze_1.default);
app.use('/api/history', history_1.default);
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
    });
});
app.use(errorHandler_1.errorHandler);
app.listen(port, () => {
    console.log(`SAM Backend running on port ${port}`);
});
