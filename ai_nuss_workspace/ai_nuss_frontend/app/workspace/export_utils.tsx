/**
 * AI-NUSS 3.0 — Professional Export Engine
 * WYSIWYG: 复用 PrintScreenplay 排版 → 浏览器渲染 → PDF/Word
 */
import React from "react";
import { createRoot, Root } from "react-dom/client";
import type { SceneUIModel } from "../api_client";
import PrintScreenplay from "./PrintScreenplay";

// ═══════════════════════════════════════════════════════
// HTML → File download helper
// ═══════════════════════════════════════════════════════

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════
// Render PrintScreenplay to DOM → capture → cleanup
// ═══════════════════════════════════════════════════════

function renderToDOM(scenes: SceneUIModel[], includeDirector: boolean, singleScene: boolean): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "840px"; // A4-like width
  container.style.backgroundColor = "#ffffff";
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(
    <PrintScreenplay scenes={scenes} includeDirector={includeDirector} singleScene={singleScene} forExport />
  );
  return { container, root };
}

function cleanupRender(container: HTMLDivElement, root: Root) {
  setTimeout(() => {
    root.unmount();
    if (container.parentNode) container.parentNode.removeChild(container);
  }, 100);
}

// ═══════════════════════════════════════════════════════
// Export: TXT (plain text — fallback)
// ═══════════════════════════════════════════════════════

export function exportTXT(scenes: SceneUIModel[]): void {
  const lines: string[] = [];
  for (const s of scenes) {
    const time = (s as Record<string, unknown>).time as string || s.time_of_day || "日";
    lines.push(`第${s.scene_number}场  ${s.location} — ${time}`);
    const beats = (s.beats || []) as Array<Record<string, unknown>>;
    for (const b of beats) {
      const actions = (b.actions || []) as Array<{ character_id?: string; description: string }>;
      const dialogues = (b.dialogues || []) as Array<{ speaker_id?: string; line?: string; emotion?: string }>;
      const voiceOvers = (b.voice_overs || []) as Array<{ character_id?: string; content: string }>;
      for (const a of actions) lines.push(a.character_id ? `[${a.character_id}] ${a.description}` : a.description);
      for (const d of dialogues) {
        lines.push(`          ${d.speaker_id || "?"}${d.emotion ? ` (${d.emotion})` : ""}`);
        lines.push(`          ${d.line || "..."}`);
      }
      for (const v of voiceOvers) {
        lines.push(`          ${v.character_id || "?"} (画外音)`);
        lines.push(`          ${v.content}`);
      }
    }
    lines.push("");
  }
  downloadFile(lines.join("\n"), "screenplay.txt", "text/plain;charset=utf-8");
}

// ═══════════════════════════════════════════════════════
// Export: YAML — 仅剧本，不含批注
// ═══════════════════════════════════════════════════════

export function exportYAML(scenes: SceneUIModel[]): void {
  const lines: string[] = ["# AI-NUSS 3.0 剧本导出", `# 生成时间: ${new Date().toISOString()}`, ""];
  for (const s of scenes) {
    const time = (s as Record<string, unknown>).time as string || s.time_of_day || "日";
    lines.push(`scene_${s.scene_number}:`);
    lines.push(`  scene_id: "${s.scene_id}"`);
    lines.push(`  location: "${s.location}"`);
    lines.push(`  time: "${time}"`);
    lines.push(`  summary: "${(s.summary || "").replace(/"/g, '\\"')}"`);
    const beats = (s.beats || []) as Array<Record<string, unknown>>;
    if (beats.length > 0) {
      lines.push("  beats:");
      for (const b of beats) {
        lines.push(`    - beat_type: "${b.beat_type}"`);
        if (b.summary) lines.push(`      summary: "${(b.summary as string).replace(/"/g, '\\"')}"`);
        const actions = (b.actions || []) as Array<{ description: string }>;
        const dialogues = (b.dialogues || []) as Array<{ line: string }>;
        if (actions.length > 0) lines.push(`      actions: [${actions.map(a => `"${a.description.replace(/"/g, '\\"')}"`).join(", ")}]`);
        if (dialogues.length > 0) lines.push(`      dialogues: [${dialogues.map(d => `"${(d.line || "").replace(/"/g, '\\"')}"`).join(", ")}]`);
      }
    }
    lines.push("");
  }
  downloadFile(lines.join("\n"), "screenplay.yaml", "text/yaml;charset=utf-8");
}

// ═══════════════════════════════════════════════════════
// Export: PDF — 浏览器渲染 WYSIWYG
// ═══════════════════════════════════════════════════════

