"""
AI-NUSS 3.0 — Scene Segmentation Engine (v3 + location_type)
五类标准分场规则:
  1. location_shift — 物理地理位置变换
  2. time_shift — 同地时间变换
  3. flashback — 意识流回忆与闪回
  4. montage — 空间蒙太奇与意向转场
  5. simultaneous — 多线同时发生

每场输出: location / time / timeline_mode / cast / beats
"""
import re
import json
import asyncio
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass
from app.graph.agents.base import BaseAgent


# ═══════════════════════════════════════════════════════════
# 五类分场检测器
# ═══════════════════════════════════════════════════════════

class SceneSegmentationDetector:
    """
    按优先级检测分场类型:
      1. simultaneous > 2. montage > 3. flashback > 4. location_shift > 5. time_shift
    """

    # —— 1. 物理位置变换 ——
    LOCATION_SHIFT_PATTERNS = [
        (r"(?:推开门?|走出?|走进?|来到|进入|回到|离开|踏入|跨进|迈入)(?:了)?(.{1,12}(?:厅|室|园|房|院|楼|廊|街|场|店|馆|所|房间|卧室|客厅|书房|厨房|大门|门|电梯))", "location_shift"),
        (r"转移到了?\s*(.{1,12}(?:厅|室|园|房|院|楼|廊|街|场|店|馆|所))", "location_shift"),
        (r"INT\.\s*.+", "location_shift"),
        (r"EXT\.\s*.+", "location_shift"),
    ]

    # —— 2. 同地时间变换 ——
    TIME_SHIFT_PATTERNS = [
        (r"(?:(\d+)\s*(?:个?小时?|分钟|天|周|月|年)(?:后|之后|以后|过去了?))", "time_shift"),
        (r"(?:次日|第二天|隔天|翌日|第二天一早|第二天清晨|第二天早上)", "time_shift"),
        (r"(?:夜深了?|夜深人静|半夜|午夜|凌晨)", "time_shift"),
        (r"(?:清晨|早晨|早上|天亮|拂晓|日出)", "time_shift"),
        (r"(?:黄昏|傍晚|日落|暮色|入夜)", "time_shift"),
        (r"(?:转眼间?|一晃|时光飞逝|渐渐|不知不[觉觉])", "time_shift"),
    ]

    # —— 3. 意识流闪回 ——
    FLASHBACK_PATTERNS = [
        (r"(?:思绪|记忆|回忆|脑海).{0,10}(?:回到|飘回|拉回|切[入回]|涌现).{0,10}(?:五年前|三年前|几年前|那[一年天个]|从前|曾经|过去)", "flashback"),
        (r"(?:想起了?|回忆起?|记起)(?:了)?.{0,15}(?:五年前|三年前|几年前|那[一年天个]|从前|曾经)", "flashback"),
        (r"(?:脑海里?浮现|眼前浮现|脑中闪过|记忆[中里]).{0,20}", "flashback"),
        (r"(?:那[一年天].{0,10}(?:的夜晚?|的夏天|的冬天|的秋天|的春天))", "flashback"),
        (r"(?:想起了?|回忆起?).{0,8}(?:第一次|最初|当初|当年)", "flashback"),
        (r"(?:恍惚间?|仿佛.{0,10}(?:看到|听到|回到))", "flashback"),
    ]

    # —— 4. 空间蒙太奇 ——
    MONTAGE_PATTERNS = [
        (r"(?:在.{2,6}(?:流浪|漂泊|奔走|穿梭|来回).{0,20}(?:在.{2,6}(?:搬砖|奔跑|打工|流浪|挣扎|求生)))", "montage"),
        (r"(?:连续|不断|反复|一遍遍|一次次).{0,10}(?:训练|尝试|失败|重复|练习)", "montage"),
        (r"(?:画面.{0,5}(?:切换|闪过|交替|闪现))", "montage"),
        (r"(?:数月后|几年后|数年后|多年后|几周后).{0,15}(?:已经|终于|变成)", "montage"),
        (r"(?:日复一日|年复一年|一天又一天|一夜又一夜)", "montage"),
        (r"(?:快速|飞速|飞快).{0,5}(?:闪过|掠过|剪辑|切换)", "montage"),
    ]

    # —— 5. 多线同时 ——
    SIMULTANEOUS_PATTERNS = [
        (r"(?:就在.{0,15}的同时)", "simultaneous"),
        (r"(?:与此[同时间时]|同一时[间刻]|此时此刻).{0,10}(?:在|另|另一)", "simultaneous"),
        (r"(?:另一边|另一[方面头]|而在).{0,5}(?:在|正在)", "simultaneous"),
        (r"(?:镜头切换|画面一转).{0,10}(?:在|另)", "simultaneous"),
    ]

    @classmethod
    def detect(cls, text: str) -> Tuple[str, str, List[str]]:
        """
        返回: (timeline_mode, location_hint, matched_markers)
        优先级: simultaneous > montage > flashback > location_shift > time_shift
        """
        if not text:
            return "sequential", "", []

        detectors = [
            (cls.SIMULTANEOUS_PATTERNS, "simultaneous"),
            (cls.MONTAGE_PATTERNS, "montage"),
            (cls.FLASHBACK_PATTERNS, "flashback"),
            (cls.LOCATION_SHIFT_PATTERNS, "location_shift"),
            (cls.TIME_SHIFT_PATTERNS, "time_shift"),
        ]

        for patterns, mode in detectors:
            for pattern, _ in patterns:
                m = re.search(pattern, text)
                if m:
                    location_hint = m.group(1) if m.lastindex and m.group(1) else ""
                    return mode, location_hint.strip(), [m.group(0)]

        return "sequential", "", []


