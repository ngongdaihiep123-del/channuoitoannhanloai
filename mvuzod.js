import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.22.4/+esm';

// =============================================================================
// 1. ZOD SCHEMA DEFINITION (CẤU TRÚC DỮ LIỆU)
// =============================================================================

// Helper: Ép kiểu an toàn
const zNum = z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
}, z.number().default(0));

const zPercent = z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
}, z.number().default(0));

const zStr = z.preprocess((val) => {
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return val == null ? "" : String(val);
}, z.string().default(''));

// --- Các Schema con ---
const ChronicleSchema = z.object({
    year: zNum,
    event: zStr,
    description: zStr
}).passthrough();

const HarvestItemSchema = z.object({
    name: zStr, type: zStr, origin: zStr, description: zStr, source_sandbox_id: zStr, method_name: zStr
}).passthrough();

const GeneSchema = z.object({
    name: zStr, origin: zStr, description: zStr,
}).passthrough();

const HeroSchema = z.object({
    hero_id: zStr, hero_name: zStr, name: zStr, hero_race: zStr, species: zStr,
    hero_rank_title: zStr, hero_potential: zStr, hero_status: zStr,
    is_child_of_era: z.boolean().default(false),
    genius_tier: zStr.default("Phàm Nhân"),
    comprehension_val: zNum.default(10),
    hero_achievements: z.array(zStr).default([]),
    hero_inventory: z.array(zStr).default([]),
}).passthrough();

const MethodSchema = z.object({
    method_id: zStr, method_name: zStr, creator_name: zStr, method_type: zStr, rank_cap: zNum,
    requirements: z.array(zStr).default([]), is_harvested: z.boolean().default(false),
}).passthrough();

const AvatarSchema = z.object({
    avatar_id: zStr, name: zStr, role: zStr, species_base: zStr,
    is_active: z.boolean().default(false), current_sandbox_id: zStr, appearance: zStr,
}).passthrough();

const HostRouteSchema = z.object({
    route_name: zStr, base_method_ref: zStr, current_stage_name: zStr, current_rank_level: zNum,
    mastery_percentage: zPercent, host_stats_bonus: z.union([zStr, z.record(zNum), z.any()]).default(""),
}).passthrough();

const MacroItemSchema = z.object({
    item_id: zStr, name: zStr, quantity: zNum, macro_effect_desc: zStr,
}).passthrough();

const ConnectionSchema = z.object({
    connection_id: zStr, from_sandbox_id: zStr, to_sandbox_id: zStr, status: zStr,
    war_progress: zPercent, traffic_allowance: zStr,
}).passthrough();

const SandboxSchema = z.object({
    sandbox_id: zStr, sandbox_name: zStr, sandbox_era: zStr, sandbox_age_years: zNum,
    local_time_speed: zNum, disaster_level: zNum.max(10),
    environment_tags: z.array(zStr).default([]), geography_desc: zStr,
    dominant_species: zStr, population: zNum, average_lifespan: zNum, civilization_rank: zNum,
    genetic_slots: z.array(GeneSchema).max(5).default([]), evolution_stability: zPercent,
    tech_tree: z.array(zStr).default([]), chronicles: z.array(ChronicleSchema).default([]),
    active_era_child_count: zNum.default(0), era_heroes: z.array(HeroSchema).default([]),
    sandbox_methods: z.array(MethodSchema).default([]),
}).passthrough();

const CreatorSchema = z.object({
    real_name: zStr.default("{{user}}"), real_time_passed: zNum, global_time_ratio: zNum.default(36500),
    host_energy: zNum, energy_feedback_rate: zNum, host_health: zStr.default("Khỏe Mạnh"),
    host_genetic_slots: z.array(GeneSchema).max(5).default([{ name: "Gen Người", origin: "Trái Đất", description: "Cơ sở sinh học gốc." }]),
    host_avatars: z.array(AvatarSchema).default([]),
    harvest_log: z.array(z.union([zStr, HarvestItemSchema])).default([]),
    knowledge_library: z.array(zStr).default([]),
    cultivation: z.object({ routes: z.array(HostRouteSchema).default([]), body_condition: z.object({ body_adaptation: zStr }).default({}) }).default({}),
    sub_brain_status: z.object({ system_level: zNum, computing_power: zNum, storage_capacity_used: zNum, faith_impurity_level: zPercent }).default({}),
    real_world_inventory: z.array(MacroItemSchema).default([]),
    spatial_connections: z.array(ConnectionSchema).default([]),
    sandboxes: z.array(SandboxSchema).default([]),
    active_sandbox_index: zNum.default(0),
}).passthrough();

