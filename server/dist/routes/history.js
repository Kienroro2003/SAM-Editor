"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get('/', (_req, res) => {
    res.status(501).json({
        success: false,
        error: 'Not Implemented',
    });
});
router.get('/:id', (_req, res) => {
    res.status(501).json({
        success: false,
        error: 'Not Implemented',
    });
});
exports.default = router;