# ═══════════════════════════════════════════════════════════
# Location / Time 提取器
# ═══════════════════════════════════════════════════════════

class LocationExtractor:
    """从文本中智能提取场景位置与时间（改进版 — 扩展关键词和提取模式）"""

    # 室内关键词（扩展）
    INTERIOR = [
        # 通用室内
        "房间", "屋内", "房内", "室内", "室内场景", "内景", "INT.",
        # 住宅房间
        "卧室", "客厅", "书房", "厨房", "浴室", "寝室", "宿舍",
        "厢房", "耳房", "偏房", "闺房", "绣房", "绣楼",
        "大厅", "大堂", "正堂", "厅", "室", "房",
        # 建筑整体
        "楼", "阁", "殿", "堂", "庙", "祠", "庵", "寺", "宫",
        "塔内", "阁内", "宫内", "殿内", "楼内",
        # 茅屋/木屋
        "茅屋", "草屋", "木屋", "石屋", "竹屋",
        # 工作/商业场所
        "办公室", "会议室", "教室", "审讯室", "牢房", "病房",
        "诊所", "医院", "药房", "医馆",
        "客栈", "酒店", "宾馆", "酒馆", "茶馆", "餐馆",
        "咖啡馆", "包厢", "雅间", "当铺", "钱庄", "银号", "柜坊",
        # 功能性房间
        "仓库", "库房", "储物间", "兵器库", "剑阁",
        "丹房", "练功房", "密室", "暗室", "石室",
        "静室", "禅房", "灵堂",
        "伙房", "灶房", "澡堂", "浴房",
        "茅厕", "茅房", "厕所",
        # 地下空间
        "地窖", "地下室", "地牢", "水牢", "地宫", "墓室", "陵墓",
        # 洞穴（武侠/仙侠常见）
        "山洞", "洞穴", "洞窟", "洞府", "石洞",
        # 帐篷/营帐
        "帐篷", "营帐", "大帐", "军帐",
        # 船舱
        "船舱", "舱内",
        # 通道
        "廊", "过道", "走道", "通道", "廊道",
        # 牲畜棚
        "马厩", "马棚", "牛棚",
        # 室内角落/特定位置
        "屋檐下", "廊下", "门前", "窗边", "桌旁",
        "床", "椅", "升降梯", "电梯里", "车内", "车里", "轿内",
        # 狱中 / 牢内
        "牢内", "狱中",
    ]
    # 室外关键词（扩展）
    EXTERIOR = [
        # 通用室外
        "室外", "外景", "EXT.", "露天", "户外", "野外",
        # 城市/建筑外部
        "街道", "街", "路", "巷", "弄", "胡同",
        "广场", "集市", "市场", "车站", "机场", "月台",
        "花园", "院子", "院落", "公园",
        # 城外/村口
        "村口", "村头", "城外", "关外", "郊外",
        # 城墙/门
        "城墙", "城楼", "城头", "大门", "门口", "门外", "院外", "屋外",
        # 屋顶/高台
        "屋顶", "房顶", "塔顶", "塔外", "高台", "法坛",
        # 牌坊/天井
        "牌坊", "牌楼", "天井",
        # 庭院/园林建筑
        "亭", "台", "榭", "廊桥",
        # 自然地形
        "山", "林", "峰", "崖", "山顶", "山坡", "山峰",
        "悬崖", "峭壁", "绝壁",
        "山谷", "峡谷", "深谷",
        "田野", "田地", "田间", "田埂",
        "草原", "荒原", "沙漠", "戈壁", "沼泽", "湿地", "泥沼", "泥地",
        "雪地", "雪原", "冰原", "冰川",
        # 水边
        "河边", "海边", "湖边", "江边", "溪边",
        "河岸", "海岸", "湖岸", "河滩", "沙滩",
        "瀑布", "飞瀑", "温泉",
        # 树林/花丛
        "竹林", "桃林", "梅林", "松林", "花丛", "花间",
        # 树上
        "树上", "树下", "树梢",
        # 岛屿
        "岛", "孤岛", "火山",
        # 路径
        "小径", "山路", "山道", "石径", "官道",
        # 台阶
        "石阶", "台阶", "石梯",
        # 码头/桥/渡口
        "码头", "桥", "渡口",
        # 战场/坟场
        "战场", "沙场", "阵前", "坟场", "乱葬岗", "陵园",
        # 井边
        "井边", "井旁",
        # 遗迹/废墟
        "废墟", "遗迹",
        # 操场
        "操场",
        # 船上外部
        "甲板", "船头", "船尾",
        # 天空
        "天际", "天空下",
    ]

    @classmethod
    def classify_indoor_outdoor(cls, location: str) -> str:
        """根据已知的室内/室外关键词判定 location_type。
        EXTERIOR 先于 INTERIOR 检查，避免单字关键词（如 INTERIOR 的 "室"）
        误匹配包含该字的室外地点（如"室外"）。"""
        if not location: return "unknown"
        # EXTERIOR 优先：防止 "室外" 被 INTERIOR 的 "室" 误判为 indoor
        if any(w in location for w in cls.EXTERIOR): return "outdoor"
        if any(w in location for w in cls.INTERIOR): return "indoor"
        return "unknown"

    @classmethod
    def extract(cls, text: str) -> Tuple[str, str]:
        """
        返回: (地点名, 时间)
        """
        # 先尝试提取具体地点名（优先）
        named_loc = cls._extract_named_location(text)

        if named_loc:
            return named_loc, cls._extract_time(text)

        # 无具体地名 → 用文本中出现的最具体地点关键词作为位置名
        # 优先级：具名房间 > 建筑类型 > 室外场所 > 室内/室外
        NAMED_ROOMS = [
            "卧室", "客厅", "书房", "厨房", "浴室", "办公室", "会议室",
            "教室", "审讯室", "牢房", "病房", "寝室", "宿舍", "密室", "暗室",
            "练功房", "丹房", "药房", "兵器库", "仓库", "库房",
            "闺房", "绣房", "绣楼", "厢房", "耳房",
            "静室", "禅房", "灵堂", "澡堂", "浴房",
            "伙房", "灶房", "茅厕", "茅房",
        ]
        NAMED_BUILDINGS = [
            "诊所", "医院", "客栈", "酒店", "宾馆", "咖啡馆", "茶馆", "酒馆", "餐馆",
            "庙", "祠", "庵", "寺", "宫", "殿", "堂", "阁", "轩", "斋",
            "当铺", "钱庄", "银号", "柜坊",
        ]
        NAMED_OUTDOOR = [
            "花园", "院子", "院落", "广场", "公园", "码头", "桥", "渡口",
            "巷", "弄", "胡同", "集市", "市场", "车站", "机场", "月台",
            "墓地", "荒原", "沙漠", "草原", "山", "山顶", "山坡",
            "溪边", "湖边", "江边", "河边", "海边",
            "河岸", "湖岸", "海岸", "河滩", "沙滩",
            "村口", "村头", "城外", "关外",
            "竹林", "桃林", "梅林", "松林", "花丛",
            "峡谷", "山谷", "悬崖", "峭壁",
            "战场", "沙场", "坟场", "乱葬岗",
            "城墙", "城楼", "牌坊", "牌楼",
            "石阶", "台阶", "小径", "山路", "山道",
        ]

        for name in NAMED_ROOMS:
            if name in text:
                return name, cls._extract_time(text)
        for name in NAMED_BUILDINGS:
            if name in text:
                return name, cls._extract_time(text)
        for name in NAMED_OUTDOOR:
            if name in text:
                return name, cls._extract_time(text)

        # 统计室内/室外关键词 → 用具体词或兜底
        interior_count = sum(1 for w in cls.INTERIOR if w in text)
        exterior_count = sum(1 for w in cls.EXTERIOR if w in text)

        # 找到命中次数最多的具体关键词
        best_interior = ""
        best_exterior = ""
        for w in cls.INTERIOR:
            if w in text and len(w) > len(best_interior):
                best_interior = w
        for w in cls.EXTERIOR:
            if w in text and len(w) > len(best_exterior):
                best_exterior = w

        if interior_count > exterior_count:
            location = best_interior or "室内"
        elif exterior_count > interior_count:
            location = best_exterior or "室外"
        else:
            dialogue_markers = ["说", "道", "问", "答", "想", "心中", "暗暗", "心想"]
            if any(w in text for w in dialogue_markers):
                location = best_interior or "室内"
            else:
                location = best_exterior or "室外"

        return location, cls._extract_time(text)

    @classmethod
    def _extract_named_location(cls, text: str) -> Optional[str]:
        """提取具体地点名，按优先级尝试多种模式"""
        patterns = [
            # 1. INT./EXT. 标记
            r"INT\.\s*(.+)",
            r"EXT\.\s*(.+)",
            # 2. "姓+家/府/宅/园/邸"
            r"([一-鿿]{1,2}(?:家|府|宅|园|邸))",
            # 3. "来到/走进/回到/进入 + 地点"（扩展地点后缀）
            r"(?:来到|走进|回到|进入|踏入|迈入|跨入|步入|行至|走到)(?:了|到)?(.{1,12}(?:厅|室|园|房|院|楼|廊|街|场|店|馆|所|殿|堂|阁|庙|寺|宫|巷|弄|洞|窟|帐|舱|厩|棚|屋|台|塔|径|道|阶|岸|谷|崖|壁|原|林|岛|滩|桥|渡|坟|庄|铺|栈|坊))",
            # 4. "在XX里/中/内/外/前/旁/边/上/下/间"
            r"在([一-鿿]{1,8}(?:里|中|内|外|前|旁|边|上|下|间))",
            # 5. "XX的XX" 所有格地点（她的小屋 / 父亲的办公室）
            r"的([一-鿿]{2,6}(?:厅|室|园|房|院|楼|街|店|馆|屋|所|家|铺|坊|栈|庄|阁|堂|庙|寺|宫|殿))",
        ]
        for p in patterns:
            m = re.search(p, text)
            if m:
                if m.lastindex:
                    name = m.group(1).strip() if m.group(1) else m.group(0).strip()
                else:
                    name = m.group(0).strip()
                # 过滤掉太短或明显不是地名的
                if name and len(name) >= 2 and name not in ("了", "到", "的", "在"):
                    # 去掉句号、逗号等标点
                    name = re.sub(r'[，。！？、；：""''（）\s]', '', name)
                    if len(name) >= 2:
                        return name
        return None

    @classmethod
    def _extract_time(cls, text: str) -> str:
        """从文本推断场景发生时间（扩展关键词 + 比例判定）"""
        if not text:
            return "日"

        night_kw = [
            "夜", "晚", "灯", "月", "星", "宵", "午夜", "凌晨", "半夜",
            "三更", "深更", "黑", "暗夜", "夜色", "月光", "星辰", "繁星",
            "灯火", "烛光", "路灯", "霓虹", "篝火", "晚饭", "晚餐",
            "入睡", "躺下", "床上", "被窝", "困意", "呵欠", "疲惫不堪",
        ]
        morning_kw = [
            "晨", "早", "日出", "天亮", "拂晓", "黎明", "清晨", "早晨",
            "朝阳", "晨曦", "早饭", "早餐", "起床", "睡醒", "睁眼",
        ]
        dusk_kw = [
            "黄昏", "傍晚", "日落", "暮", "夕", "入夜", "夕阳", "暮色",
            "晚霞", "余晖", "晚饭后", "夜幕降临", "华灯初上", "天色渐暗",
        ]

        night_score = sum(1 for w in night_kw if w in text)
        morning_score = sum(1 for w in morning_kw if w in text)
        dusk_score = sum(1 for w in dusk_kw if w in text)

        # 取最高分
        if night_score > morning_score and night_score > dusk_score:
            return "夜"
        if morning_score > night_score and morning_score > dusk_score:
            return "晨"
        if dusk_score > night_score and dusk_score > morning_score:
            return "昏"

        # 分值相同 → 按优先级：日 > 夜 > 晨 > 昏
        if night_score > 0:
            return "夜"
        if morning_score > 0:
            return "晨"
        return "日"