// ROOT SCHEMA
export const Schema = z.object({
    creator: CreatorSchema,
    world: z.object({}).passthrough().default({}),
    player: z.object({}).passthrough().default({}),
}).passthrough();


// =============================================================================
// 2. JSON PATCH LOGIC (CORE ENGINE)
// =============================================================================

/**
 * Chuyển đổi JSON Pointer path thành mảng các key
 * VD: "/creator/sandboxes/0" -> ["creator", "sandboxes", "0"]
 */
function parsePath(pathStr) {
    if (!pathStr || !pathStr.startsWith('/')) return [];
    return pathStr.split('/').slice(1).map(segment => {
        // Decode các ký tự đặc biệt trong JSON Pointer (~1 -> /, ~0 -> ~)
        return segment.replace(/~1/g, '/').replace(/~0/g, '~');
    });
}

/**
 * Lấy giá trị tại path
 */
function getValueAt(obj, pathArr) {
    let current = obj;
    for (let i = 0; i < pathArr.length; i++) {
        if (current === undefined || current === null) return undefined;
        current = current[pathArr[i]];
    }
    return current;
}

/**
 * Thực thi một lệnh Patch đơn lẻ
 */
function applyOperation(data, op) {
    const path = parsePath(op.path);
    if (path.length === 0 && op.op !== 'add') return data; // Root modification not supported easily except replace?

    const key = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    const parent = parentPath.length === 0 ? data : getValueAt(data, parentPath);

    if (parent === undefined || parent === null) {
        console.warn(`[MVU] Path not found: ${op.path}`);
        return data;
    }

    // Clone parent để kích hoạt UI update (Reactivity)
    // Lưu ý: Chỉ clone shallow phần parent đang thao tác là đủ cho hầu hết framework MVU
    // Nhưng để an toàn, ta thao tác trực tiếp và framework sẽ tự detect nếu ta gán lại root.
    
    switch (op.op) {
        case 'add': {
            // Xử lý Array Append (/-)
            if (Array.isArray(parent) && key === '-') {
                parent.push(op.value);
            } 
            // Xử lý Array Insert (/index)
            else if (Array.isArray(parent)) {
                const index = parseInt(key, 10);
                if (!isNaN(index)) {
                    parent.splice(index, 0, op.value);
                } else {
                     // Fallback nếu key không phải số (hiếm gặp trong chuẩn)
                    parent[key] = op.value;
                }
            } 
            // Xử lý Object Add key
            else {
                parent[key] = op.value;
            }
            break;
        }
        case 'remove': {
            if (Array.isArray(parent)) {
                const index = parseInt(key, 10);
                if (!isNaN(index)) parent.splice(index, 1);
            } else {
                delete parent[key];
            }
            break;
        }
        case 'replace': {
            if (Array.isArray(parent)) {
                const index = parseInt(key, 10);
                if (!isNaN(index)) parent[index] = op.value;
            } else {
                parent[key] = op.value;
            }
            break;
        }
        case 'delta': { // Lệnh tùy chỉnh cho số học
            const currentVal = parseFloat(parent[key]) || 0;
            const deltaVal = parseFloat(op.value) || 0;
            parent[key] = currentVal + deltaVal;
            break;
        }
        case 'move': {
            const fromPath = parsePath(op.from);
            const fromKey = fromPath[fromPath.length - 1];
            const fromParent = getValueAt(data, fromPath.slice(0, -1));
            
            // Lấy giá trị
            let val;
            if (Array.isArray(fromParent)) {
                const idx = parseInt(fromKey, 10);
                val = fromParent.splice(idx, 1)[0];
            } else {
                val = fromParent[fromKey];
                delete fromParent[fromKey];
            }

            // Gán vào nơi mới (Tái sử dụng logic add)
            applyOperation(data, { op: 'add', path: op.path, value: val });
            break;
        }
        case 'copy': {
            const fromVal = getValueAt(data, parsePath(op.from));
            // Deep copy giá trị để tránh tham chiếu
            const valClone = JSON.parse(JSON.stringify(fromVal));
            applyOperation(data, { op: 'add', path: op.path, value: valClone });
            break;
        }
        case 'test': {
            const currentVal = parent[key];
            if (JSON.stringify(currentVal) !== JSON.stringify(op.value)) {
                throw new Error(`[MVU Test Failed] Path: ${op.path}. Expected: ${op.value}, Actual: ${currentVal}`);
            }
            break;
        }
    }
    return data;
}

