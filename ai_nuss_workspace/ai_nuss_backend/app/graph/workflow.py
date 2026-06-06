"""
AI-NUSS 3.0 — LangGraph DAG Workflow Topology
Chapter 5: Full state-machine graph with conditional routing.

PHASE P2: Complete graph definition with nodes, edges, and conditional routers.
Nodes delegate to Kernel (deterministic) or Agents (LLM).
"""
from typing import Dict, Any, Literal
from app.graph.state import AINUSSState
from app.core.config import settings


# ═══════════════════════════════════════════════════════════════════════
# Graph Node Functions (thin wrappers — logic lives in kernel.py & agents)
# ═══════════════════════════════════════════════════════════════════════

async def node_parse_document(state: AINUSSState) -> AINUSSState:
    """
    Node: Document Parser (Module 1).
    Pure Python rule-based chapter splitting.
    """
    from app.core.kernel import _step_parse_document
    result = _step_parse_document(dict(state), settings.STUB_MODE)
    return {**state, **result}


async def node_build_bible(state: AINUSSState) -> AINUSSState:
    """
    Node: Story Bible Builder (Module 2).
    Delegates to BibleAgent which respects stub_mode routing.
    """
    from app.graph.agents.bible_agent import BibleAgent
    agent = BibleAgent()
    output = await agent.run(dict(state))
    if output.success and output.data:
        state["story_bible"] = output.data.get("story_bible", state.get("story_bible", {}))
        state["story_bible_version"] = output.data.get("story_bible_version", state.get("story_bible_version", 1))
    state["review_status"] = "analyzing"
    return state


async def node_resolve_characters(state: AINUSSState) -> AINUSSState:
    """
    Node: Character Resolver (Module 3).
    Delegates to CharacterAgent. May trigger STATE_C if confidence < threshold.
    """
    from app.graph.agents.character_agent import CharacterAgent
    agent = CharacterAgent()
    output = await agent.run(dict(state))
    if output.success and output.data:
        state["entity_map"] = output.data.get("entity_map", state.get("entity_map", {}))
        state["entity_map_version"] = output.data.get("entity_map_version", state.get("entity_map_version", 1))
        state["master_cast_list"] = output.data.get("master_cast_list", state.get("master_cast_list", []))

        if output.data.get("requires_review"):
            state["review_status"] = "pending_character"
        else:
            state["review_status"] = "analyzing"
    return state


async def node_segment_scenes(state: AINUSSState) -> AINUSSState:
    """
    Node: Scene Segmentation (Module 4).
    Uses deterministic kernel scoring + optional LLM refinement.
    """
    from app.graph.agents.scene_agent import SceneAgent
    agent = SceneAgent()
    output = await agent.run(dict(state))
    if output.success and output.data:
        state["scenes"] = output.data.get("scenes", state.get("scenes", []))
        state["scene_version"] = output.data.get("scene_version", state.get("scene_version", 1))
    state["review_status"] = "generating"
    return state


async def node_extract_beats_and_screenplay(state: AINUSSState) -> AINUSSState:
    """
    Node: Beat Extraction + Screenplay Generation (Modules 5 & 6).
    Combined into one node because beats and screenplay are tightly coupled.
    Delegates to ScreenplayAgent.
    """
    from app.graph.agents.screenplay_agent import ScreenplayAgent
    agent = ScreenplayAgent()
    output = await agent.run(dict(state))
    if output.success and output.data:
        state["beats"] = output.data.get("beats", state.get("beats", []))
        state["screenplay"] = output.data.get("screenplay", state.get("screenplay", {}))

        # Attach beats to their parent scenes
        beats_by_scene: Dict[str, list] = {}
        for beat in state["beats"]:
            sid = beat.get("scene_id", "")
            beats_by_scene.setdefault(sid, []).append(beat)
        for scene in state.get("scenes", []):
            sid = scene.get("scene_id", "")
            scene["beats"] = beats_by_scene.get(sid, [])

    state["review_status"] = "completed"
    return state


