import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.22.4/+esm';

// =============================================================================
// 1. ZOD SCHEMA & HELPER (GIỮ NGUYÊN PHẦN BẠN ĐÃ LÀM TỐT)
// =============================================================================

const zNum = z.preprocess((val) => (val === null || val === undefined || val === '') ? 0 : (isNaN(parseFloat(val)) ? 0 : parseFloat(val)), z.number().default(0));
const zStr = z.preprocess((val) => {
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return val == null ? "" : String(val);
}, z.string().default(''));

// MẢNG VẠN NĂNG (Chìa khóa để Move/Copy/Add thoải mái)
const zArr = z.array(z.any()).default([]);

// --- SCHEMA CHÍNH ---
const SandboxSchema = z.object({
    sandbox_id: zStr, sandbox_name: zStr, sandbox_era: zStr,
    sandbox_age_years: zNum, local_time_speed: zNum, disaster_level: zNum,
    geography_desc: zStr, dominant_species: zStr, population: zNum,
    average_lifespan: zNum, civilization_rank: zNum,
    evolution_stability: zNum.default(100), active_era_child_count: zNum.default(0),

    // Các mảng mở khóa
    environment_tags: zArr, genetic_slots: zArr, tech_tree: zArr,
    chronicles: zArr, era_heroes: zArr, sandbox_methods: zArr
}).passthrough();

const CreatorSchema = z.object({
    real_name: zStr.default("{{user}}"),
    real_time_passed: zNum, global_time_ratio: zNum.default(36500),
    host_energy: zNum, energy_feedback_rate: zNum, host_health: zStr.default("Khỏe Mạnh"),
    active_sandbox_index: zNum.default(0),

    host_genetic_slots: zArr, host_avatars: zArr, harvest_log: zArr,
    knowledge_library: zArr, real_world_inventory: zArr, spatial_connections: zArr,
    sandboxes: z.array(SandboxSchema).default([]),
    
    cultivation: z.object({ routes: zArr, body_condition: z.object({}).passthrough().default({}) }).default({}),
    sub_brain_status: z.object({}).passthrough().default({})
}).passthrough();

export const Schema = z.object({ 
    creator: CreatorSchema, 
    world: z.object({}).passthrough().default({}), 
    player: z.object({}).passthrough().default({}) 
}).passthrough();

// =============================================================================
// 2. BỘ XỬ LÝ LỆNH ĐA NĂNG (ENGINE HỖ TRỢ 7 LỆNH)
// =============================================================================
// Đây là phần quan trọng nhất để Move, Copy, Test, Delta hoạt động

function parsePath(pathStr) {
    if (!pathStr || !pathStr.startsWith('/')) return [];
    return pathStr.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

// Hàm đảm bảo đường dẫn tồn tại (Tự tạo mảng/object nếu thiếu)
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

function getValue(obj, pathArr) {
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
    
    // Tự động tạo cha cho các lệnh thêm dữ liệu
    if (['add', 'replace', 'copy', 'move'].includes(op.op)) {
        ensurePathExists(data, parentPath);
    }

    const parent = getValue(data, parentPath);
    if (!parent && !['add', 'replace', 'copy', 'move'].includes(op.op)) return;

    switch (op.op) {
        case 'add': {
            if (Array.isArray(parent)) {
                if (key === '-') parent.push(op.value);
                else parent.splice(parseInt(key, 10), 0, op.value);
            } else if (parent && typeof parent === 'object') parent[key] = op.value;
            break;
        }
        case 'remove': {
            if (Array.isArray(parent)) parent.splice(parseInt(key, 10), 1);
            else if (parent) delete parent[key];
            break;
        }
        case 'replace': {
            if (Array.isArray(parent)) parent[parseInt(key, 10)] = op.value;
            else if (parent) parent[key] = op.value;
            break;
        }
        case 'delta': { // Lệnh cộng trừ số (Quan trọng cho Prompt của bạn)
            if (parent && parent[key] !== undefined) {
                const currentVal = parseFloat(parent[key]) || 0;
                parent[key] = currentVal + (parseFloat(op.value) || 0);
            }
            break;
        }
        case 'move': { // Lệnh di chuyển
            const fromPath = parsePath(op.from);
            const fromKey = fromPath[fromPath.length - 1];
            const fromParent = getValue(data, fromPath.slice(0, -1));
            let val;
            if (Array.isArray(fromParent)) val = fromParent.splice(parseInt(fromKey, 10), 1)[0];
            else { val = fromParent[fromKey]; delete fromParent[fromKey]; }
            
            if (val !== undefined) {
                if (Array.isArray(parent)) {
                    if (key === '-') parent.push(val);
                    else parent.splice(parseInt(key, 10), 0, val);
                } else parent[key] = val;
            }
            break;
        }
        case 'copy': { // Lệnh sao chép
            const fromPath = parsePath(op.from);
            const val = JSON.parse(JSON.stringify(getValue(data, fromPath))); // Deep clone
            if (val !== undefined) {
                if (Array.isArray(parent)) {
                    if (key === '-') parent.push(val);
                    else parent.splice(parseInt(key, 10), 0, val);
                } else parent[key] = val;
            }
            break;
        }
        case 'test': { // Lệnh kiểm tra điều kiện
            const currentVal = Array.isArray(parent) ? parent[parseInt(key, 10)] : parent[key];
            if (JSON.stringify(currentVal) !== JSON.stringify(op.value)) {
                throw new Error(`Test failed at ${op.path}`);
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
    if (typeof toastr !== 'undefined') toastr[type](msg, "MVU V6 (Full Engine)");
    else console.log(`[MVU ${type}] ${msg}`);
}

function initListener() {
    if (typeof eventOn === 'undefined') { setTimeout(initListener, 100); return; }
    
    showToast("Đã tải MVU V6 (Hỗ trợ Move/Copy/Delta/Test)", "success");

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
            showToast(`Đã thực thi ${commands.length} lệnh!`, "success");
        }
    });
}

// Khởi chạy
initListener();
export function registerMvuSchema(schema) {
    registerVariableSchema(z.object({ stat_data: schema }), { type: 'message' });
}