// =============================================================================
// 3. INTEGRATION (KẾT NỐI VỚI SILLY TAVERN)
// =============================================================================

function registerVariableSchema(schema, options) {
    if (window.Mvu && window.Mvu.registerVariableSchema) {
        window.Mvu.registerVariableSchema(schema, options);
        console.log("[MVU Zod] Schema registered via window.Mvu");
    } else {
        // Fallback nếu hàm chưa sẵn sàng
        window.registerVariableSchema = (s, o) => {
             if (window.Mvu && window.Mvu.registerVariableSchema) window.Mvu.registerVariableSchema(s, o);
        };
    }
}

// Đăng ký Schema ngay khi load
registerVariableSchema(z.object({ stat_data: Schema }), { type: 'message' });

// Lắng nghe sự kiện parse lệnh từ AI
// Chúng ta sẽ chặn và xử lý nếu nó là JSON Patch
function initListener() {
    if (typeof eventOn === 'undefined') {
        setTimeout(initListener, 100);
        return;
    }

    eventOn('mag_command_parsed_for_zod', (context, commands) => {
        // context.stat_data là dữ liệu gốc
        // commands là mảng các lệnh mà AI trả về (đã được parse JSON)

        let isModified = false;
        
        // Deep clone để đảm bảo Reactivity (Quan trọng để fix lỗi UI không cập nhật)
        // Dùng lodash cloneDeep nếu có, không thì dùng JSON parse/stringify
        let draftData = window._ ? window._.cloneDeep(context.stat_data) : JSON.parse(JSON.stringify(context.stat_data));
        
        if (!draftData) draftData = {};

        // Duyệt qua từng lệnh
        for (const cmd of commands) {
            // Kiểm tra xem lệnh có phải là JSON Patch (có 'op' và 'path') hay không
            if (cmd.op && cmd.path) {
                try {
                    // Nếu path chưa tồn tại mảng cha và đang dùng 'add', ta có thể tự init mảng (Safe Append)
                    // Logic này xử lý trong applyOperation hoặc ở đây
                    
                    applyOperation(draftData, cmd);
                    isModified = true;
                } catch (e) {
                    console.error("[MVU Zod] Patch Error:", e.message, cmd);
                    if (typeof toastr !== 'undefined') toastr.warning(`Lỗi cập nhật biến: ${e.message}`);
                }
            } 
            // Hỗ trợ ngược cho kiểu lệnh cũ 'type: set' nếu cần (Optional)
            else if (cmd.type === 'set' && cmd.args) {
                 // ... logic cũ ...
            }
        }

        if (isModified) {
            // Gán ngược lại dữ liệu đã sửa vào context
            context.stat_data = draftData;
            console.log("[MVU Zod] Data updated successfully via JSON Patch");
        }
    });

    console.log("[MVU Zod] Event listener initialized. Ready for JSON Patch.");
}

// Khởi chạy
initListener();

// Export hàm đăng ký cho tương thích
export function registerMvuSchema(schema) {
    registerVariableSchema(z.object({ stat_data: schema }), { type: 'message' });
}