export async function exportPDF(scenes: SceneUIModel[], includeDirector: boolean, singleScene: boolean): Promise<void> {
  const { container, root } = renderToDOM(scenes, includeDirector, singleScene);
  // 等待渲染完成
  await new Promise(r => setTimeout(r, 300));

  try {
    const { default: html2canvas } = await import("html2canvas");
    const { default: jsPDF } = await import("jspdf");

    const canvas = await html2canvas(container.firstChild as HTMLElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth() - 16;
    const pageH = pdf.internal.pageSize.getHeight() - 16;
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let position = 8;

    pdf.addImage(imgData, "PNG", 8, position, imgW, imgH);
    heightLeft -= pageH;

    while (heightLeft > 0) {
      position = -pageH + 8;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 8, position, imgW, imgH);
      heightLeft -= pageH;
    }

    const prefix = singleScene ? `scene_${scenes[0]?.scene_number || "X"}` : "screenplay";
    pdf.save(`${prefix}.pdf`);
  } catch (err) {
    console.error("PDF export failed:", err);
    // 降级：HTML
    exportHTML(scenes, includeDirector, singleScene);
  } finally {
    cleanupRender(container, root);
  }
}

// ═══════════════════════════════════════════════════════
// Export: HTML — 完整独立 HTML 文件
// ═══════════════════════════════════════════════════════

export function exportHTML(scenes: SceneUIModel[], includeDirector: boolean, singleScene: boolean): void {
  const { container, root } = renderToDOM(scenes, includeDirector, singleScene);
  setTimeout(() => {
    const html = "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>AI-NUSS 3.0 剧本</title></head><body>" + container.innerHTML + "</body></html>";
    const prefix = singleScene ? `scene_${scenes[0]?.scene_number || "X"}` : "screenplay";
    downloadFile(html, `${prefix}.html`, "text/html;charset=utf-8");
    cleanupRender(container, root);
  }, 500);
}

// ═══════════════════════════════════════════════════════
// Export: Word — 样式系统，接近网页观感
// ═══════════════════════════════════════════════════════

