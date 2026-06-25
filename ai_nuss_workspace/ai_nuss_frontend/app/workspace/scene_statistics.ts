/**
 * 场景工作台 — 统一统计计算函数
 *
 * Single Source of Truth：
 *   scenes[] → calculateSceneStatistics(scenes, characters) → Dashboard
 *
 * Dashboard 不维护任何独立状态，所有数据 derive 自 sceneList。
 */
import type { SceneUIModel, CharacterUIModel } from "../api_client";

// ═══════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════

export interface LocationSummary {
  indoor: number;
  outdoor: number;
  unknown: number;
  indoorRate: number;   // 0–100
  outdoorRate: number;
}

export interface TimeSummary {
  day: number;
  night: number;
  unknown: number;
  dayRate: number;      // 0–100
  nightRate: number;
}

export interface TransitionSummary {
  location: number;     // 相邻场景地点不同的次数
  time: number;         // 相邻场景时间不同的次数
  mode: number;         // 相邻场景叙事模式不同的次数
  objective: number;    // 目标转变（来自 segmentation_reason）
  conflict: number;     // 冲突升级（来自 segmentation_reason）
  narrative: number;    // 叙事切换（闪回 / 蒙太奇 / 平行时空）
}

export interface CharacterAppearance {
  id: string;
  name: string;
  count: number;        // 出场场次数
}

export interface SceneStatistics {
  totalScenes: number;
  location: LocationSummary;
  time: TimeSummary;
  transitions: TransitionSummary;
  characters: CharacterAppearance[];
}

// ═══════════════════════════════════════════════════
// 室内/室外 — 优先用后端 location_type；缺失时前端兜底
// ═══════════════════════════════════════════════════

const INDOOR_KW = [
  // 通用室内标记
  "室内", "内景", "INT.",
  "屋内", "房内", "室内场景",
  // 住宅房间
  "房间", "卧室", "客厅", "书房", "厨房", "浴室", "寝室", "宿舍",
  "厢房", "耳房", "偏房", "闺房", "绣房", "绣楼",
  "大厅", "大堂", "正堂", "厅", "室", "房",
  // 建筑整体
  "楼", "阁", "殿", "堂", "庙", "祠", "庵", "寺", "宫",
  "塔内", "阁内", "宫内", "殿内", "楼内",
  // 茅屋/木屋
  "茅屋", "草屋", "木屋", "石屋", "竹屋",
  // 工作/商业场所
  "办公室", "会议室", "教室", "审讯室", "牢房", "病房",
  "诊所", "医院", "药房", "医馆",
  "客栈", "酒店", "宾馆", "酒馆", "茶馆", "餐馆",
  "咖啡馆", "包厢", "雅间", "当铺", "钱庄", "银号", "柜坊",
  // 功能性房间
  "仓库", "库房", "储物间", "兵器库", "剑阁",
  "丹房", "练功房", "密室", "暗室", "石室",
  "静室", "禅房", "灵堂",
  "伙房", "灶房", "澡堂", "浴房",
  "茅厕", "茅房", "厕所",
  // 地下空间
  "地窖", "地下室", "地牢", "水牢", "地宫", "墓室", "陵墓",
  // 洞穴（武侠/仙侠常见）
  "山洞", "洞穴", "洞窟", "洞府", "石洞",
  // 帐篷/营帐
  "帐篷", "营帐", "大帐", "军帐",
  // 船舱
  "船舱", "舱内",
  // 通道
  "廊", "过道", "走道", "通道", "廊道",
  // 牲畜棚
  "马厩", "马棚", "牛棚",
  // 室内角落/特定位置
  "屋檐下", "廊下", "门前", "窗边", "桌旁",
  "床", "椅", "升降梯", "电梯里", "车内", "车里", "轿内",
  // 狱中 / 牢内
  "牢内", "狱中",
];

