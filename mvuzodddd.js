import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.22.4/+esm';

// =============================================================================
// 1. ZOD SCHEMA (BẢN V4 - "THÁO KHOÁN" ĐỂ TRÁNH LỖI SCHEMA VIOLATION)
// =============================================================================
// Thay vì kiểm tra kỹ từng tí, ta cho phép "z.any()" (cái gì cũng được) 
// đối với các danh sách hay biến động để tránh bị chặn.

const zNum = z.preprocess((val) => (val === null || val === undefined || val === '') ? 0 : (isNaN(parseFloat(val)) ? 0 : parseFloat(val)), z.number().default(0));
const zStr = z.preprocess((val) => {
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return val == null ? "" : String(val);
}, z.string().default(''));

// Định nghĩa lỏng lẻo cho các Object con (Dùng passthrough để không chặn key lạ)
const AnyObj = z.object({}).passthrough();

const SandboxSchema = z.object({
    sandbox_id: zStr, 
    sandbox_name: zStr,
    sandbox_age_years: zNum,
    
    // [QUAN TRỌNG] Chuyển tất cả mảng sang z.array(z.any()) để chấp nhận lệnh ADD thoải mái
    environment_tags: z.array(z.any()).default([]),
    genetic_slots: z.array(z.any()).default([]),
    tech_tree: z.array(z.any()).default([]),
    chronicles: z.array(z.any()).default([]),     // <--- Sửa lỗi non-extensible tại đây
    era_heroes: z.array(z.any()).default([]),     // <--- Sửa lỗi non-extensible tại đây
    sandbox_methods: z.array(z.any()).default([]),
}).passthrough();

const CreatorSchema = z.object({
    real_name: zStr.default("{{user}}"),
    host_energy: zNum,
    
    // Các mảng của Ký Chủ cũng mở khóa hoàn toàn
    host_genetic_slots: z.array(z.any()).default([]),
    host_avatars: z.array(z.any()).default([]),
    harvest_log: z.array(z.any()).default([]),    // <--- Sửa lỗi thêm kho tàng
    knowledge_library: z.array(z.any()).default([]),
    
    cultivation: z.object({ 
        routes: z.array(z.any()).default([]), 
        body_condition: z.object({}).passthrough().default({}) 
    }).default({}),
    
    real_world_inventory: z.array(z.any()).default([]),
    sandboxes: z.array(SandboxSchema).default([]),
}).passthrough();

export const Schema = z.object({ 
    creator: CreatorSchema, 
    world: z.object({}).passthrough().default({}), 
    player: z.object({}).passthrough().default({}) 
}).passthrough();

// =============================================================================
// 2. LOGIC XỬ LÝ LỆNH (GIỮ NGUYÊN TỪ V3 VÌ ĐÃ TỐT)
// =============================================================================

function parsePath(pathStr) {
    if (!pathStr || !pathStr.startsWith('/')) return [];
    return pathStr.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function ensurePathExists(obj, pathArr) {
    let current = obj;
    for (let i = 0; i < pathArr.length; i++) {
        const key = pathArr[i];
        if (current[key] === undefined || current[key] === null) {
            const nextKey = pathArr[i + 1];
            if (nextKey === '-' || !isNaN(parseInt(nextKey))) {
                current[key] = [];
            } else {
                current[key] = {};
            }
        }
        current = current[key];
    }
}

function getValueAt(obj, pathArr) {
    let current = obj;
    for (const key of pathArr) {
        if (current === undefined || current === null) return undefined;
        current = current[key];
    }
    return current;
}

function applyOperation(data, op) {
    const path = parsePath(op.path);
    if (path.length === 0) return;

    const key = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    
    if (op.op === 'add' || op.op === 'replace') {
        ensurePathExists(data, parentPath);
    }

    const parent = getValueAt(data, parentPath);
    if (!parent && op.op !== 'add') return;

    switch (op.op) {
        case 'add': {
            if (Array.isArray(parent)) {
                if (key === '-') {
                    parent.push(op.value);
                } else {
                    const idx = parseInt(key, 10);
                    if (!isNaN(idx)) parent.splice(idx, 0, op.value);
                }
            } else if (parent && typeof parent === 'object') {
                parent[key] = op.value;
            }
            break;
        }
        case 'remove': {
            if (Array.isArray(parent)) {
                const idx = parseInt(key, 10);
                if (!isNaN(idx)) parent.splice(idx, 1);
            } else if (parent) {
                delete parent[key];
            }
            break;
        }
        case 'replace': {
            if (Array.isArray(parent)) {
                const idx = parseInt(key, 10);
                if (!isNaN(idx)) parent[idx] = op.value;
            } else if (parent) {
                parent[key] = op.value;
            }
            break;
        }
        case 'delta': {
            if (parent && parent[key] !== undefined) {
                const currentVal = parseFloat(parent[key]) || 0;
                parent[key] = currentVal + (parseFloat(op.value) || 0);
            }
            break;
        }
    }
}

// =============================================================================
// 3. KẾT NỐI VÀO SILLY TAVERN
// =============================================================================

function registerVariableSchema(schema, options) {
    if (window.Mvu && window.Mvu.registerVariableSchema) {
        window.Mvu.registerVariableSchema(schema, options);
    } else {
        window.registerVariableSchema = (s, o) => {
             if (window.Mvu && window.Mvu.registerVariableSchema) window.Mvu.registerVariableSchema(s, o);
        };
    }
}
registerVariableSchema(z.object({ stat_data: Schema }), { type: 'message' });

function showToast(msg, type = 'info') {
    if (typeof toastr !== 'undefined') {
        toastr[type](msg, "MVU Zod V4");
    } else {
        console.log(`[MVU ${type}] ${msg}`);
    }
}

function initListener() {
    if (typeof eventOn === 'undefined') { setTimeout(initListener, 100); return; }
    
    showToast("Đã tải MVU V4 (Schema Unlocked)", "success");

    eventOn('mag_command_parsed_for_zod', (context, commands) => {
        let isModified = false;
        let draftData = JSON.parse(JSON.stringify(context.stat_data || {}));
        
        for (const cmd of commands) {
            if (cmd.op && cmd.path) {
                try {
                    applyOperation(draftData, cmd);
                    isModified = true;
                } catch (e) { 
                    console.error("Patch Error:", e, cmd);
                    showToast(`Lỗi lệnh ${cmd.op}: ${e.message}`, "error");
                }
            }
        }

        if (isModified) {
            context.stat_data = draftData;
            showToast(`Cập nhật thành công ${commands.length} lệnh!`, "success");
        }
    });
}

initListener();

export function registerMvuSchema(schema) {
    registerVariableSchema(z.object({ stat_data: schema }), { type: 'message' });
}