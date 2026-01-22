import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.22.4/+esm';

// =============================================================================
// 1. ZOD SCHEMA (PHIÊN BẢN V4 - FINAL UNLOCKED)
// =============================================================================
// Mục tiêu: Cho phép lệnh ADD hoạt động tự do, không bị lỗi "non-extensible".

const zNum = z.preprocess((val) => (val === null || val === undefined || val === '') ? 0 : (isNaN(parseFloat(val)) ? 0 : parseFloat(val)), z.number().default(0));
const zStr = z.preprocess((val) => {
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return val == null ? "" : String(val);
}, z.string().default(''));

// Định nghĩa cơ bản cho Sandbox
const SandboxSchema = z.object({
    sandbox_id: zStr, 
    sandbox_name: zStr,
    sandbox_era: zStr,
    sandbox_age_years: zNum,
    local_time_speed: zNum,
    disaster_level: zNum,
    geography_desc: zStr,
    dominant_species: zStr, 
    population: zNum, 
    average_lifespan: zNum, 
    civilization_rank: zNum,
    evolution_stability: zNum.default(100),
    active_era_child_count: zNum.default(0),

    // [QUAN TRỌNG NHẤT] MỞ KHÓA TOÀN BỘ CÁC MẢNG
    // Dùng z.array(z.any()) thay vì định nghĩa cứng nhắc
    environment_tags: z.array(z.any()).default([]),
    genetic_slots: z.array(z.any()).default([]),
    tech_tree: z.array(z.any()).default([]),
    chronicles: z.array(z.any()).default([]),      // <--- Sửa lỗi ADD nhật ký
    era_heroes: z.array(z.any()).default([]),      // <--- Sửa lỗi ADD hero
    sandbox_methods: z.array(z.any()).default([]),
}).passthrough();

// Định nghĩa cơ bản cho Ký Chủ
const CreatorSchema = z.object({
    real_name: zStr.default("{{user}}"),
    real_time_passed: zNum,
    global_time_ratio: zNum.default(36500),
    host_energy: zNum,
    energy_feedback_rate: zNum,
    host_health: zStr.default("Khỏe Mạnh"),
    active_sandbox_index: zNum.default(0),
    
    // MỞ KHÓA TOÀN BỘ CÁC MẢNG
    host_genetic_slots: z.array(z.any()).default([]),
    host_avatars: z.array(z.any()).default([]),
    harvest_log: z.array(z.any()).default([]),     // <--- Sửa lỗi ADD kho tàng
    knowledge_library: z.array(z.any()).default([]),
    real_world_inventory: z.array(z.any()).default([]),
    spatial_connections: z.array(z.any()).default([]),
    
    sandboxes: z.array(SandboxSchema).default([]),
    
    cultivation: z.object({ 
        routes: z.array(z.any()).default([]), 
        body_condition: z.object({}).passthrough().default({}) 
    }).default({}),
    
    sub_brain_status: z.object({}).passthrough().default({})

}).passthrough();

// Root Schema
export const Schema = z.object({ 
    creator: CreatorSchema, 
    world: z.object({}).passthrough().default({}), 
    player: z.object({}).passthrough().default({}) 
}).passthrough();

// =============================================================================
// 2. LOGIC XỬ LÝ LỆNH JSON PATCH
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
        toastr[type](msg, "MVU V4 System");
    } else {
        console.log(`[MVU ${type}] ${msg}`);
    }
}

function initListener() {
    if (typeof eventOn === 'undefined') { setTimeout(initListener, 100); return; }
    
    showToast("MVU V4 Loaded (ADD Unlocked)", "success");

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
                    showToast(`Lỗi: ${e.message}`, "error");
                }
            }
        }

        if (isModified) {
            context.stat_data = draftData;
            showToast(`Đã cập nhật ${commands.length} lệnh!`, "success");
        }
    });
}

initListener();

export function registerMvuSchema(schema) {
    registerVariableSchema(z.object({ stat_data: schema }), { type: 'message' });
}