const OUTDOOR_KW = [
  // 通用室外标记
  "室外", "外景", "EXT.",
  "露天", "户外", "野外",
  // 城市/建筑外部
  "街道", "街", "路", "巷", "弄", "胡同",
  "广场", "集市", "市场", "车站", "机场", "月台",
  "花园", "院子", "院落", "公园",
  // 城外/村口
  "村口", "村头", "城外", "关外", "郊外",
  // 城墙/门
  "城墙", "城楼", "城头", "大门", "门口", "门外", "院外", "屋外",
  // 屋顶/高台
  "屋顶", "房顶", "塔顶", "塔外", "高台", "法坛",
  // 牌坊/天井
  "牌坊", "牌楼", "天井",
  // 庭院/园林建筑
  "亭", "台", "榭", "廊桥",
  // 自然地形
  "山", "林", "峰", "崖", "山顶", "山坡", "山峰",
  "悬崖", "峭壁", "绝壁",
  "山谷", "峡谷", "深谷",
  "田野", "田地", "田间", "田埂",
  "草原", "荒原", "沙漠", "戈壁", "沼泽", "湿地", "泥沼", "泥地",
  "雪地", "雪原", "冰原", "冰川",
  // 水边
  "河边", "海边", "湖边", "江边", "溪边",
  "河岸", "海岸", "湖岸", "河滩", "沙滩",
  "瀑布", "飞瀑", "温泉",
  // 树林/花丛
  "竹林", "桃林", "梅林", "松林", "花丛", "花间",
  // 树上
  "树上", "树下", "树梢",
  // 岛屿
  "岛", "孤岛", "火山",
  // 路径
  "小径", "山路", "山道", "石径", "官道",
  // 台阶
  "石阶", "台阶", "石梯",
  // 码头/桥/渡口
  "码头", "桥", "渡口",
  // 战场/坟场
  "战场", "沙场", "阵前", "坟场", "乱葬岗", "陵园",
  // 井边
  "井边", "井旁",
  // 遗迹/废墟
  "废墟", "遗迹",
  // 操场
  "操场",
  // 船上外部
  "甲板", "船头", "船尾",
  // 天空
  "天际", "天空下",
];

function classifyLocation(scene: SceneExtras): "indoor" | "outdoor" | "unknown" {
  // 优先用后端 location_type
  if (scene.location_type === "indoor" || scene.location_type === "outdoor") {
    return scene.location_type;
  }
  // 兜底：前端关键词分类（EXTERIOR 优先，避免 "室外" 被 "室" 误判为 indoor）
  const loc = scene.location || "";
  if (!loc) return "unknown";
  if (OUTDOOR_KW.some(k => loc.includes(k))) return "outdoor";
  if (INDOOR_KW.some(k => loc.includes(k))) return "indoor";
  return "unknown";
}

// ═══════════════════════════════════════════════════
// 白天/夜晚 关键词分类
// ═══════════════════════════════════════════════════

const DAY_KEYWORDS = ["日", "晨", "白天", "早上", "上午", "午", "下午"];
const NIGHT_KEYWORDS = ["夜", "暮", "晚上", "深夜", "傍晚", "黄昏", "凌晨"];

function classifyTimeOfDay(tod: string): "day" | "night" | "unknown" {
  if (!tod) return "unknown";
  if (DAY_KEYWORDS.some(k => tod.includes(k))) return "day";
  if (NIGHT_KEYWORDS.some(k => tod.includes(k))) return "night";
  return "unknown";
}

// ═══════════════════════════════════════════════════
// 辅助：从 scene 读取时间字段
// ═══════════════════════════════════════════════════

type SceneExtras = SceneUIModel & {
  time?: string;
  cast?: string[];
  location_type?: "indoor" | "outdoor" | "unknown";
  segmentation_reason?: {
    mode?: string;
    objective_changed?: boolean;
    conflict_changed?: boolean;
  };
};

function getTimeOfDay(scene: SceneExtras): string {
  return scene.time || scene.time_of_day || "";
}

function getCharacterIds(scene: SceneExtras): string[] {
  return (scene as SceneExtras).cast || scene.character_ids || [];
}

// ═══════════════════════════════════════════════════
// 核心统计函数
// ═══════════════════════════════════════════════════