# ═══════════════════════════════════════════════════════════
# Scene Agent
# ═══════════════════════════════════════════════════════════

class SceneAgent(BaseAgent[Dict[str, Any]]):

    _model_state: Optional[Dict[str, Any]] = None

    @property
    def agent_name(self) -> str:
        return "scene_agent"

    @property
    def system_prompt(self) -> str:
        return "你是一位影视分场专家。根据文本识别场景边界，判断 timeline_mode，提取出场角色。"

    def set_model_config(self, state: Dict[str, Any]):
        """从 processor 注入 model_config（enrich_single_scene 没有 state 参数）"""
        self._model_state = state

    # ═══════════════════════════════════
    # Public API (processor 直接调用，支持进度报告)
    # ═══════════════════════════════════

    def segment_all(self, chapters: List[Dict], entity_map: Dict, story: Dict) -> List[Dict]:
        """确定性切分（公开方法，processor 分步调用）"""
        return self._segment(chapters, entity_map, story)

    async def enrich_single_scene(self, scene: Dict) -> bool:
        """润色单个场景元数据。返回 True=成功。"""
        try:
            return await self._enrich_one(scene)
        except Exception:
            return False

    # ═══════════════════════════════════
    # REAL_PATH / MOCK_PATH
    # ═══════════════════════════════════

    async def _run_real(self, state: Dict[str, Any]) -> Dict[str, Any]:
        self._model_state = state
        chapters = state.get("chapters", [])
        scenes = self._segment(chapters, state.get("entity_map", {}), state.get("story_analysis", {}))
        if not scenes:
            return {"scenes": [], "scene_version": 0}
        try:
            for s in scenes[:3]:
                await self._enrich_one(s)
        except Exception:
            pass
        return {"scenes": scenes, "scene_version": state.get("scene_version", 1)}

    async def _run_mock(self, state: Dict[str, Any]) -> Dict[str, Any]:
        scenes = self._segment(state.get("chapters", []), state.get("entity_map", {}), state.get("story_analysis", {}))
        return {"scenes": scenes, "scene_version": 1}

    # ═══════════════════════════════════
    # 核心分场逻辑
    # ═══════════════════════════════════

    # 场景粒度阈值
    ACCUMULATE_THRESHOLD = 30   # 低于此字数的段落无条件累积
    MIN_BEATABLE_CHARS = 120    # 低于此字数无法生成高质量节拍，继续合并
    TARGET_SCENE_MIN = 150      # 目标场景最低字数
    TARGET_SCENE_MAX = 800      # 超过此字数考虑拆分
    FORCE_SPLIT_CHARS = 3000    # 强制拆分上限

    def _segment(self, chapters: List[Dict], entity_map: Dict, story: Dict) -> List[Dict]:
        scenes = []
        scene_num = 0
        current_text = ""
        current_paragraphs: List[str] = []   # 追踪原始段落
        current_loc = ""
        current_time = "日"
        current_mode = "sequential"
        prev_loc = ""
        prev_time = ""

        def _save_scene(reason: str, markers: List[str]):
            nonlocal scene_num, current_text, current_paragraphs, current_loc, current_time, current_mode, prev_loc, prev_time
            if not current_text.strip():
                return
            scene_num += 1
            scenes.append(self._make_scene(
                scene_num, ch_idx, current_text.strip(),
                current_loc, current_time, current_mode,
                entity_map, reason, markers,
                source_paragraphs=list(current_paragraphs)
            ))
            current_text = ""
            current_paragraphs = []

        for chapter in chapters:
            raw = chapter.get("raw_text", "")
            if not raw: continue
            ch_idx = chapter.get("chapter_index", 0)

            paragraphs = self._split_paragraphs(raw)

            for para in paragraphs:
                # —— 短段落无条件累积 ——
                if len(para) < self.ACCUMULATE_THRESHOLD:
                    current_text += para + "\n"
                    current_paragraphs.append(para)
                    if not current_loc:
                        current_loc = LocationExtractor.extract(para)[0]
                        current_time = LocationExtractor.extract(para)[1]
                    continue

                # —— 检测分场类型 ——
                mode, loc_hint, markers = SceneSegmentationDetector.detect(para)
                loc, time = LocationExtractor.extract(para)

                # 强信号（叙事模式切换、章节边界）→ 无视最低字数限制直接切
                strong_signal = (mode != "sequential" and mode not in ("location_shift", "time_shift"))
                significant_location = (loc != prev_loc and prev_loc and self._significant_location_change(loc, prev_loc))
                significant_time = (time != prev_time and prev_time)

                # —— 切分判定 ——
                should_split = False
                reason = ""

                if strong_signal:
                    # 闪回/蒙太奇/平行时空 → 无条件切分
                    should_split = True
                    reason = f"叙事模式切换: {mode}"
                elif len(current_text) >= self.TARGET_SCENE_MIN and (significant_location or significant_time):
                    # 累积够目标字数 + 时空变化 → 切分
                    should_split = True
                    mode = "location_shift" if significant_location else "time_shift"
                    reason = f"地点变化: {prev_loc} → {loc}" if significant_location else f"时间变化: {prev_time} → {time}"
                elif len(current_text) > self.TARGET_SCENE_MAX and (significant_location or significant_time or len(current_text) > self.TARGET_SCENE_MAX * 1.5):
                    # 超过800字且有变化信号，或超过1200字 → 切分
                    should_split = True
                    reason = f"场景过长切分({len(current_text)}字)"
                elif len(current_text) > self.FORCE_SPLIT_CHARS:
                    # 3000字硬上限
                    should_split = True
                    reason = "强制切分(超3000字)"

                if should_split:
                    _save_scene(reason, markers)
                    current_loc = loc
                    current_time = time
                    current_mode = mode
                    prev_loc = loc
                    prev_time = time

                if not current_text:
                    current_loc = loc
                    current_time = time
                    current_mode = mode
                    prev_loc = loc
                    prev_time = time

                current_text += para + "\n"
                current_paragraphs.append(para)

            # 章末保存
            if current_text.strip():
                _save_scene("章末切分", [])

        return scenes

    def _make_scene(self, num: int, chapter: int, text: str,
                     loc: str, time: str, mode: str,
                     entity_map: Dict, reason: str, markers: List[str],
                     source_paragraphs: List[str] | None = None) -> Dict:
        """构建完整 Scene 字典，含质量评分"""
        cast = self._find_cast(text, entity_map)
        summary = text.replace("\n", " ")
        char_count = len(text)
        dialogue_hints = text.count('"') // 2 + text.count('"') // 2 + text.count('"') // 2  # 引号对数

        # ── 从完整场景文本重新提取地点和时间（比单段落触发词更准确）──
        full_loc, full_time = LocationExtractor.extract(text)
        # 优先用全文本提取结果；如果全文本结果是兜底值而单段落更具体，则保留单段落
        if full_loc and full_loc not in ("室内", "室外"):
            loc = full_loc
        elif loc in ("室内", "室外") and full_loc not in ("室内", "室外"):
            loc = full_loc
        if full_time and full_time != "日" or (time == "日" and full_time != "日"):
            time = full_time

        # 场景标题
        if mode == "location_shift":
            title = f"转场至 {loc}"
        elif mode == "time_shift":
            title = f"{loc} · {time}"
        elif mode == "flashback":
            title = f"闪回 · {loc}"
        elif mode == "montage":
            title = "蒙太奇段落"
        elif mode == "simultaneous":
            title = f"平行时空 · {loc}"
        else:
            title = loc

        # — Script Quality Score (剧本导向) —
        events = self._extract_key_events(text)
        quality = self._compute_script_quality(text, char_count, len(cast), dialogue_hints, mode, events)

        return {
            "scene_id": f"SC_{chapter + 1:03d}_{num:02d}",
            "scene_number": num,
            "episode_id": f"EP_{chapter + 1:03d}",
            "chapter_index": chapter,
            "title": title,
            "summary": summary,
            "purpose": self._infer_purpose(text),
            "location": loc,
            "location_type": LocationExtractor.classify_indoor_outdoor(loc),
            "time": time,
            "time_of_day": time,                       # Frontend SceneUIModel compat
            "timeline_mode": mode,
            "conflict_level": self._estimate_conflict(text),
            "emotional_tone": self._estimate_emotion(text),
            "objective": self._infer_objective(text),
            "cast": cast,
            "character_ids": cast,                     # Frontend SceneUIModel compat
            "scene_score": quality.get("quality_score", 0),  # Frontend SceneUIModel compat
            "raw_scene_text_block": text,
            "segmentation_reason": {
                "reason_text": reason,
                "mode": mode,
                "markers": markers,
                "objective_changed": "目标" in reason,
                "conflict_changed": "冲突" in reason,
                "score": 0.5,
            },
            "source_chapters": [chapter],
            "source_paragraphs": source_paragraphs or [],
            "quality": quality,
            "key_events": events,
            "beats": [],
        }

    def _extract_key_events(self, text: str) -> List[str]:
        """从文本中抽取关键叙事事件"""
        events = []
        for m in re.finditer(r'(?:回到|走进|离开|推开|关上|坐下|站起|跑[向去]|拿起|放下|转身|回头|想起|回忆|发现|看到|听见|哭泣|流泪|笑[了出]|颤抖|僵住|瘫坐|滑落|质问|争吵|对峙|推搡)', text):
            s = max(0, m.start() - 5); e = min(len(text), m.end() + 15)
            ctx = text[s:e].strip()
            if ctx and ctx not in events: events.append(ctx)
        for m in re.finditer(r'[“”「」]([^“”「」]{4,40})[“”「」]', text):
            line = m.group(1).strip()
            if line and f"对白:{line}" not in events: events.append(f"对白: {line}")
        seen = set(); unique = []
        for e in events:
            k = e[:20]
            if k not in seen: seen.add(k); unique.append(e)
        return unique[:8]

    def _compute_script_quality(self, text: str, char_count: int, char_num: int,
                                 dialogue_hints: int, mode: str, events: List[str]) -> Dict:
        """剧本导向评分: structure 25% + character 20% + conflict 20% + action 15% + dialogue 20%"""
        conflict = self._estimate_conflict(text)
        has_setup = bool(re.search(r'(?:回到|走进|来到|坐在|站在)', text))
        has_turn = bool(re.search(r'(?:突然|忽然|却[在是]|竟然|没想到|发现|得知|原来)', text))
        has_end = bool(re.search(r'(?:离开|转身|离[去开]|结束|沉默|安静|慢慢)', text))
        structure_score = 0.3 * has_setup + 0.4 * has_turn + 0.3 * has_end

        char_score = min(1.0, char_num / 3.0)
        has_confrontation = any(w in text for w in ["质问","争吵","对峙","推搡","冷战","不满","争辩","摔门"])
        conflict_score = 0.6 * conflict + 0.4 * has_confrontation

        action_verbs = len(re.findall(r'(?:站|坐|走|跑|推|拉|拿|放|转身|回头|抬[头手]|低[头下]|攥|握|颤|抖|僵|滑|落|流)', text))
        action_score = min(1.0, action_verbs / max(1, char_count / 30))

        dialogue_density = min(1.0, dialogue_hints / max(1, char_count / 60))
        subtext_hints = bool(re.search(r'(?:低声|沉默|犹豫|勉强|苦笑|叹气|不再|终究|其实)', text))
        dialogue_score = 0.6 * dialogue_density + 0.4 * subtext_hints

        total = round(0.25*structure_score + 0.20*char_score + 0.20*conflict_score + 0.15*action_score + 0.20*dialogue_score, 3)
        grade = "A" if total >= 0.8 else ("B" if total >= 0.65 else ("C" if total >= 0.5 else "D"))
        return {
            "quality_score": total, "grade": grade,
            "breakdown": {"structure":round(structure_score,2),"character_interaction":round(char_score,2),"conflict":round(conflict_score,2),"visual_action":round(action_score,2),"dialogue":round(dialogue_score,2)},
            "char_count": char_count, "character_count": char_num, "dialogue_hints": dialogue_hints,
            "event_count": len(events),
            "has_structure": {"setup":has_setup,"turn":has_turn,"end":has_end},
        }

    # ═══════════════════════════════════════
    # 辅助函数
    # ═══════════════════════════════════════

    def _split_paragraphs(self, raw: str) -> List[str]:
        paras = [p.strip() for p in raw.split("\n") if p.strip()]
        if not paras:
            # 单段长文本按句号切
            parts = re.split(r"(?<=[。！？.!?])", raw)
            paras = []
            buf = ""
            for s in parts:
                buf += s
                if len(buf) > 150:
                    paras.append(buf.strip())
                    buf = ""
            if buf.strip(): paras.append(buf.strip())
        return paras

    def _significant_location_change(self, new_loc: str, old_loc: str) -> bool:
        """判断地点变化是否显著（排除同一地点的近义词）"""
        new_clean = re.sub(r'INT\.|EXT\.|\s', '', new_loc)
        old_clean = re.sub(r'INT\.|EXT\.|\s', '', old_loc)
        return new_clean != old_clean

    def _find_cast(self, text: str, entity_map: Dict) -> List[str]:
        found = set()
        for alias, cid in entity_map.items():
            if alias in text:
                found.add(cid)
        return list(found)

    def _estimate_conflict(self, text: str) -> float:
        high = ["争吵", "冲突", "打斗", "质问", "摔门", "怒吼", "拔剑", "杀", "死", "哭喊", "逃", "拔刀", "开枪"]
        medium = ["对峙", "冷战", "矛盾", "争辩", "僵持", "不满", "推搡", "指责"]
        if any(w in text for w in high): return 0.85
        if any(w in text for w in medium): return 0.55
        return 0.25

    def _estimate_emotion(self, text: str) -> str:
        map_emo = [
            (["哭泣", "泪", "悲伤", "痛苦", "绝望", "崩溃"], "悲伤"),
            (["愤怒", "怒吼", "恨", "暴怒", "咆哮"], "愤怒"),
            (["恐惧", "害怕", "颤抖", "惊慌", "惊恐"], "恐惧"),
            (["喜悦", "高兴", "笑", "幸福", "兴奋", "欢笑"], "喜悦"),
            (["紧张", "焦虑", "不安", "担忧", "压抑"], "紧张"),
            (["温暖", "感动", "温馨", "柔情", "温柔"], "温暖"),
            (["震惊", "惊愕", "难以置信", "错愕"], "震惊"),
        ]
        for keywords, emotion in map_emo:
            if any(k in text for k in keywords): return emotion
        return "中性"

    def _infer_objective(self, text: str) -> str:
        m = re.search(r"(?:为了|想要|决定|必须|一定要)(.{2,20})[，。]", text)
        return f"为了{m.group(1)}" if m else "推进剧情发展"

    def _infer_purpose(self, text: str) -> str:
        if any(w in text for w in ["争吵", "对峙", "冲突"]): return "展现人物冲突"
        if any(w in text for w in ["想起", "回忆", "那年", "曾经"]): return "揭示角色过往"
        if any(w in text for w in ["决定", "选择", "离开", "出发"]): return "角色做出关键决定"
        if any(w in text for w in ["发现", "得知", "真相", "原来"]): return "揭示关键信息"
        return "推进叙事"

    # ═══════════════════════════════════════
    # DeepSeek 润色
    # ═══════════════════════════════════════

    async def _enrich_one(self, scene: Dict) -> bool:
        """润色单个场景元数据（含地点/时间 AI 推断）。返回 True=成功。"""
        text = scene.get("raw_scene_text_block", "")
        sid = scene.get("scene_id", "?")
        if len(text) < 50:
            print(f"[ENRICH] {sid} SKIP — text too short ({len(text)} chars)")
            return False
        state = self._model_state or {}
        try:
            client = self._get_raw_client(state)
        except Exception as e:
            print(f"[ENRICH] {sid} FAIL — no client: {e}")
            return False
        model = self._get_model_name(state)
        print(f"[ENRICH] {sid} calling {model} (chars={len(text)})...")
        prompt = f"""分析这段场景文本，返回纯JSON:

{{
  "summary": "场景内容摘要（保留关键细节和人物动作）",
  "purpose": "此场景的戏剧目的（如：展现冲突 / 揭示信息 / 角色成长 / 推进叙事）",
  "emotional_tone": "整体情绪基调（如：紧张 / 悲伤 / 温暖 / 悬疑 / 愤怒 / 中性）",
  "location": "具体地点名称（如：林家客厅 / 街头 / 警察局审讯室 / 花园，不要只说室内或室外）",
  "time_of_day": "场景发生时段（日 / 夜 / 晨 / 昏 / 午后）",
  "breakdown": {{
    "props": ["道具列表，如：带血账本、青瓷茶杯、手枪"],
    "wardrobe": ["特殊服装/化妆要求，如：破损夜行衣、脸上旧伤疤"],
    "extras": ["群演/特约演员，如：家丁3男2女、带刀侍卫"],
    "stunts": ["动作/特技需求，如：威亚打斗、追车"],
    "vfx": ["视觉特效需求，如：绿幕、爆炸、窗外悬浮列车"],
    "special_equipment": ["特殊设备需求，如：水下摄影、摇臂、航拍"]
  }}
}}

要求：
- 只列出文本中实际出现或明确暗示的内容，没有的用空数组[]
- props 列出关键道具、武器、物品
- wardrobe 列出特殊服装、化妆、造型要求
- extras 估算群演类型和大致人数
- stunts/vfx/special_equipment 根据动作描写、环境描述推断技术需求

场景文本:
{text[:1500]}"""
        try:
            resp = await asyncio.wait_for(
                client.chat.completions.create(model=model,
                    messages=[{"role":"user","content":prompt}],
                    temperature=0.4, max_tokens=500, timeout=15.0),
                timeout=20.0)
            content = resp.choices[0].message.content or "{}"
            content = content.strip()
            if content.startswith("```"): content = "\n".join(l for l in content.split("\n") if not l.strip().startswith("```"))
            s = content.find("{"); e = content.rfind("}") + 1
            if s >= 0 and e > s:
                d = json.loads(content[s:e])
                if d.get("summary") and len(d["summary"]) > len(scene.get("summary","")): scene["summary"] = d["summary"]
                if d.get("purpose"): scene["purpose"] = d["purpose"]
                if d.get("emotional_tone"): scene["emotional_tone"] = d["emotional_tone"]
                # AI 推断地点和时间，替换规则引擎的默认值
                if d.get("location"):
                    scene["location"] = d["location"]
                    scene["location_type"] = LocationExtractor.classify_indoor_outdoor(d["location"])
                if d.get("time_of_day"):
                    scene["time"] = d["time_of_day"]
                    scene["time_of_day"] = d["time_of_day"]
                # 剧本拆解字段
                bd = d.get("breakdown", {})
                if bd:
                    scene["breakdown"] = {
                        "props": bd.get("props", []) or [],
                        "wardrobe": bd.get("wardrobe", []) or [],
                        "extras": bd.get("extras", []) or [],
                        "stunts": bd.get("stunts", []) or [],
                        "vfx": bd.get("vfx", []) or [],
                        "special_equipment": bd.get("special_equipment", []) or [],
                    }
                scene["estimated_pages"] = round(max(0.25, len(text) / 500), 2)  # ~500字/页
                print(f"[ENRICH] {sid} OK → location={scene.get('location')} time={scene.get('time')} props={len(scene.get('breakdown',{}).get('props',[]))} stunts={len(scene.get('breakdown',{}).get('stunts',[]))}")
            else:
                print(f"[ENRICH] {sid} WARN — no JSON found in response: {content[:80]}")
            return True
        except Exception as e:
            print(f"[ENRICH] {sid} FAIL — {type(e).__name__}: {str(e)[:120]}")
            return False