export async function exportWord(scenes: SceneUIModel[], includeDirector: boolean, singleScene: boolean): Promise<void> {
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, convertInchesToTwip } = await import("docx");

    const displayScenes = singleScene && scenes.length > 0 ? [scenes[0]] : scenes;
    const children: Paragraph[] = [];

    // Title
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: "AI-NUSS 3.0 剧本", size: 36, bold: true, font: "SimHei" })],
      })
    );

    type RichBeat = { beat_type?: string; summary?: string; emotion?: string; intensity?: number;
      actions?: Array<{ character_id?: string; description: string }>;
      dialogues?: Array<{ speaker_id?: string; line?: string; emotion?: string; subtext?: string }>;
      voice_overs?: Array<{ character_id?: string; content: string }>;
      inner_monologues?: Array<{ character_id?: string; content: string }>;
      captions?: Array<{ content: string }>;
      flashbacks?: Array<{ content: string }>;
    };

    for (let si = 0; si < displayScenes.length; si++) {
      const s = displayScenes[si];
      const time = (s as Record<string, unknown>).time as string || s.time_of_day || "日";
      const purpose = (s as Record<string, unknown>).purpose as string | undefined;
      const beats = (s.beats || []) as RichBeat[];

      // Scene Title
      children.push(
        new Paragraph({
          spacing: { before: 400, after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CC0000" } },
          children: [
            new TextRun({ text: `第${s.scene_number}场`, bold: true, size: 26, color: "CC0000", font: "SimHei" }),
            new TextRun({ text: `  ${s.location}  —  ${time}`, bold: true, size: 26, font: "SimHei" }),
          ],
        })
      );

      // Scene Summary
      if (purpose) {
        children.push(
          new Paragraph({
            indent: { left: convertInchesToTwip(0.2) },
            spacing: { after: 120 },
            border: { left: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } },
            children: [new TextRun({ text: purpose, italics: true, size: 20, color: "666666" })],
          })
        );
      }

      // Beats
      for (const beat of beats) {
        // Captions
        for (const c of (beat.captions || [])) {
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [new TextRun({ text: c.content || "", bold: true, size: 20 })] }));
        }
        // Flashback transition
        if ((beat.flashbacks || []).length > 0) {
          children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 120 }, children: [new TextRun({ text: "FLASHBACK TO:", bold: true, size: 18, color: "888888" })] }));
        }
        // Actions
        for (const a of (beat.actions || [])) {
          children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 40, after: 40 },
            children: [
              a.character_id ? new TextRun({ text: `[${a.character_id}] `, bold: true, color: "CC0000", size: 21 }) : new TextRun({}),
              new TextRun({ text: a.description, size: 21 }),
            ],
          }));
        }
        // Dialogues
        for (const d of (beat.dialogues || [])) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            indent: { left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) },
            spacing: { before: 60 },
            children: [new TextRun({ text: d.speaker_id || "?", bold: true, size: 21, font: "SimHei" })],
          }));
          if (d.emotion) {
            children.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `(${d.emotion})`, italics: true, size: 18, color: "888888" })],
            }));
          }
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            indent: { left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) },
            spacing: { after: 60 },
            children: [new TextRun({ text: d.line || "...", size: 21 })],
          }));
          if (d.subtext) {
            children.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 20 },
              children: [new TextRun({ text: `[${d.subtext}]`, size: 16, color: "AAAAAA" })],
            }));
          }
        }
        // Voice Overs
        for (const v of (beat.voice_overs || [])) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            indent: { left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) },
            spacing: { before: 60 },
            children: [new TextRun({ text: v.character_id || "?", bold: true, size: 21 }), new TextRun({ text: " (画外音)", italics: true, size: 18, color: "888888" })],
          }));
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            indent: { left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) },
            children: [new TextRun({ text: v.content, italics: true, size: 20, color: "666666" })],
          }));
        }
        // Inner Monologues
        for (const m of (beat.inner_monologues || [])) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            indent: { left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) },
            spacing: { before: 60 },
            children: [new TextRun({ text: m.character_id || "?", bold: true, size: 21 }), new TextRun({ text: " (内心独白)", italics: true, size: 18, color: "888888" })],
          }));
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            indent: { left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) },
            children: [new TextRun({ text: m.content, italics: true, size: 20 })],
          }));
        }
        // Flashback content
        for (const f of (beat.flashbacks || [])) {
          children.push(new Paragraph({
            indent: { left: convertInchesToTwip(0.4) },
            border: { left: { style: BorderStyle.SINGLE, size: 3, color: "DDDDDD" } },
            spacing: { before: 40, after: 40 },
            children: [new TextRun({ text: f.content, italics: true, size: 20, color: "888888" })],
          }));
        }
      }

      // Director Note
      if (includeDirector) {
        const dn = (s as Record<string, unknown>).director_note as Record<string, string | string[]> | undefined;
        if (dn && dn.emotion) {
          children.push(new Paragraph({
            spacing: { before: 160 },
            border: { left: { style: BorderStyle.SINGLE, size: 8, color: "CC0000" } },
            indent: { left: convertInchesToTwip(0.3) },
            children: [new TextRun({ text: "🎬 导演建议", bold: true, size: 18, color: "CC0000" })],
          }));
          children.push(new Paragraph({
            indent: { left: convertInchesToTwip(0.3) },
            spacing: { before: 40 },
            children: [
              new TextRun({ text: `${dn.emotion}  ·  ${dn.visual_style || ""}  ·  ${dn.pacing || ""}`, size: 18, color: "666666" }),
            ],
          }));
          if (Array.isArray(dn.camera_plan)) {
            children.push(new Paragraph({
              indent: { left: convertInchesToTwip(0.3) },
              children: [new TextRun({ text: `镜头: ${(dn.camera_plan as string[]).join(", ")}`, size: 18, color: "666666" })],
            }));
          }
          children.push(new Paragraph({
            indent: { left: convertInchesToTwip(0.3) },
            children: [new TextRun({ text: `💡 ${dn.lighting || ""}  |  🎵 ${dn.music || ""}`, size: 18, color: "666666" })],
          }));
          if (dn.director_comment) {
            children.push(new Paragraph({
              indent: { left: convertInchesToTwip(0.3) },
              children: [new TextRun({ text: `📝 ${dn.director_comment as string}`, italics: true, size: 18, color: "888888" })],
            }));
          }
        }
      }

      // Separator between scenes
      if (si < displayScenes.length - 1) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          children: [new TextRun({ text: "·  ·  ·", size: 20, color: "CCCCCC" })],
        }));
      }
    }

    // End marker
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [new TextRun({ text: "FADE OUT.", bold: true, size: 18, color: "888888" })],
    }));

    const doc = new Document({ sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) } } },
      children,
    }] });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const prefix = singleScene ? `scene_${displayScenes[0]?.scene_number || "X"}` : "screenplay";
    a.href = url; a.download = `${prefix}.docx`; a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Word export failed:", err);
    exportHTML(scenes, includeDirector, singleScene);
  }
}

// Re-export for compatibility
export { PrintScreenplay };