async def node_handle_review(state: AINUSSState) -> AINUSSState:
    """
    Node: Human Review Interrupt Handler (STATE_C).
    Waits for external review signal before proceeding.
    This node is a no-op in the graph — the actual review is triggered
    via REST API (POST /review/*) which updates state in PostgreSQL.
    """
    # The review status is updated externally via the REST API.
    # This node simply passes through.
    return state


# ═══════════════════════════════════════════════════════════════════════
# Conditional Edge Routers
# ═══════════════════════════════════════════════════════════════════════

def router_after_characters(state: AINUSSState) -> Literal["segment_scenes", "handle_review"]:
    """
    After character resolution, check if human review is needed.
    If confidence is low → route to review interrupt.
    Otherwise → continue to scene segmentation.
    """
    if state.get("review_status") == "pending_character":
        return "handle_review"
    return "segment_scenes"


def router_after_review(state: AINUSSState) -> Literal["segment_scenes", "handle_review"]:
    """
    After review handling, check if we can proceed.
    If review resolved the issues → continue.
    Otherwise → stay in review.
    """
    status = state.get("review_status", "")
    if status in ("pending_character", "pending_scene"):
        return "handle_review"
    return "segment_scenes"


# ═══════════════════════════════════════════════════════════════════════
# Graph Builder
# ═══════════════════════════════════════════════════════════════════════

def build_ainuss_graph():
    """
    Build and return the complete LangGraph StateGraph.

    Graph topology (DAG with conditional branches):

      parse_document
           │
      build_bible
           │
      resolve_characters
           │
           ├──[confidence OK]──→ segment_scenes
           │                          │
           └──[low confidence]──→ handle_review ──→ (back to segment_scenes)
                                                        │
                                              extract_beats_and_screenplay
                                                        │
                                                    [completed]

    PHASE P2: Full graph with LangGraph.
    PHASE P1 stub: Returns graph structure; actual execution via kernel loop.
    """
    try:
        from langgraph.graph import StateGraph, END

        workflow = StateGraph(AINUSSState)

        # Add nodes
        workflow.add_node("parse_document", node_parse_document)
        workflow.add_node("build_bible", node_build_bible)
        workflow.add_node("resolve_characters", node_resolve_characters)
        workflow.add_node("segment_scenes", node_segment_scenes)
        workflow.add_node("extract_beats_and_screenplay", node_extract_beats_and_screenplay)
        workflow.add_node("handle_review", node_handle_review)

        # Set entry point
        workflow.set_entry_point("parse_document")

        # Add edges
        workflow.add_edge("parse_document", "build_bible")
        workflow.add_edge("build_bible", "resolve_characters")

        # Conditional branch after character resolution
        workflow.add_conditional_edges(
            "resolve_characters",
            router_after_characters,
            {
                "segment_scenes": "segment_scenes",
                "handle_review": "handle_review",
            },
        )

        # After review, route back or continue
        workflow.add_conditional_edges(
            "handle_review",
            router_after_review,
            {
                "segment_scenes": "segment_scenes",
                "handle_review": "handle_review",
            },
        )

        # Linear tail
        workflow.add_edge("segment_scenes", "extract_beats_and_screenplay")
        workflow.add_edge("extract_beats_and_screenplay", END)

        return workflow.compile()

    except ImportError:
        # LangGraph not installed — return None (kernel loop used instead)
        return None


# ═══════════════════════════════════════════════════════════════════════
# Convenience: Execute full pipeline (synchronous wrapper for kernel loop)
# ═══════════════════════════════════════════════════════════════════════

async def execute_workflow(state: AINUSSState) -> AINUSSState:
    """
    Execute the full narrative pipeline.
    Tries LangGraph first; falls back to pure kernel loop.
    PHASE P1: Uses kernel loop exclusively.
    PHASE P2+: Uses LangGraph graph when available.
    """
    graph = build_ainuss_graph()

    if graph is not None:
        # LangGraph path
        final_state = await graph.ainvoke(state)
        return final_state
    else:
        # Fallback: Pure kernel loop
        from app.core.kernel import execute_narrative_kernel_loop
        result = execute_narrative_kernel_loop(dict(state), {"MOCK_MODE": settings.STUB_MODE})
        return {**state, **result}
