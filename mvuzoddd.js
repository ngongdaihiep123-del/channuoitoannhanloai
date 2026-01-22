import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.22.4/+esm';

// --- 1. KHAI BÁO SCHEMA (GIỮ NGUYÊN) ---
const zNum = z.preprocess((val) => (val === null || val === undefined || val === '') ? 0 : (isNaN(parseFloat(val)) ? 0 : parseFloat(val)), z.number().default(0));
const zPercent = z.preprocess((val) => (val === null || val === undefined || val === '') ? 0 : Math.min(100, Math.max(0, parseFloat(val) || 0)), z.number().default(0));
const zStr = z.preprocess((val) => {
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return val == null ? "" : String(val);
}, z.string().default(''));

const ChronicleSchema = z.object({ year: zNum, event: zStr, description: zStr }).passthrough();
const HarvestItemSchema = z.object({ name: zStr, type: zStr, origin: zStr, description: zStr, source_sandbox_id: zStr, method_name: zStr }).passthrough();
const GeneSchema = z.object({ name: zStr, origin: zStr, description: zStr }).passthrough();
const HeroSchema = z.object({
    hero_id: zStr, hero_name: zStr, name: zStr, hero_race: zStr, species: zStr,
    hero_rank_title: zStr, hero_potential: zStr, hero_status: zStr,
    is_child_of_era: z.boolean().default(false), genius_tier: zStr.default("Phàm Nhân"),
    comprehension_val: zNum.default(10), hero_achievements: z.array(zStr).default([]),
    hero_inventory: z.array(zStr).default([]),
}).passthrough();
const MethodSchema = z.object({ method_id: zStr, method_name: zStr, creator_name: zStr, method_type: zStr, rank_cap: zNum, requirements: z.array(zStr).default([]), is_harvested: z.boolean().default(false) }).passthrough();
const AvatarSchema = z.object({ avatar_id: zStr, name: zStr, role: zStr, species_base: zStr, is_active: z.boolean().default(false), current_sandbox_id: zStr, appearance: zStr }).passthrough();
const HostRouteSchema = z.object({ route_name: zStr, base_method_ref: zStr, current_stage_name: zStr, current_rank_level: zNum, mastery_percentage: zPercent, host_stats_bonus: z.union([zStr, z.record(zNum), z.any()]).default("") }).passthrough();
const MacroItemSchema = z.object({ item_id: zStr, name: zStr, quantity: zNum, macro_effect_desc: zStr }).passthrough();
const ConnectionSchema = z.object({ connection_id: zStr, from_sandbox_id: zStr, to_sandbox_id: zStr, status: zStr, war_progress: zPercent, traffic_allowance: zStr }).passthrough();

const SandboxSchema = z.object({
    sandbox_id: zStr, sandbox_name: zStr, sandbox_era: zStr, sandbox_age_years: zNum,
    local_time_speed: zNum, disaster_level: zNum.max(10), environment_tags: z.array(zStr).default([]), geography_desc: zStr,
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

export const Schema = z.object({ creator: CreatorSchema, world: z.object({}).passthrough().default({}), player: z.object({}).passthrough().default({}) }).passthrough();

// --- 2. HÀM XỬ LÝ (LOGIC CỐT LÕI) ---

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
            // Nếu key tiếp theo là số hoặc '-', tạo mảng. Ngược lại tạo object.
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
    
    // Tự động tạo cha nếu là lệnh thêm mới
    if (op.op === 'add' || op.op === 'replace') {
        ensurePathExists(data, parentPath);
    }

    const parent = getValueAt(data, parentPath);
    if (!parent && op.op !== 'add') throw new Error(`Parent path not found: ${op.path}`);

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
            } else {
                throw new Error(`Cannot add to non-container at: ${op.path}`);
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
                const deltaVal = parseFloat(op.value) || 0;
                parent[key] = currentVal + deltaVal;
            }
            break;
        }
    }
}

// --- 3. KẾT NỐI VÀO SILLY TAVERN (DEBUG MODE) ---

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
        toastr[type](msg, "MVU Zod System");
    } else {
        console.log(`[MVU ${type}] ${msg}`);
    }
}

function initListener() {
    if (typeof eventOn === 'undefined') { setTimeout(initListener, 100); return; }
    
    // Thông báo khi Script tải thành công
    showToast("Đã tải MVU Zod V3 (Hỗ trợ Add/Delta)", "success");

    eventOn('mag_command_parsed_for_zod', (context, commands) => {
        let isModified = false;
        let errorCount = 0;
        
        // Clone dữ liệu an toàn
        let draftData = JSON.parse(JSON.stringify(context.stat_data || {}));
        
        for (const cmd of commands) {
            if (cmd.op && cmd.path) {
                try {
                    applyOperation(draftData, cmd);
                    isModified = true;
                } catch (e) { 
                    console.error("Patch Error:", e, cmd);
                    errorCount++;
                    showToast(`Lỗi lệnh ${cmd.op}: ${e.message}`, "error");
                }
            }
        }

        if (isModified) {
            context.stat_data = draftData;
            // Thông báo thành công
            showToast(`Đã cập nhật ${commands.length} lệnh biến! (Lỗi: ${errorCount})`, "success");
        }
    });
}

initListener();

export function registerMvuSchema(schema) {
    registerVariableSchema(z.object({ stat_data: schema }), { type: 'message' });
}