export function calculateSceneStatistics(
  scenes: SceneUIModel[],
  characters: CharacterUIModel[],
): SceneStatistics {
  const totalScenes = scenes.length;

  if (totalScenes === 0) {
    return {
      totalScenes: 0,
      location: { indoor: 0, outdoor: 0, unknown: 0, indoorRate: 0, outdoorRate: 0 },
      time: { day: 0, night: 0, unknown: 0, dayRate: 0, nightRate: 0 },
      transitions: { location: 0, time: 0, mode: 0, objective: 0, conflict: 0, narrative: 0 },
      characters: [],
    };
  }

  // ── 遍历计算 ──
  let indoorCount = 0;
  let outdoorCount = 0;
  let unknownLocCount = 0;

  let dayCount = 0;
  let nightCount = 0;
  let unknownTimeCount = 0;

  let locTransitionCount = 0;
  let timeTransitionCount = 0;
  let modeTransitionCount = 0;

  let segObjChanged = 0;
  let segConflictChanged = 0;
  let segNarrativeChanged = 0;

  const charAppearance: Record<string, number> = {};

  for (let i = 0; i < totalScenes; i++) {
    const scene = scenes[i] as SceneExtras;

    // ① 室内/室外 — 直接读后端 location_type
    const locClass = classifyLocation(scene);
    if (locClass === "indoor") indoorCount++;
    else if (locClass === "outdoor") outdoorCount++;
    else unknownLocCount++;

    // ② 白天/夜晚
    const tod = getTimeOfDay(scene);
    const timeClass = classifyTimeOfDay(tod);
    if (timeClass === "day") dayCount++;
    else if (timeClass === "night") nightCount++;
    else unknownTimeCount++;

    // ③ 转场（相邻对比）
    if (i > 0) {
      const prev = scenes[i - 1] as SceneExtras;
      if (scene.location !== prev.location) locTransitionCount++;
      if (getTimeOfDay(scene) !== getTimeOfDay(prev)) timeTransitionCount++;
      if (scene.timeline_mode !== prev.timeline_mode) modeTransitionCount++;
    }

    // ④ 富信息转场
    const sr = scene.segmentation_reason;
    if (sr) {
      if (sr.objective_changed) segObjChanged++;
      if (sr.conflict_changed) segConflictChanged++;
      if (sr.mode) {
        switch (sr.mode) {
          case "flashback":
          case "montage":
          case "simultaneous":
            segNarrativeChanged++;
            break;
        }
      }
    }

    // ⑤ 出场人物
    for (const cid of getCharacterIds(scene)) {
      charAppearance[cid] = (charAppearance[cid] || 0) + 1;
    }
  }

  // ── 人物 ID → 名称映射 ──
  const idToName: Record<string, string> = {};
  for (const ch of characters) {
    idToName[ch.character_id] = ch.canonical_name;
  }

  // ── 按出场次数排序 ──
  const charList: CharacterAppearance[] = Object.entries(charAppearance)
    .map(([id, count]) => ({ id, name: idToName[id] || id, count }))
    .sort((a, b) => b.count - a.count);

  // ── 百分比 ──
  const locTotal = indoorCount + outdoorCount + unknownLocCount;
  const indoorRate = locTotal > 0 ? Math.round((indoorCount / locTotal) * 100) : 0;
  const outdoorRate = locTotal > 0 ? Math.round((outdoorCount / locTotal) * 100) : 0;

  const timeTotal = dayCount + nightCount + unknownTimeCount;
  const dayRate = timeTotal > 0 ? Math.round((dayCount / timeTotal) * 100) : 0;
  const nightRate = timeTotal > 0 ? Math.round((nightCount / timeTotal) * 100) : 0;

  return {
    totalScenes,
    location: {
      indoor: indoorCount,
      outdoor: outdoorCount,
      unknown: unknownLocCount,
      indoorRate,
      outdoorRate,
    },
    time: {
      day: dayCount,
      night: nightCount,
      unknown: unknownTimeCount,
      dayRate,
      nightRate,
    },
    transitions: {
      location: locTransitionCount,
      time: timeTransitionCount,
      mode: modeTransitionCount,
      objective: segObjChanged,
      conflict: segConflictChanged,
      narrative: segNarrativeChanged,
    },
    characters: charList,
  };
}
